import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { createRequestLimiter, previewRequestLimiter } from '../middleware/rateLimit';
import {
  createRequestSchema,
  listRequestsQuerySchema,
  uuidParamSchema
} from '../schemas';
import { createRun } from '../services/runService';
import { supabase } from '../db/supabase';
import { heuristicParseRequest } from '../agents/heuristicParser';
import {
  isBlocked,
  assertBudgetAvailable,
  computeRequiredRoute,
  matchCatalogItems,
  recomputeTotal
} from '../guardrails';

const router = Router();

// Deterministic Pre-flight Preview (POST /api/requests/preview)
// No LLM, no database writes, rate-limited, reads policy/budget/catalog
router.post(
  '/preview',
  requireAuth,
  previewRequestLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { requestText, justification } = req.body;
      const text = String(requestText || '').trim();
      const user = req.user!;

      if (!text) {
        res.json({
          category: null,
          estimatedCostRange: null,
          expectedRoute: null,
          warnings: []
        });
        return;
      }

      // 1. Heuristic parse (deterministic)
      const parsed = heuristicParseRequest(text);
      const warnings: string[] = [];

      // 2. Policy check
      const { data: policyRow } = await supabase
        .from('policies')
        .select('*')
        .eq('category', parsed.category)
        .maybeSingle();

      const policy = policyRow || {
        category: parsed.category,
        auto_approve_limit: 50000,
        manager_limit: 500000,
        min_quotes: 1,
        requires_justification_above: 100000,
        is_blocked: parsed.category === 'Prohibited Items'
      };

      const blocked = isBlocked(policy) || parsed.category === 'Prohibited Items';
      if (blocked) {
        warnings.push(`Category "${parsed.category}" is prohibited by procurement policy.`);
      }

      // 3. Catalog cost estimate
      const primaryItem = parsed.items[0];
      const { data: vendors } = await supabase.from('vendors').select('*').eq('approved', true);
      const { data: catalog } = await supabase
        .from('vendor_catalog')
        .select('*')
        .eq('category', parsed.category);

      const approvedIds = new Set((vendors || []).map((v: any) => v.id));
      const matched = primaryItem
        ? matchCatalogItems(catalog || [], parsed.category, primaryItem.name).filter((c) =>
            approvedIds.has(c.vendor_id)
          )
        : [];

      let minEstimate: number | null = null;
      let maxEstimate: number | null = null;

      if (matched.length > 0 && primaryItem) {
        const totals = matched.map((c) => recomputeTotal(Number(c.unit_price), primaryItem.quantity));
        minEstimate = Math.min(...totals);
        maxEstimate = Math.max(...totals);
      } else if (parsed.statedBudget) {
        minEstimate = parsed.statedBudget;
        maxEstimate = parsed.statedBudget;
      }

      // 4. Budget check
      const { data: budgetRow } = await supabase
        .from('budgets')
        .select('*')
        .eq('department_id', user.departmentId)
        .eq('fiscal_year', 2026)
        .maybeSingle();

      const estimatedTotal = minEstimate ?? parsed.statedBudget ?? 0;
      let budgetAvailable = 0;

      if (budgetRow) {
        const check = assertBudgetAvailable(budgetRow, estimatedTotal);
        budgetAvailable = check.available;
        if (!check.ok) {
          warnings.push(
            `Budget insufficient: available ₹${check.available.toLocaleString(
              'en-IN'
            )} vs estimated ₹${estimatedTotal.toLocaleString('en-IN')}.`
          );
        } else if (check.available < estimatedTotal * 1.2) {
          warnings.push(
            `Budget tight: available ₹${check.available.toLocaleString(
              'en-IN'
            )} is near required ₹${estimatedTotal.toLocaleString('en-IN')}.`
          );
        }
      }

      // 5. Expected Route
      const justificationMissing = !justification || String(justification).trim().length === 0;
      const quotesBelowMin = matched.length < Number(policy.min_quotes);
      const expectedRoute = computeRequiredRoute(estimatedTotal, policy, 'low', {
        justificationMissing,
        quotesBelowMin
      });

      res.json({
        category: parsed.category,
        primaryItem: primaryItem
          ? { name: primaryItem.name, quantity: primaryItem.quantity }
          : null,
        estimatedCostRange:
          minEstimate !== null && maxEstimate !== null
            ? { min: minEstimate, max: maxEstimate }
            : null,
        expectedRoute: blocked ? 'blocked' : expectedRoute,
        budgetAvailable,
        warnings,
        disclaimer: 'Preview only. Final decision is made by the agents.'
      });
    } catch (err: any) {
      res.status(500).json({
        error: { code: 'PREVIEW_FAILED', message: err?.message || 'Failed to generate preview' }
      });
    }
  }
);

