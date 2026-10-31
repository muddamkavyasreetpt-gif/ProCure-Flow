import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { approvalDecisionSchema, uuidParamSchema } from '../schemas';
import { supabase, rpcAppendAuditLog } from '../db/supabase';
import { recordStep } from '../services/stepService';
import { orchestrator } from '../agents/orchestrator';
import { computeQuoteSavings } from '../services/savingsService';

const router = Router();

router.get(
  '/',
  requireAuth,
  requireRole('manager', 'finance'),
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const { data: allApprovals, error } = await supabase
      .from('approvals')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });
      return;
    }

    const { data: requests } = await supabase.from('purchase_requests').select('*');
    const { data: runs } = await supabase.from('agent_runs').select('*');
    const { data: users } = await supabase
      .from('users')
      .select('id, email, full_name, role, department_id');
    const { data: departments } = await supabase.from('departments').select('*');

    const reqMap = new Map<string, any>((requests || []).map((r: any) => [r.id, r]));
    const runMap = new Map<string, any>((runs || []).map((r: any) => [r.id, r]));
    const userMap = new Map<string, any>((users || []).map((u: any) => [u.id, u]));
    const deptMap = new Map<string, string>((departments || []).map((d: any) => [d.id, d.name]));

    const filtered = (allApprovals || []).filter((a: any) => {
      const reqRow = reqMap.get(a.request_id);
      if (!reqRow) return false;
      if (user.role === 'finance') return true;
      // Manager sees manager-level approvals in their own department
      return reqRow.department_id === user.departmentId && a.required_role === 'manager';
    });

    const enriched = filtered.map((a: any) => {
      const reqRow = reqMap.get(a.request_id);
      const runRow = runMap.get(a.run_id);
      const requester = reqRow ? userMap.get(reqRow.requester_id) : null;
      const state = (runRow?.state || {}) as Record<string, any>;
      const selectedQuote = state.selectedQuote || null;
      const consideredVendors = state.consideredVendors || [];
      const amount = Number(selectedQuote?.total ?? reqRow?.estimated_total ?? 0);
      const savings = selectedQuote
        ? computeQuoteSavings(amount, consideredVendors)
        : null;

      return {
        ...a,
        decision: a.status,
        amount,
        requested_by: reqRow?.requester_id || null,
        requester_name: requester?.full_name || requester?.email || 'Employee',
        requester_email: requester?.email || '',
        department_name: reqRow ? deptMap.get(reqRow.department_id) || 'Unknown' : 'Unknown',
        request: reqRow
          ? {
              ...reqRow,
              request_text: reqRow.raw_text
            }
          : null,
        vendorPreview: selectedQuote,
        savings,
        replanCount: runRow?.replan_count || 0
      };
    });

    res.json({ approvals: enriched });
  }
);

router.post(
  '/:id/decide',
  requireAuth,
  requireRole('manager', 'finance'),
  validate({ params: uuidParamSchema, body: approvalDecisionSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const approvalId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { decision, comment } = req.body as {
      decision: 'approved' | 'rejected';
      comment: string;
    };
    const user = req.user!;

    const { data: existing, error: fetchErr } = await supabase
      .from('approvals')
      .select('*')
      .eq('id', approvalId)
      .maybeSingle();

    if (fetchErr || !existing) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Approval not found' }
      });
      return;
    }

    const { data: requestRow } = await supabase
      .from('purchase_requests')
      .select('*')
      .eq('id', existing.request_id)
      .maybeSingle();

    if (!requestRow) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Associated purchase request not found' }
      });
      return;
    }

    // Rule: A user may NEVER approve or reject their own request (return 403)
    if (requestRow.requester_id === user.id) {
      res.status(403).json({
        error: {
          code: 'SELF_APPROVAL_FORBIDDEN',
          message: 'You may not approve or reject your own purchase request'
        }
      });
      return;
    }

    // Rule: Manager can only decide manager-level approvals in their own department
    if (user.role === 'manager') {
      if (existing.required_role !== 'manager') {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'This request requires Finance approval'
          }
        });
        return;
      }
      if (requestRow.department_id !== user.departmentId) {
        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Managers may only decide approvals for their own department'
          }
        });
        return;
      }
    }

    if (existing.status !== 'pending') {
      res.status(409).json({
        error: {
          code: 'ALREADY_DECIDED',
          message: `This approval has already been ${existing.status}`
        }
      });
      return;
    }

    const decidedAt = new Date().toISOString();
    const { data: updatedRows, error: updateErr } = await supabase
      .from('approvals')
      .update({
        status: decision,
        decided_by: user.id,
        comment: comment.trim(),
        decided_at: decidedAt
      })
      .eq('id', approvalId)
      .eq('status', 'pending')
      .select('*');

    const updatedApproval = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;
    if (updateErr || !updatedApproval) {
      res.status(409).json({
        error: {
          code: 'ALREADY_DECIDED',
          message: 'Approval was already decided by another reviewer'
        }
      });
      return;
    }

    // Record human step in trace
    await recordStep(existing.run_id, 'human', 'human', {
      title: `Human Review (${user.role.toUpperCase()}): ${
        decision === 'approved' ? 'Approved' : 'Rejected'
      } by ${user.fullName || user.email}`,
      input: {
        approvalId,
        requiredRole: existing.required_role
      },
      output: {
        decision,
        comment: comment.trim(),
        decidedBy: user.email,
        decidedByRole: user.role,
        decidedAt
      },
      rationale: comment.trim(),
      confidence: 1,
      durationMs: 0
    });

    await rpcAppendAuditLog({
      runId: existing.run_id,
      actorType: 'user',
      actor: user.email,
      action: decision === 'approved' ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED',
      entityType: 'approval',
      entityId: approvalId,
      details: {
        decision,
        comment: comment.trim(),
        requiredRole: existing.required_role,
        decidedByRole: user.role
      }
    });

    // Resume the run asynchronously
    setImmediate(() => {
      orchestrator
        .resumeAfterApproval({
          runId: existing.run_id,
          approvalId,
          decision,
          comment: comment.trim(),
          decidedById: user.id,
          decidedByEmail: user.email
        })
        .catch((err) => {
          console.error(`Error resuming run ${existing.run_id} after approval:`, err);
        });
    });

    res.json({
      approval: {
        ...updatedApproval,
        decision: updatedApproval.status
      },
      status: decision
    });
  }
);

export default router;
