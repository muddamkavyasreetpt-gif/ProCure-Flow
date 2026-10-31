import { Router, Request, Response } from 'express';
import { supabase } from '../db/supabase';

const router = Router();

router.get('/departments', async (_req: Request, res: Response): Promise<void> => {
  const { data: departments, error } = await supabase
    .from('departments')
    .select('*')
    .order('name', { ascending: true });
  if (error) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: error.message } });
    return;
  }
  res.json({ departments: departments || [] });
});

router.get('/agents', (_req: Request, res: Response): void => {
  res.json({
    agents: [
      {
        id: 'orchestrator',
        name: 'Orchestrator Agent',
        role: 'Parses procurement intent, constructs the 6-step execution plan, and coordinates autonomous re-planning'
      },
      {
        id: 'policy',
        name: 'Policy Agent',
        role: 'Evaluates corporate spending rules, blocks prohibited items, and checks minimum quotes & justification rules'
      },
      {
        id: 'budget',
        name: 'Budget Agent',
        role: 'Verifies FY 2026 department budget availability and executes atomic fund reservation/release'
      },
      {
        id: 'vendor',
        name: 'Vendor Agent',
        role: 'Ranks approved catalog quotes deterministically, surfaces excluded vendors, and verifies live stock'
      },
      {
        id: 'approval',
        name: 'Approval Agent',
        role: 'Determines mandatory governance route (auto, manager, or finance) with risk & justification floors'
      },
      {
        id: 'execution',
        name: 'Execution Agent',
        role: 'Issues ERP Purchase Orders, commits reserved spend, and dispatches confirmation emails'
      },
      {
        id: 'auditor',
        name: 'Auditor Agent',
        role: 'Performs end-to-end reflection, flags anomalies, and seals the tamper-evident SHA-256 audit log'
      }
    ]
  });
});

export default router;