router.post(
  '/',
  requireAuth,
  requireRole('employee', 'manager'),
  createRequestLimiter,
  validate({ body: createRequestSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { requestText, urgency, justification } = req.body;
    const user = req.user!;

    try {
      const { requestId, runId } = await createRun({
        requesterId: user.id,
        requesterEmail: user.email,
        departmentId: user.departmentId,
        requestText,
        urgency: urgency || 'normal',
        justification
      });

      res.status(201).json({ requestId, runId });
    } catch (err: any) {
      res.status(500).json({
        error: { code: 'CREATE_REQUEST_FAILED', message: err.message || 'Failed to create request' }
      });
    }
  }
);

router.get(
  '/',
  requireAuth,
  validate({ query: listRequestsQuerySchema }),
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const { status, page = 1, pageSize = 20 } = req.query as any;

    let query = supabase
      .from('purchase_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (user.role === 'employee') {
      query = query.eq('requester_id', user.id);
    } else if (user.role === 'manager') {
      query = query.eq('department_id', user.departmentId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: requests, error } = await query;
    if (error) {
      res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });
      return;
    }

    const allRows = requests || [];
    const total = allRows.length;
    const startIdx = (Number(page) - 1) * Number(pageSize);
    const pagedRows = allRows.slice(startIdx, startIdx + Number(pageSize));

    const { data: allRuns } = await supabase
      .from('agent_runs')
      .select('*')
      .order('started_at', { ascending: false });

    const { data: departments } = await supabase.from('departments').select('*');
    const deptMap = new Map<string, string>(
      (departments || []).map((d: any) => [d.id, d.name])
    );

    const runByRequest = new Map<string, any>();
    for (const r of allRuns || []) {
      if (!runByRequest.has(r.request_id)) {
        runByRequest.set(r.request_id, r);
      }
    }

    const enriched = pagedRows.map((r: any) => {
      const latestRun = runByRequest.get(r.id) || null;
      return {
        ...r,
        request_text: r.raw_text,
        user_id: r.requester_id,
        department_name: deptMap.get(r.department_id) || 'Unknown',
        run_id: latestRun?.id || null,
        latestRun
      };
    });

    res.json({
      requests: enriched,
      total,
      page: Number(page),
      pageSize: Number(pageSize)
    });
  }
);

router.get(
  '/:id',
  requireAuth,
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const requestId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { data: request, error } = await supabase
      .from('purchase_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    if (error || !request) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Request not found' } });
      return;
    }

    if (user.role === 'employee' && request.requester_id !== user.id) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have access to this purchase request' }
      });
      return;
    }
    if (user.role === 'manager' && request.department_id !== user.departmentId) {
      res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'Managers may only access requests within their own department'
        }
      });
      return;
    }

    const { data: runs } = await supabase
      .from('agent_runs')
      .select('*')
      .eq('request_id', request.id)
      .order('started_at', { ascending: false });

    const latestRun = runs?.[0] || null;

    res.json({
      request: {
        ...request,
        request_text: request.raw_text,
        user_id: request.requester_id,
        run_id: latestRun?.id || null
      },
      latestRun
    });
  }
);

export default router;
