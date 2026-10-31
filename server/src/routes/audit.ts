import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../middleware/validate';
import { auditQuerySchema } from '../schemas';
import { supabase, rpcVerifyAuditChain } from '../db/supabase';

const router = Router();

router.get(
  '/',
  requireAuth,
  requireRole('manager', 'finance'),
  validate({ query: auditQuerySchema }),
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;
    const { page = 1, pageSize = 25, runId, action } = req.query as any;

    // Verify full chain integrity via Postgres RPC
    const chainVerification = await rpcVerifyAuditChain();

    let allowedRunIds: Set<string> | null = null;
    if (user.role === 'manager') {
      const { data: deptReqs } = await supabase
        .from('purchase_requests')
        .select('id')
        .eq('department_id', user.departmentId);
      const reqIds = (deptReqs || []).map((r: any) => r.id);

      if (reqIds.length > 0) {
        const { data: deptRuns } = await supabase
          .from('agent_runs')
          .select('id')
          .in('request_id', reqIds);
        allowedRunIds = new Set((deptRuns || []).map((r: any) => r.id));
      } else {
        allowedRunIds = new Set();
      }
    }

    let query = supabase.from('audit_logs').select('*').order('id', { ascending: false });

    if (runId) {
      query = query.eq('run_id', runId);
    }
    if (action) {
      query = query.eq('action', action);
    }

    const { data: rawLogs, error } = await query;
    if (error) {
      res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });
      return;
    }

    const filteredLogs = (rawLogs || []).filter((log: any) => {
      if (allowedRunIds !== null) {
        return log.run_id && allowedRunIds.has(log.run_id);
      }
      return true;
    });

    const totalLogs = filteredLogs.length;
    const startIdx = (Number(page) - 1) * Number(pageSize);
    const pagedLogs = filteredLogs.slice(startIdx, startIdx + Number(pageSize));

    res.json({
      chainValid: chainVerification.valid,
      brokenAt: chainVerification.broken_at,
      checked: chainVerification.checked,
      totalLogs,
      page: Number(page),
      pageSize: Number(pageSize),
      logs: pagedLogs
    });
  }
);

router.get(
  '/verify',
  requireAuth,
  async (_req: Request, res: Response): Promise<void> => {
    const verification = await rpcVerifyAuditChain();
    res.json({
      valid: verification.valid,
      chainValid: verification.valid,
      brokenAt: verification.broken_at,
      checked: verification.checked
    });
  }
);

export default router;
