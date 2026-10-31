import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabase } from '../db/supabase';
import { computeQuoteSavings } from '../services/savingsService';

const router = Router();

async function handleAnalyticsSummary(req: Request, res: Response): Promise<void> {
  const user = req.user!;

  const { data: allDepartments } = await supabase.from('departments').select('*');
  const { data: allBudgets } = await supabase.from('budgets').select('*').eq('fiscal_year', 2026);
  const { data: allRequests } = await supabase
    .from('purchase_requests')
    .select('*')
    .order('created_at', { ascending: false });
  const { data: allRuns } = await supabase
    .from('agent_runs')
    .select('*')
    .order('started_at', { ascending: false });
  const { data: allOrders } = await supabase.from('purchase_orders').select('*');

  const deptMap = new Map<string, string>(
    (allDepartments || []).map((d: any) => [d.id, d.name])
  );
  const budgetByDept = new Map<string, any>(
    (allBudgets || []).map((b: any) => [b.department_id, b])
  );

  // Role-scope requests, runs, and orders
  const scopedRequests = (allRequests || []).filter((r: any) => {
    if (user.role === 'finance') return true;
    if (user.role === 'manager') return r.department_id === user.departmentId;
    return r.requester_id === user.id;
  });

  const scopedRequestIds = new Set<string>(scopedRequests.map((r: any) => r.id));
  const reqById = new Map<string, any>(scopedRequests.map((r: any) => [r.id, r]));

  const scopedRuns = (allRuns || []).filter((r: any) => scopedRequestIds.has(r.request_id));
  const scopedOrders = (allOrders || []).filter((o: any) => scopedRequestIds.has(o.request_id));

  const totalTimeSaved = scopedRuns.reduce(
    (sum: number, r: any) => sum + Number(r.time_saved_minutes || 0),
    0
  );
  const totalSpendCommitted = scopedOrders.reduce(
    (sum: number, o: any) => sum + Number(o.total_amount ?? o.total ?? 0),
    0
  );

  let totalEstimatedSavings = 0;
  for (const run of scopedRuns) {
    const state = (run.state || {}) as Record<string, any>;
    if (state.selectedQuote && Array.isArray(state.consideredVendors)) {
      const sv = computeQuoteSavings(
        Number(state.selectedQuote.total || 0),
        state.consideredVendors
      );
      totalEstimatedSavings += sv.savingsVsHighest;
    }
  }

  const statusDistribution: Record<string, number> = {
    completed: 0,
    awaiting_approval: 0,
    rejected: 0,
    processing: 0,
    failed: 0
  };
  for (const r of scopedRequests) {
    statusDistribution[r.status] = (statusDistribution[r.status] || 0) + 1;
  }

  const departments = (allDepartments || [])
    .filter((d: any) => {
      if (user.role === 'finance') return true;
      return d.id === user.departmentId || true; // Show department budget overview on dashboard
    })
    .map((d: any) => {
      const b = budgetByDept.get(d.id);
      const totalAmount = Number(b?.total_amount ?? 0);
      const reservedAmount = Number(b?.reserved_amount ?? 0);
      const spentAmount = Number(b?.spent_amount ?? 0);
      const available = totalAmount - reservedAmount - spentAmount;

      return {
        id: d.id,
        name: d.name,
        budgetTotal: totalAmount,
        totalAmount,
        reservedAmount,
        spentAmount,
        available
      };
    });

  const recentRuns = scopedRuns.slice(0, 8).map((run: any) => {
    const reqRow = reqById.get(run.request_id);
    return {
      ...run,
      requestText: reqRow?.raw_text || '',
      departmentName: reqRow ? deptMap.get(reqRow.department_id) || 'Unknown' : 'Unknown',
      estimatedTotal: reqRow?.estimated_total ? Number(reqRow.estimated_total) : null
    };
  });

  res.json({
    metrics: {
      totalRequests: scopedRequests.length,
      completedRuns: scopedRuns.filter((r: any) => r.status === 'completed').length,
      awaitingApproval: scopedRuns.filter((r: any) => r.status === 'awaiting_approval').length,
      rejectedRuns: scopedRuns.filter((r: any) => r.status === 'rejected').length,
      totalTimeSavedMinutes: totalTimeSaved,
      totalSpendCommitted: Math.round(totalSpendCommitted * 100) / 100,
      totalEstimatedSavings: Math.round(totalEstimatedSavings * 100) / 100
    },
    departments,
    statusDistribution,
    recentRuns
  });
}

router.get('/', requireAuth, handleAnalyticsSummary);
router.get('/summary', requireAuth, handleAnalyticsSummary);

export default router;
