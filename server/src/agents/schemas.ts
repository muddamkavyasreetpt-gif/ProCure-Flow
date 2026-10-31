import { z } from 'zod';
import { VALID_CATEGORIES } from './heuristicParser';

export const PlanStepSchema = z.object({
  id: z.string(),
  agent: z.enum(['policy', 'budget', 'vendor', 'approval', 'execution', 'auditor']),
  goal: z.string()
});

// 15.1 Orchestrator: Plan
export const OrchestratorPlanSchema = z.object({
  parsed: z.object({
    category: z.enum(VALID_CATEGORIES),
    items: z
      .array(
        z.object({
          name: z.string().min(1),
          quantity: z.number().int().min(1),
          specHint: z.string()
        })
      )
      .min(1),
    statedBudget: z.number().nullable(),
    neededByDays: z.number().int().nullable(),
    summary: z.string()
  }),
  plan: z.array(PlanStepSchema).min(1),
  rationale: z.string(),
  confidence: z.number().min(0).max(1)
});

export type OrchestratorPlanOutput = z.infer<typeof OrchestratorPlanSchema>;

// 15.2 Orchestrator: Re-plan
export const OrchestratorReplanSchema = z.object({
  action: z.enum(['retry_step', 'adjust_and_retry', 'abort']),
  adjustments: z.object({
    excludeVendorIds: z.array(z.string()),
    note: z.string()
  }),
  rationale: z.string(),
  confidence: z.number().min(0).max(1)
});

export type OrchestratorReplanOutput = z.infer<typeof OrchestratorReplanSchema>;

// 15.3 Policy Agent
export const PolicyAgentOutputSchema = z.object({
  status: z.enum(['passed', 'blocked']),
  policy: z.object({
    category: z.string(),
    autoApproveLimit: z.number(),
    managerLimit: z.number(),
    minQuotes: z.number().int()
  }),
  violations: z.array(z.string()),
  justificationRequired: z.boolean(),
  justificationProvided: z.boolean(),
  permittedCategories: z.array(z.string()).optional(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1)
});

export type PolicyAgentOutput = z.infer<typeof PolicyAgentOutputSchema>;

// 15.4 Budget Agent
export const BudgetAgentOutputSchema = z.object({
  mode: z.enum(['check', 'reserve']),
  status: z.enum(['ok', 'insufficient', 'failed']),
  available: z.number(),
  requested: z.number(),
  reservedAmount: z.number().nullable(),
  suggestedAlternative: z
    .object({
      maxAffordableQuantity: z.number(),
      cheapestUnitPrice: z.number(),
      cheapestVendorName: z.string().nullable(),
      itemName: z.string()
    })
    .optional(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1)
});

export type BudgetAgentOutput = z.infer<typeof BudgetAgentOutputSchema>;

// 15.5 Vendor Agent
export const VendorConsideredSchema = z.object({
  vendorId: z.string(),
  vendorName: z.string(),
  unitPrice: z.number(),
  total: z.number(),
  leadTimeDays: z.number().int(),
  rating: z.number(),
  riskLevel: z.enum(['low', 'medium', 'high']),
  score: z.number(),
  stockOk: z.boolean().nullable(),
  excludedReason: z.string().nullable()
});

export const VendorSelectedSchema = z.object({
  vendorId: z.string(),
  vendorName: z.string(),
  itemName: z.string(),
  quantity: z.number().int(),
  unitPrice: z.number(),
  total: z.number(),
  leadTimeDays: z.number().int(),
  riskLevel: z.enum(['low', 'medium', 'high']),
  expectedDelivery: z.string()
});

export const VendorAgentOutputSchema = z.object({
  status: z.enum(['selected', 'needs_replan', 'failed']),
  considered: z.array(VendorConsideredSchema),
  selected: VendorSelectedSchema.nullable(),
  failedVendorId: z.string().nullable(),
  fallbackUsed: z.boolean(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1)
});

export type VendorAgentOutput = z.infer<typeof VendorAgentOutputSchema>;

// 15.6 Approval Agent
export const ApprovalAgentOutputSchema = z.object({
  recommendedRoute: z.enum(['auto', 'manager', 'finance']),
  reasons: z.array(z.string()),
  riskFlags: z.array(z.string()),
  rationale: z.string(),
  confidence: z.number().min(0).max(1)
});

export type ApprovalAgentOutput = z.infer<typeof ApprovalAgentOutputSchema>;

// 15.7 Execution Agent
export const ExecutionAgentOutputSchema = z.object({
  status: z.enum(['completed', 'failed']),
  poNumber: z.string(),
  emails: z.array(
    z.object({
      to: z.string(),
      subject: z.string(),
      body: z.string()
    })
  ),
  rationale: z.string(),
  confidence: z.number().min(0).max(1)
});

export type ExecutionAgentOutput = z.infer<typeof ExecutionAgentOutputSchema>;

// 15.8 Auditor Agent
export const AuditorAgentOutputSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  anomalies: z.array(
    z.object({
      severity: z.enum(['info', 'warning', 'critical']),
      message: z.string()
    })
  ),
  compliant: z.boolean(),
  rationale: z.string(),
  confidence: z.number().min(0).max(1)
});

export type AuditorAgentOutput = z.infer<typeof AuditorAgentOutputSchema>;
