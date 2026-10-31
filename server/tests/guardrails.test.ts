import { describe, it, expect } from 'vitest';
import {
  isBlocked,
  recomputeTotal,
  assertBudgetAvailable,
  computeRequiredRoute,
  maxRoute,
  scoreVendor,
  rankVendors,
  matchCatalogItems
} from '../src/guardrails';
import { heuristicParseRequest } from '../src/agents/heuristicParser';
import {
  OrchestratorPlanSchema,
  PolicyAgentOutputSchema,
  VendorAgentOutputSchema
} from '../src/agents/schemas';
import { Vendor, VendorCatalogItem } from '../src/types';

describe('ProcureFlow Deterministic Guardrails (Section 9 & 18.6)', () => {
  const furniturePolicy = {
    auto_approve_limit: 30000,
    manager_limit: 400000,
    min_quotes: 2,
    requires_justification_above: 100000,
    is_blocked: false
  };

  const itHardwarePolicy = {
    auto_approve_limit: 50000,
    manager_limit: 500000,
    min_quotes: 2,
    requires_justification_above: 100000,
    is_blocked: false
  };

  const softwarePolicy = {
    auto_approve_limit: 25000,
    manager_limit: 300000,
    min_quotes: 1,
    requires_justification_above: 100000,
    is_blocked: false
  };

  const prohibitedPolicy = {
    auto_approve_limit: 0,
    manager_limit: 0,
    min_quotes: 1,
    requires_justification_above: 0,
    is_blocked: true
  };

  it('blocks prohibited categories deterministically', () => {
    expect(isBlocked(prohibitedPolicy)).toBe(true);
    expect(isBlocked(itHardwarePolicy)).toBe(false);
  });

  it('computes routes based on category policy limits and vendor risk', () => {
    // Scenario 3: 5 software licenses @ ₹4,800 = ₹24,000 <= ₹25,000 auto limit -> auto
    expect(computeRequiredRoute(24000, softwarePolicy, 'low')).toBe('auto');

    // Medium vendor risk raises auto -> manager
    expect(computeRequiredRoute(24000, softwarePolicy, 'medium')).toBe('manager');

    // High vendor risk always escalates to finance
    expect(computeRequiredRoute(24000, softwarePolicy, 'high')).toBe('finance');

    // Over manager limit -> finance
    expect(computeRequiredRoute(1040000, itHardwarePolicy, 'low')).toBe('finance');
  });

  it('enforces route floors strictly: justification missing and quotes below min raise route to manager', () => {
    // Floor 1: Justification missing above requires_justification_above (₹1,00,000) raises to at least manager
    // Scenario 1: ₹1,70,000 chairs without justification -> manager
    const floorJustification = computeRequiredRoute(170000, furniturePolicy, 'low', {
      justificationMissing: true
    });
    expect(floorJustification).toBe('manager');

    // Floor 2: Fewer distinct approved quotes than min_quotes (2) raises route to at least manager
    const floorQuotes = computeRequiredRoute(24000, itHardwarePolicy, 'low', {
      quotesBelowMin: true
    });
    expect(floorQuotes).toBe('manager');

    // Both floors together: still at least manager
    const bothFloors = computeRequiredRoute(170000, furniturePolicy, 'low', {
      justificationMissing: true,
      quotesBelowMin: true
    });
    expect(bothFloors).toBe('manager');

    // Floor never lowers a higher route (e.g. Finance stays Finance)
    const floorOnFinance = computeRequiredRoute(1040000, itHardwarePolicy, 'low', {
      justificationMissing: true
    });
    expect(floorOnFinance).toBe('finance');
  });

  it('prevents LLM from lowering guardrail approval route via maxRoute', () => {
    expect(maxRoute('finance', 'auto')).toBe('finance');
    expect(maxRoute('manager', 'auto')).toBe('manager');
    expect(maxRoute('auto', 'manager')).toBe('manager');
    expect(maxRoute('finance', 'manager')).toBe('finance');
  });

  it('enforces budget math and refuses overdraws', () => {
    const mktBudget = {
      total_amount: 800000,
      reserved_amount: 0,
      spent_amount: 700000
    };
    const res = assertBudgetAvailable(mktBudget, 950000);
    expect(res.ok).toBe(false);
    expect(res.available).toBe(100000);

    const engBudget = {
      total_amount: 4000000,
      reserved_amount: 0,
      spent_amount: 1200000
    };
    expect(assertBudgetAvailable(engBudget, 24000).ok).toBe(true);
    expect(recomputeTotal(104000, 10)).toBe(1040000);
  });

  it('ranks Prime Infotech over Globex Distribution deterministically for laptops', () => {
    // 10 laptops:
    // Globex: unit ₹95,000, total ₹950,000, lead 21 days, rating 3.6, risk 'medium'
    // Prime:  unit ₹104,000, total ₹1,040,000, lead 7 days, rating 4.4, risk 'low'
    const minTotal = 950000;
    const maxLeadTime = 21;
    const neededByDays = 21;

    const primeScore = scoreVendor({
      total: 1040000,
      minTotal,
      leadTimeDays: 7,
      maxLeadTimeAmongCandidates: maxLeadTime,
      neededByDays,
      rating: 4.4,
      riskLevel: 'low'
    });

    const globexScore = scoreVendor({
      total: 950000,
      minTotal,
      leadTimeDays: 21,
      maxLeadTimeAmongCandidates: maxLeadTime,
      neededByDays,
      rating: 3.6,
      riskLevel: 'medium'
    });

    // Prime has faster delivery (7 vs 21 days), higher rating (4.4 vs 3.6), and lower risk (low vs medium)
    expect(primeScore).toBeGreaterThan(globexScore);

    const candidates = [
      {
        vendor: { id: 'v-globex', name: 'Globex Distribution', approved: true, rating: 3.6, risk_level: 'medium' as const, payment_terms: 'Net 15', contact_email: 'bulk@globex.example', categories: ['IT Hardware'] },
        catalogItem: { id: 'c-globex', vendor_id: 'v-globex', category: 'IT Hardware', item_name: 'Business Laptop 14"', spec: '16GB', unit_price: 95000, stock_qty: 100, lead_time_days: 21 },
        quantity: 10,
        neededByDays: 21
      },
      {
        vendor: { id: 'v-prime', name: 'Prime Infotech', approved: true, rating: 4.4, risk_level: 'low' as const, payment_terms: 'Net 45', contact_email: 'orders@primeinfotech.example', categories: ['IT Hardware'] },
        catalogItem: { id: 'c-prime', vendor_id: 'v-prime', category: 'IT Hardware', item_name: 'Business Laptop 14"', spec: '16GB', unit_price: 104000, stock_qty: 50, lead_time_days: 7 },
        quantity: 10,
        neededByDays: 21
      }
    ];

    const ranked = rankVendors(candidates, { neededByDays: 21 });
    expect(ranked[0].vendorName).toBe('Prime Infotech');
    expect(ranked[1].vendorName).toBe('Globex Distribution');
  });

  it('ranks vendors for Scenario 2: excludes QuickDeals, ranks TechNova #1, and picks Prime over Globex on re-plan', () => {
    const vendors: Vendor[] = [
      { id: 'v-technova', name: 'TechNova Systems', approved: true, rating: 4.6, risk_level: 'low', payment_terms: 'Net 30', contact_email: 'sales@technova.example', categories: ['IT Hardware'] },
      { id: 'v-prime', name: 'Prime Infotech', approved: true, rating: 4.4, risk_level: 'low', payment_terms: 'Net 45', contact_email: 'orders@primeinfotech.example', categories: ['IT Hardware'] },
      { id: 'v-globex', name: 'Globex Distribution', approved: true, rating: 3.6, risk_level: 'medium', payment_terms: 'Net 15', contact_email: 'bulk@globex.example', categories: ['IT Hardware'] },
      { id: 'v-quick', name: 'QuickDeals Traders', approved: false, rating: 4.1, risk_level: 'high', payment_terms: 'Advance', contact_email: 'hello@quickdeals.example', categories: ['IT Hardware'] }
    ];

    const catalog: VendorCatalogItem[] = [
      { id: 'c1', vendor_id: 'v-technova', category: 'IT Hardware', item_name: 'Business Laptop 14"', spec: '16GB/512GB', unit_price: 98000, stock_qty: 4, lead_time_days: 5 },
      { id: 'c2', vendor_id: 'v-prime', category: 'IT Hardware', item_name: 'Business Laptop 14"', spec: '16GB/512GB', unit_price: 104000, stock_qty: 50, lead_time_days: 7 },
      { id: 'c3', vendor_id: 'v-globex', category: 'IT Hardware', item_name: 'Business Laptop 14"', spec: '16GB/512GB', unit_price: 95000, stock_qty: 100, lead_time_days: 21 },
      { id: 'c4', vendor_id: 'v-quick', category: 'IT Hardware', item_name: 'Business Laptop 14"', spec: '16GB/512GB', unit_price: 85000, stock_qty: 500, lead_time_days: 3 }
    ];

    const candidates = catalog.map((c) => ({
      vendor: vendors.find((v) => v.id === c.vendor_id)!,
      catalogItem: c,
      quantity: 10,
      neededByDays: 21
    }));

    const initialRank = rankVendors(candidates, { neededByDays: 21 });
    expect(initialRank[0].vendorName).toBe('TechNova Systems');
    const quickDeals = initialRank.find((q) => q.vendorName === 'QuickDeals Traders');
    expect(quickDeals?.excludedReason).toBe('Vendor not approved');

    // Re-plan excluding TechNova (only 4 in stock for 10 laptops)
    const replanRank = rankVendors(candidates, {
      excludeVendorIds: ['v-technova'],
      neededByDays: 21
    });
    expect(replanRank[0].vendorName).toBe('Prime Infotech');
    expect(replanRank[0].total).toBe(1040000);
  });

  it('parses all four demo request prompts accurately with heuristicParseRequest', () => {
    // Prompt 1: Design chairs
    const p1 = heuristicParseRequest('Order 20 ergonomic office chairs for the Design studio.');
    expect(p1.category).toBe('Furniture');
    expect(p1.items[0].name.toLowerCase()).toContain('chair');
    expect(p1.items[0].quantity).toBe(20);

    // Prompt 2: Design team laptops
    const p2 = heuristicParseRequest(
      '10 laptops for the new design team, around ₹12 lakh, needed in 3 weeks.'
    );
    expect(p2.category).toBe('IT Hardware');
    expect(p2.items[0].name.toLowerCase()).toContain('laptop');
    expect(p2.items[0].quantity).toBe(10);
    expect(p2.statedBudget).toBe(1200000);
    expect(p2.neededByDays).toBe(21);

    // Prompt 3: Engineering software licenses
    const p3 = heuristicParseRequest(
      'Buy 5 annual project-management software licenses for Engineering.'
    );
    expect(p3.category).toBe('Software Licenses');
    expect(p3.items[0].name.toLowerCase()).toContain('project management');
    expect(p3.items[0].quantity).toBe(5);

    // Prompt 4: Prohibited gift cards
    const p4 = heuristicParseRequest(
      'Purchase 200 gift cards worth ₹500 each as employee rewards.'
    );
    expect(p4.category).toBe('Prohibited Items');
    expect(p4.items[0].name.toLowerCase()).toContain('gift card');
    expect(p4.items[0].quantity).toBe(200);
    expect(p4.statedBudget).toBe(100000);
  });

  it('matches catalog items deterministically', () => {
    const catalog: VendorCatalogItem[] = [
      { id: 'c1', vendor_id: 'v1', category: 'IT Hardware', item_name: 'Business Laptop 14"', spec: '16GB RAM', unit_price: 98000, stock_qty: 4, lead_time_days: 5 },
      { id: 'c2', vendor_id: 'v1', category: 'IT Hardware', item_name: 'Monitor 27" 4K', spec: 'IPS', unit_price: 32000, stock_qty: 60, lead_time_days: 4 }
    ];
    const matched = matchCatalogItems(catalog, 'IT Hardware', 'laptops');
    expect(matched).toHaveLength(1);
    expect(matched[0].item_name).toBe('Business Laptop 14"');
  });

  it('validates agent outputs with Zod schemas', () => {
    const validPlan = OrchestratorPlanSchema.safeParse({
      parsed: {
        category: 'Software Licenses',
        items: [{ name: 'Project Management Tool (annual seat)', quantity: 5, specHint: 'Team plan' }],
        statedBudget: null,
        neededByDays: null,
        summary: '5 annual software seats'
      },
      plan: [{ id: 'policy_check', agent: 'policy', goal: 'Check software policy' }],
      rationale: 'Standard software request.',
      confidence: 0.95
    });
    expect(validPlan.success).toBe(true);

    const validPolicy = PolicyAgentOutputSchema.safeParse({
      status: 'passed',
      policy: { category: 'Software Licenses', autoApproveLimit: 25000, managerLimit: 300000, minQuotes: 1 },
      violations: [],
      justificationRequired: false,
      justificationProvided: false,
      rationale: 'Compliant.',
      confidence: 0.98
    });
    expect(validPolicy.success).toBe(true);

    const validVendor = VendorAgentOutputSchema.safeParse({
      status: 'selected',
      considered: [],
      selected: {
        vendorId: 'v1',
        vendorName: 'SoftSuite Reseller',
        itemName: 'Project Management Tool (annual seat)',
        quantity: 5,
        unitPrice: 4800,
        total: 24000,
        leadTimeDays: 1,
        riskLevel: 'low',
        expectedDelivery: '2026-11-01'
      },
      failedVendorId: null,
      fallbackUsed: false,
      rationale: 'Best approved vendor.',
      confidence: 0.95
    });
    expect(validVendor.success).toBe(true);
  });
});
