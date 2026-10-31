import crypto from 'crypto';
import { supabase } from '../db/supabase';
import { emitRunEvent } from '../events/runEvents';
import { AgentStep } from '../types';

export type StepAgent = AgentStep['agent'];
export type StepKind = AgentStep['kind'];

// Per-run serialised sequence counter initialised from DB (Section 18.12)
const seqChains = new Map<string, Promise<number>>();
const seqCounters = new Map<string, number>();

async function getNextSeq(runId: string): Promise<number> {
  const prevChain = seqChains.get(runId) || Promise.resolve(0);
  const nextPromise = prevChain.then(async () => {
    let current = seqCounters.get(runId);
    if (current === undefined) {
      const { data: existing } = await supabase
        .from('agent_steps')
        .select('seq')
        .eq('run_id', runId)
        .order('seq', { ascending: false })
        .limit(1);
      current = existing && existing.length > 0 ? Number(existing[0].seq) : 0;
    }
    const next = current + 1;
    seqCounters.set(runId, next);
    return next;
  });
  seqChains.set(runId, nextPromise);
  return nextPromise;
}

export interface RecordStepOptions {
  title: string;
  input?: Record<string, unknown> | null;
  output?: Record<string, unknown> | null;
  rationale?: string | null;
  confidence?: number | null;
  durationMs?: number | null;
}

export async function recordStep(
  runId: string,
  agent: StepAgent,
  kind: StepKind,
  options: RecordStepOptions
): Promise<AgentStep> {
  const seq = await getNextSeq(runId);

  const dbRow = {
    id: crypto.randomUUID(),
    run_id: runId,
    seq,
    agent,
    kind,
    title: options.title,
    input: options.input ?? null,
    output: options.output ?? null,
    rationale: options.rationale ?? null,
    confidence:
      options.confidence !== null && options.confidence !== undefined
        ? Math.max(0, Math.min(1, Number(options.confidence.toFixed(2))))
        : null,
    duration_ms: options.durationMs ?? 0,
    created_at: new Date().toISOString()
  };

  await supabase.from('agent_steps').insert(dbRow);

  const step: AgentStep = {
    ...dbRow,
    step_index: seq
  };

  emitRunEvent(runId, 'step', step);
  return step;
}
