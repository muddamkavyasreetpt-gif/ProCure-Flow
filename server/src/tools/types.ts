import { ZodSchema } from 'zod';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolContext {
  runId: string;
  requestId: string;
  departmentId: string;
  requesterId: string;
  requesterEmail: string;
  excludeVendorIds?: string[];
  neededByDays?: number | null;
  allowedQuoteVendorIds?: Set<string>;
  selectedVendorEmail?: string;
  requiredApprovalRole?: 'manager' | 'finance';
}

export type ToolHandler = (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;

export interface RegisteredTool {
  definition: ToolDefinition;
  schema: ZodSchema;
  handler: ToolHandler;
}
