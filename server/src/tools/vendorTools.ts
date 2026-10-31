import { z } from 'zod';
import { supabase } from '../db/supabase';
import { matchCatalogItems, rankVendors, VendorCandidateInput } from '../guardrails';
import { RegisteredTool, ToolResult, ToolContext } from './types';
import { Vendor, VendorCatalogItem } from '../types';

const searchVendorsSchema = z.object({
  category: z.string().min(1)
});

const getCatalogQuotesSchema = z.object({
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

const checkStockSchema = z.object({
  vendorId: z.string().min(1),
  itemName: z.string().min(1),
  quantity: z.number().int().min(1)
});

export const vendorTools: RegisteredTool[] = [
  {
    definition: {
      name: 'search_vendors',
      description:
        'List all vendors serving a procurement category, including unapproved vendors so exclusions are visible.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Procurement category name.' }
        },
        required: ['category']
      }
    },
    schema: searchVendorsSchema,
    handler: async (args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
      const category = String(args.category);
      const { data: allVendors, error } = await supabase.from('vendors').select('*');
      if (error) {
        return { success: false, error: error.message };
      }

      const filtered = (allVendors || []).filter(
        (v: any) => Array.isArray(v.categories) && v.categories.includes(category)
      );

      return {
        success: true,
        data: {
          category,
          vendors: filtered.map((v: any) => ({
            vendorId: v.id,
            vendorName: v.name,
            approved: Boolean(v.approved),
            rating: Number(v.rating),
            riskLevel: v.risk_level,
            paymentTerms: v.payment_terms,
            contactEmail: v.contact_email
          }))
        }
      };
    }
  },
  {
    definition: {
      name: 'get_catalog_quotes',
      description:
        'Retrieve catalog quotes for the requested item, already scored, ranked, and annotated with exclusion reasons by deterministic guardrails.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'Procurement category name.' },
          items: {
            type: 'array',
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
    schema: getCatalogQuotesSchema,
    handler: async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> => {
      const category = String(args.category);
      const items = args.items as Array<{ name: string; quantity: number }>;
      const primary = items[0];

      const { data: vendorsData } = await supabase.from('vendors').select('*');
      const { data: catalogData } = await supabase
        .from('vendor_catalog')
        .select('*')
        .eq('category', category);

      const vendorsMap = new Map<string, Vendor>();
      for (const v of (vendorsData || []) as Vendor[]) {
        vendorsMap.set(v.id, v);
      }

      const matchedCatalog = matchCatalogItems(
        (catalogData || []) as VendorCatalogItem[],
        category,
        primary.name
      );

      const candidates: VendorCandidateInput[] = [];
      for (const catItem of matchedCatalog) {
        const vendor = vendorsMap.get(catItem.vendor_id);
        if (vendor) {
          candidates.push({
            vendor,
            catalogItem: catItem,
            quantity: primary.quantity,
            neededByDays: ctx.neededByDays ?? null
          });
        }
      }

      const ranked = rankVendors(candidates, {
        excludeVendorIds: ctx.excludeVendorIds || [],
        neededByDays: ctx.neededByDays ?? null
      });

      if (!ctx.allowedQuoteVendorIds) {
        ctx.allowedQuoteVendorIds = new Set<string>();
      }
      for (const q of ranked) {
        ctx.allowedQuoteVendorIds.add(q.vendorId);
      }

      return {
        success: true,
        data: {
          quotes: ranked
        }
      };
    }
  },
  {
    definition: {
      name: 'check_stock',
      description: 'Verify live stock availability for the exact quantity at a specific vendor.',
      parameters: {
        type: 'object',
        properties: {
          vendorId: { type: 'string', description: 'UUID of the vendor from the retrieved quotes.' },
          itemName: { type: 'string', description: 'Catalog item name.' },
          quantity: { type: 'number', description: 'Quantity required.' }
        },
        required: ['vendorId', 'itemName', 'quantity']
      }
    },
    schema: checkStockSchema,
    handler: async (args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> => {
      const vendorId = String(args.vendorId);
      const itemName = String(args.itemName);
      const quantity = Number(args.quantity);

      if (ctx.allowedQuoteVendorIds && ctx.allowedQuoteVendorIds.size > 0 && !ctx.allowedQuoteVendorIds.has(vendorId)) {
        return {
          success: false,
          error: `Vendor ID ${vendorId} does not belong to the quotes retrieved in this run.`
        };
      }

      const { data: vendor } = await supabase
        .from('vendors')
        .select('id, name, approved')
        .eq('id', vendorId)
        .maybeSingle();

      if (!vendor) {
        return { success: false, error: 'Vendor not found.' };
      }

      const { data: catRows } = await supabase
        .from('vendor_catalog')
        .select('*')
        .eq('vendor_id', vendorId);

      const catalogList = (catRows || []) as VendorCatalogItem[];
      let catalogItem = catalogList.find(
        (c) => c.item_name.toLowerCase() === itemName.toLowerCase()
      );
      if (!catalogItem && catalogList.length > 0) {
        const matched = matchCatalogItems(catalogList, catalogList[0].category, itemName);
        catalogItem = matched[0] || catalogList[0];
      }

      if (!catalogItem) {
        return { success: false, error: `Catalog item "${itemName}" not found for vendor ${vendor.name}.` };
      }

      const stockQty = Number(catalogItem.stock_qty);
      const stockOk = stockQty >= quantity;

      return {
        success: true,
        data: {
          vendorId: vendor.id,
          vendorName: vendor.name,
          itemName: catalogItem.item_name,
          stockQty,
          quantityRequested: quantity,
          stockOk
        }
      };
    }
  }
];
