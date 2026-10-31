import { env } from '../config/env';

// Token-bucket rate limiter (LLM_RPM, default 8) + concurrency cap of 3 (Section 13)
const MAX_CONCURRENCY = 3;
let tokens = env.LLM_RPM;
let lastRefillTime = Date.now();
let activeCount = 0;
const waitQueue: Array<() => void> = [];

function refillTokens(): void {
  const now = Date.now();
  const elapsedMs = now - lastRefillTime;
  const refillAmount = (elapsedMs / 60_000) * env.LLM_RPM;
  tokens = Math.min(env.LLM_RPM, tokens + refillAmount);
  lastRefillTime = now;
}

async function acquireConcurrencySlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENCY) {
    activeCount++;
    return;
  }
  await new Promise<void>((resolve) => {
    waitQueue.push(() => {
      activeCount++;
      resolve();
    });
  });
}

function releaseConcurrencySlot(): void {
  activeCount = Math.max(0, activeCount - 1);
  const next = waitQueue.shift();
  if (next) {
    next();
  }
}

export async function acquireLLMCapacity(): Promise<{
  waitMs: number;
  release: () => void;
  refundToken: () => void;
}> {
  const queueStart = Date.now();
  await acquireConcurrencySlot();

  try {
    refillTokens();
    if (tokens < 1) {
      const neededMs = Math.ceil(((1 - tokens) / env.LLM_RPM) * 60_000);
      await new Promise((r) => setTimeout(r, Math.min(neededMs, 8_000)));
      refillTokens();
    }
    tokens = Math.max(0, tokens - 1);
    const waitMs = Date.now() - queueStart;
    return {
      waitMs,
      release: releaseConcurrencySlot,
      refundToken: () => {
        tokens = Math.min(env.LLM_RPM, tokens + 1);
      }
    };
  } catch (err) {
    releaseConcurrencySlot();
    throw err;
  }
}
