import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { uuidParamSchema } from '../schemas';
import { getRunDetails } from '../services/runService';
import { getRunEmitter } from '../events/runEvents';
import { supabase } from '../db/supabase';

const router = Router();

function canAccessRequest(
  user: { id: string; role: 'employee' | 'manager' | 'finance'; departmentId: string },
  request: { requester_id: string; department_id: string } | null
): boolean {
  if (!request) return false;
  if (user.role === 'finance') return true;
  if (user.role === 'manager') return request.department_id === user.departmentId;
  return request.requester_id === user.id;
}

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;
  let reqQuery = supabase.from('purchase_requests').select('*');
  if (user.role === 'employee') {
    reqQuery = reqQuery.eq('requester_id', user.id);
  } else if (user.role === 'manager') {
    reqQuery = reqQuery.eq('department_id', user.departmentId);
  }

  const { data: allowedRequests } = await reqQuery;
  const reqMap = new Map<string, any>((allowedRequests || []).map((r: any) => [r.id, r]));
  if (reqMap.size === 0) {
    res.json({ runs: [] });
    return;
  }

  const { data: runs } = await supabase
    .from('agent_runs')
    .select('*')
    .in('request_id', Array.from(reqMap.keys()))
    .order('started_at', { ascending: false });

  const enriched = (runs || []).map((r: any) => {
    const reqRow = reqMap.get(r.request_id);
    return {
      ...r,
      request: reqRow
        ? {
            ...reqRow,
            request_text: reqRow.raw_text,
            user_id: reqRow.requester_id
          }
        : null
    };
  });

  res.json({ runs: enriched });
});

router.get(
  '/:id',
  requireAuth,
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const runId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const details = await getRunDetails(runId);
    if (!details || !details.run) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
      return;
    }

    if (!canAccessRequest(req.user!, details.request)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to view this run' }
      });
      return;
    }

    res.json({
      ...details,
      request: details.request
        ? {
            ...details.request,
            request_text: details.request.raw_text,
            user_id: details.request.requester_id
          }
        : null
    });
  }
);

// SSE Live Trace Streaming Endpoint with Last-Event-ID replay & 15s heartbeat
router.get(
  '/:id/stream',
  requireAuth,
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const runId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { data: run } = await supabase
      .from('agent_runs')
      .select('*')
      .eq('id', runId)
      .maybeSingle();

    if (!run) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
      return;
    }

    const { data: request } = await supabase
      .from('purchase_requests')
      .select('*')
      .eq('id', run.request_id)
      .maybeSingle();

    if (!canAccessRequest(req.user!, request)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to stream this run' }
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const lastEventIdHeader = req.headers['last-event-id'];
    const lastSeq =
      typeof lastEventIdHeader === 'string' && /^\d+$/.test(lastEventIdHeader.trim())
        ? parseInt(lastEventIdHeader.trim(), 10)
        : 0;

    const sentSeqs = new Set<number>();

    // Replay stored steps with seq > lastSeq
    const { data: storedSteps } = await supabase
      .from('agent_steps')
      .select('*')
      .eq('run_id', runId)
      .order('seq', { ascending: true });

    for (const step of storedSteps || []) {
      const seqNum = Number(step.seq);
      if (seqNum > lastSeq) {
        sentSeqs.add(seqNum);
        res.write(`id: ${seqNum}\nevent: step\ndata: ${JSON.stringify(step)}\n\n`);
      }
    }

    // Emit current run status
    res.write(
      `event: status\ndata: ${JSON.stringify({
        status: run.status,
        summary: run.summary
      })}\n\n`
    );

    if (['completed', 'rejected', 'failed'].includes(run.status)) {
      res.write(`event: done\ndata: ${JSON.stringify({ status: run.status })}\n\n`);
    }

    const emitter = getRunEmitter(runId);

    const onStep = (step: any) => {
      const seqNum = Number(step?.seq || 0);
      if (seqNum > 0 && sentSeqs.has(seqNum)) {
        return;
      }
      if (seqNum > 0) {
        sentSeqs.add(seqNum);
        res.write(`id: ${seqNum}\nevent: step\ndata: ${JSON.stringify(step)}\n\n`);
      } else {
        res.write(`event: step\ndata: ${JSON.stringify(step)}\n\n`);
      }
    };

    const onStatus = (statusPayload: any) => {
      res.write(`event: status\ndata: ${JSON.stringify(statusPayload)}\n\n`);
    };

    const onDone = (donePayload: any) => {
      res.write(`event: done\ndata: ${JSON.stringify(donePayload)}\n\n`);
    };

    const onError = (errPayload: any) => {
      res.write(`event: error\ndata: ${JSON.stringify(errPayload)}\n\n`);
    };

    emitter.on('step', onStep);
    emitter.on('status', onStatus);
    emitter.on('done', onDone);
    emitter.on('error', onError);

    // 15-second heartbeat comment per Section 12
    const heartbeatTimer = setInterval(() => {
      res.write(`: heartbeat ${new Date().toISOString()}\n\n`);
    }, 15_000);

    req.on('close', () => {
      clearInterval(heartbeatTimer);
      emitter.off('step', onStep);
      emitter.off('status', onStatus);
      emitter.off('done', onDone);
      emitter.off('error', onError);
    });
  }
);

export default router;
