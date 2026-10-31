import crypto from 'crypto';
import { supabase, rpcAppendAuditLog } from '../db/supabase';
import { orchestrator } from '../agents/orchestrator';
import { RunContext } from '../types';

export async function createRun(params: {
  requesterId: string;
  requesterEmail: string;
  departmentId: string;
  requestText: string;
  urgency: 'low' | 'normal' | 'high';
  justification?: string;
}): Promise<{ requestId: string; runId: string }> {
  const requestId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const now = new Date().toISOString();

  // 1. Create Purchase Request
  await supabase.from('purchase_requests').insert({
    id: requestId,
    requester_id: params.requesterId,
    department_id: params.departmentId,
    raw_text: params.requestText.trim(),
    urgency: params.urgency,
    justification: params.justification?.trim() || null,
    parsed: null,
    estimated_total: null,
    status: 'processing',
    created_at: now,
    updated_at: now
  });

  // 2. Create Agent Run
  await supabase.from('agent_runs').insert({
    id: runId,
    request_id: requestId,
    status: 'running',
    plan: null,
    replan_count: 0,
    state: {},
    final_decision: null,
    summary: null,
    active_ms: 0,
    time_saved_minutes: 0,
    started_at: now,
    finished_at: null
  });

  await rpcAppendAuditLog({
    runId,
    actorType: 'user',
    actor: params.requesterEmail,
    action: 'REQUEST_SUBMITTED',
    entityType: 'purchase_request',
    entityId: requestId,
    details: {
      rawText: params.requestText.trim(),
      urgency: params.urgency,
      hasJustification: Boolean(params.justification && params.justification.trim().length > 0),
      departmentId: params.departmentId
    }
  });

  const context: RunContext = {
    runId,
    requestId,
    requesterId: params.requesterId,
    requesterEmail: params.requesterEmail,
    departmentId: params.departmentId,
    rawText: params.requestText.trim(),
    urgency: params.urgency,
    justification: params.justification?.trim() || undefined
  };

  // Run asynchronously in-process so POST /api/requests returns 201 immediately
  setImmediate(() => {
    orchestrator.execute(context).catch((err) => {
      console.error(`Orchestrator failed for run ${runId}:`, err);
    });
  });

  return { requestId, runId };
}

export async function getRunDetails(runId: string) {
  const { data: run } = await supabase.from('agent_runs').select('*').eq('id', runId).maybeSingle();
  if (!run) return null;

  const { data: request } = await supabase
    .from('purchase_requests')
    .select('*')
    .eq('id', run.request_id)
    .maybeSingle();

  const { data: steps } = await supabase
    .from('agent_steps')
    .select('*')
    .eq('run_id', runId)
    .order('seq', { ascending: true });

  const { data: approvals } = await supabase
    .from('approvals')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: false });

  const { data: purchaseOrders } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('run_id', runId);

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: true });

  const { data: auditLogs } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('run_id', runId)
    .order('id', { ascending: true });

  let purchaseOrder = purchaseOrders?.[0] || null;
  if (purchaseOrder && !purchaseOrder.vendor_name && purchaseOrder.vendor_id) {
    const { data: vendor } = await supabase
      .from('vendors')
      .select('name')
      .eq('id', purchaseOrder.vendor_id)
      .maybeSingle();
    if (vendor?.name) {
      purchaseOrder = { ...purchaseOrder, vendor_name: vendor.name };
    }
  }

  return {
    run,
    request,
    steps: steps || [],
    approvals: approvals || [],
    purchaseOrder,
    notifications: notifications || [],
    auditLogs: auditLogs || []
  };
}
