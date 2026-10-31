import { z } from 'zod';
import { supabase } from '../db/supabase';
import { RegisteredTool, ToolDefinition, ToolHandler, ToolContext, ToolResult } from './types';
import { policyTools } from './policyTools';
import { budgetTools } from './budgetTools';
import { vendorTools } from './vendorTools';
import { emailTools } from './emailTools';

const auditorTool: RegisteredTool = {
  definition: {
    name: 'get_run_steps',
    description: 'Read all recorded agent steps for the current run (runId bound server-side).',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  schema: z.object({}),
  handler: async (_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> => {
    const { data: steps, error } = await supabase
      .from('agent_steps')
      .select('seq, agent, kind, title, input, output, rationale, confidence, duration_ms')
      .eq('run_id', ctx.runId)
      .order('seq', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }
    return {
      success: true,
      data: { steps: steps || [] }
    };
  }
};

const allTools: RegisteredTool[] = [
  ...policyTools,
  ...budgetTools,
  ...vendorTools,
  ...emailTools,
  auditorTool
];

const registry = new Map<string, RegisteredTool>();
for (const tool of allTools) {
  registry.set(tool.definition.name, tool);
}

// Per-agent allowed tool names (Section 15)
export type AgentName =
  | 'orchestrator'
  | 'policy'
  | 'budget'
  | 'vendor'
  | 'approval'
  | 'execution'
  | 'auditor';

const AGENT_TOOL_ALLOWLIST: Record<AgentName, string[]> = {
  orchestrator: [],
  policy: ['get_policy_rules', 'list_policy_violations_hint'],
  budget: ['get_budget', 'estimate_cost'],
  vendor: ['search_vendors', 'get_catalog_quotes', 'check_stock'],
  approval: ['get_policy_rules', 'notify_user'],
  execution: ['send_email'],
  auditor: ['get_run_steps']
};

export function getAgentTools(agent: AgentName): {
  declarations: ToolDefinition[];
  executors: Map<string, RegisteredTool>;
} {
  const allowedNames = AGENT_TOOL_ALLOWLIST[agent] || [];
  const declarations: ToolDefinition[] = [];
  const executors = new Map<string, RegisteredTool>();

  for (const name of allowedNames) {
    const tool = registry.get(name);
    if (tool) {
      declarations.push(tool.definition);
      executors.set(name, tool);
    }
  }

  return { declarations, executors };
}

export function getToolDefinitions(): ToolDefinition[] {
  return allTools.map((t) => t.definition);
}

export function getToolHandler(name: string): ToolHandler | undefined {
  return registry.get(name)?.handler;
}

export function getRegisteredTool(name: string): RegisteredTool | undefined {
  return registry.get(name);
}
