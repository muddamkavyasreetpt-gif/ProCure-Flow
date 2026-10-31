import { env } from '../config/env';

const BASE_DELAY_MS = 1000;
const MAX_ATTEMPTS = 3;

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;

  while (true) {
    attempt++;
    try {
      return await fn();
    } catch (err: unknown) {
      const error = err as { status?: number; message?: string };
      const msg = String(error?.message || err || '');

      if (
        error?.status === 404 ||
        msg.toLowerCase().includes('model not found') ||
        (msg.toLowerCase().includes('not found') && msg.toLowerCase().includes('models/'))
      ) {
        throw new Error(
          `Gemini model "${env.GEMINI_MODEL}" was rejected as unavailable. Please change GEMINI_MODEL in server/.env (for example to "gemini-2.5-flash").`
        );
      }

      const isRetryable =
        error?.status === 429 ||
        error?.status === 500 ||
        error?.status === 503 ||
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('UNAVAILABLE');

      if (!isRetryable || attempt >= MAX_ATTEMPTS) {
        throw err;
      }

      const jitter = Math.floor(Math.random() * 350);
      const backoffMs = BASE_DELAY_MS * Math.pow(2, attempt - 1) + jitter;
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
}
