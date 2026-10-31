import { EventEmitter } from 'events';

// Per-run SSE emitters — keyed by run ID
const runEmitters = new Map<string, EventEmitter>();

export function getRunEmitter(runId: string): EventEmitter {
  if (!runEmitters.has(runId)) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(20);
    // Attach default error listener so emit('error') does not throw ERR_UNHANDLED_ERROR
    emitter.on('error', () => {});
    runEmitters.set(runId, emitter);
  }
  return runEmitters.get(runId)!;
}

export function deleteRunEmitter(runId: string): void {
  runEmitters.delete(runId);
}

export function emitRunEvent(
  runId: string,
  event: 'step' | 'status' | 'done' | 'error',
  data: unknown
): void {
  const emitter = runEmitters.get(runId);
  if (emitter) {
    try {
      emitter.emit(event, data);
    } catch (e) {
      console.warn(`[runEvents] Failed to emit ${event} for run ${runId}:`, e);
    }
  }
}
