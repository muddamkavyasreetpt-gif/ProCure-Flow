import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

const envSchema = z.object({
  PORT: z.string().default('5000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  GEMINI_API_KEY: isTest ? z.string().default('test_key') : z.string().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  LLM_MODE: z.enum(['live', 'mock']).default('live'),
  LLM_FALLBACK: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),
  LLM_RPM: z.string().default('8').transform(Number),
  RUN_TIMEOUT_MS: z.string().default('240000').transform(Number),
  SUPABASE_URL: z
    .string()
    .optional()
    .default('')
    .refine((v) => {
      if (process.env.NODE_ENV === 'production') {
        return Boolean(v) && v.startsWith('http');
      }
      return true;
    }, 'SUPABASE_URL is required in production'),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .optional()
    .default('')
    .refine((v) => {
      if (process.env.NODE_ENV === 'production') {
        return Boolean(v) && v.length > 10;
      }
      return true;
    }, 'SUPABASE_SERVICE_ROLE_KEY is required in production'),
  JWT_SECRET: isTest
    ? z.string().default('test_secret_procureflow_at_least_32_characters_long')
    : z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  SUPABASE_DB_URL: z.string().optional().default('')
});

const rawEnv = {
  ...process.env,
  LLM_MODE: process.env.LLM_MODE === 'fallback' ? 'mock' : process.env.LLM_MODE,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || process.env.JWT_EXPIRY || '8h'
};

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  console.error('❌ Missing or invalid environment variables in server/.env:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
