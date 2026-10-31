import { z } from 'zod';
import { supabase } from '../db/supabase';
import { matchCatalogItems, recomputeTotal } from '../guardrails';
import { RegisteredTool, ToolResult, ToolContext } from './types';

const getBudgetSchema = z.object({});

const estimateCostSchema = z.object({
  category: z.string().min(1),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.number().int().min(1)
      })
    )
    .min(1)
});

export const budgetTools: RegisteredTool[] = [
  {
    definition: {
      name: 'get_budget',
      description:
        'Retrieve the current fiscal year (2026) budget for the requester department (bound server-side) in INR (₹).',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    schema: getBudgetSchema,
    handler: async (_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> => {
      const { data: budget, error } = await supabase
        .from('budgets')
        .select('*')
        .eq('department_id', ctx.departmentId)
        .eq('fiscal_year', 2026)
        .single();

      if (error || !budget) {
        return { success: false, error: `Budget not found for department: ${error?.message || 'missing'}` };
      }

      const totalAmount = Number(budget.total_amount);
      const reservedAmount = Number(budget.reserved_amount);
      const spentAmount = Number(budget.spent_amount);
      const available = Math.round((totalAmount - reservedAmount - spentAmount) * 100) / 100;

      return {
        success: true,
        data: {
          departmentId: ctx.departmentId,
          fiscalYear: Number(budget.fiscal_year),
          totalAmount,
          reservedAmount,
          spentAmount,
          available
        }
      };
    }
  },
  {
    definition: {
      name: 'estimate_cost',
      description:
        'Compute minimum and maximum catalog price estimates in INR (₹) over approved vendors for the requested item.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Procurement category' },
          items: {
            type: 'array',
            description: 'Requested items with name and quantity',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                quantity: { type: 'number' }
              },
              required: ['name', 'quantity']
            }
          }
        },
        required: ['category', 'items']
      }
    },
    schema: estimateCostSchema,
    handler: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
      const category = String(args.category);
      const items = args.items as Array<{ name: string; quantity: number }>;
      const primary = items[0];

      const { data: vendors } = await supabase.from('vendors').select('*').eq('approved', true);
      const { data: catalog } = await supabase.from('vendor_catalog').select('*').eq('category', category);

      const approvedIds = new Set((vendors || []).map((v: any) => v.id));
      const matched = matchCatalogItems(catalog || [], category, primary.name).filter((c) =>
        approvedIds.has(c.vendor_id)
      );

      if (matched.length === 0) {
        return {
          success: true,
          data: {
            matchedItemName: null,
            minEstimate: null,
            maxEstimate: null,
            quotesCount: 0
          }
        };
      }

      const totals = matched.map((c) => recomputeTotal(Number(c.unit_price), primary.quantity));
      return {
        success: true,
        data: {
          matchedItemName: matched[0].item_name,
          quantity: primary.quantity,
          minEstimate: Math.min(...totals),
          maxEstimate: Math.max(...totals),
          quotesCount: matched.length
        }
      };
    }
  }
];
