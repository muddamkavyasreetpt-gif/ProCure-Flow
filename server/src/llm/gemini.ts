import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env';

export const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
export const MODEL = env.GEMINI_MODEL; // default "gemini-2.5-flash"

export function isLiveLLMConfigured(): boolean {
  return (
    env.LLM_MODE === 'live' &&
    Boolean(env.GEMINI_API_KEY) &&
    env.GEMINI_API_KEY !== 'placeholder' &&
    !env.GEMINI_API_KEY.includes('your_gemini_api_key') &&
    env.GEMINI_API_KEY !== 'test_key'
  );
}
