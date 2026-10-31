import { z } from 'zod';
import { supabase } from '../db/supabase';
import { RegisteredTool, ToolResult, ToolContext } from './types';

const getPolicyRulesSchema = z.object({
  category: z.string().min(1)
});

const listPolicyViolationsHintSchema = z.object({
  text: z.string().min(1)
});

const PROHIBITED_KEYWORDS = [
  'gift card',
  'gift cards',
  'cash equivalent',
  'cryptocurrency',
  'crypto',
  'bitcoin',
  'personal item',
  'liquor',
  'alcohol',
  'gambling'
];

export const policyTools: RegisteredTool[] = [
  {
    definition: {
      name: 'get_policy_rules',
      description: 'Fetch company spending policy rules for a given procurement category in INR (₹).',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description:
              'One of: IT Hardware, Software Licenses, Office Supplies, Furniture, Marketing Services, Travel & Events, Prohibited Items'
          }
        },
        required: ['category']
      }
    },
    schema: getPolicyRulesSchema,
    handler: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
      const category = String(args.category);
      const { data: policy, error } = await supabase
        .from('policies')
        .select('*')
        .eq('category', category)
        .maybeSingle();

      if (error) {
        return { success: false, error: error.message };
      }

      if (!policy) {
        const { data: fallbackPolicy } = await supabase
          .from('policies')
          .select('*')
          .eq('category', 'IT Hardware')
          .maybeSingle();
        return {
          success: true,
          data: {
            policy: fallbackPolicy
              ? {
                  category: fallbackPolicy.category,
                  description: fallbackPolicy.description,
                  autoApproveLimit: Number(fallbackPolicy.auto_approve_limit),
                  managerLimit: Number(fallbackPolicy.manager_limit),
                  minQuotes: Number(fallbackPolicy.min_quotes),
                  requiresJustificationAbove: Number(fallbackPolicy.requires_justification_above),
                  isBlocked: Boolean(fallbackPolicy.is_blocked)
                }
              : null
          }
        };
      }

      return {
        success: true,
        data: {
          policy: {
            category: policy.category,
            description: policy.description,
            autoApproveLimit: Number(policy.auto_approve_limit),
            managerLimit: Number(policy.manager_limit),
            minQuotes: Number(policy.min_quotes),
            requiresJustificationAbove: Number(policy.requires_justification_above),
            isBlocked: Boolean(policy.is_blocked)
          }
        }
      };
    }
  },
  {
    definition: {
      name: 'list_policy_violations_hint',
      description: 'Scan request text for keyword flags indicating prohibited or blocked items.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Raw request text to scan for prohibited item hints.' }
        },
        required: ['text']
      }
    },
    schema: listPolicyViolationsHintSchema,
    handler: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
      const lower = String(args.text).toLowerCase();
      const matched = PROHIBITED_KEYWORDS.filter((kw) => lower.includes(kw));
      return {
        success: true,
        data: {
          blockedKeywordsFound: matched,
          isProhibited: matched.length > 0
        }
      };
    }
  }
];
