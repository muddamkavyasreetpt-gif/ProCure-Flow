import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Must be a valid email address.'),
  password: z.string().min(1, 'Password is required.')
});

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Must be a valid email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .regex(/[A-Za-z]/, 'Password must contain at least one letter.')
    .regex(/[0-9]/, 'Password must contain at least one number.'),
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters.')
    .max(80, 'Full name must be at most 80 characters.'),
  departmentId: z.string().uuid('Must be a valid department UUID.')
});

export const createRequestSchema = z.object({
  requestText: z
    .string()
    .trim()
    .min(15, 'Request must be at least 15 characters.')
    .max(1000, 'Request must be at most 1000 characters.'),
  urgency: z.enum(['low', 'normal', 'high']).default('normal'),
  justification: z
    .string()
    .trim()
    .max(500, 'Justification must be at most 500 characters.')
    .optional()
});

export const listRequestsQuerySchema = z.object({
  status: z
    .enum(['submitted', 'processing', 'awaiting_approval', 'completed', 'rejected', 'failed'])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export const uuidParamSchema = z.object({
  id: z.string().min(1, 'ID parameter is required.')
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z
    .string()
    .trim()
    .min(1, 'A comment is required for your decision.')
    .max(500, 'Comment must be at most 500 characters.')
});

export const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  runId: z.string().optional(),
  action: z.string().optional()
});
