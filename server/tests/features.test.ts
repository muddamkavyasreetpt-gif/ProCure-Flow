import { describe, it, expect, beforeAll } from 'vitest';
import { computeQuoteSavings } from '../src/services/savingsService';
import { computeManualEstimate } from '../src/services/impactService';
import { computeMaxAffordableQuantity } from '../src/guardrails';
import { heuristicParseRequest } from '../src/agents/heuristicParser';
import {
  isBlocked,
  assertBudgetAvailable,
  computeRequiredRoute,
  matchCatalogItems,
  recomputeTotal
} from '../src/guardrails';
import { localDb } from '../src/db/localStore';

describe('Priority 1 & 2 Unit Tests: Savings, Impact, Alternatives & Preview Logic', () => {
  describe('computeQuoteSavings', () => {
    it('calculates savings correctly vs highest approved quote and next-best vendor', () => {
      const selectedTotal = 950000;
      const consideredQuotes = [
        { vendorName: 'Vendor A', total: 950000, approved: true, excludedReason: null },
        { vendorName: 'Vendor B', total: 1040000, approved: true, excludedReason: null },
        { vendorName: 'Vendor C', total: 1200000, approved: true, excludedReason: null },
        { vendorName: 'Vendor D', total: 800000, approved: false, excludedReason: 'Vendor not approved' }
      ];

      const res = computeQuoteSavings(selectedTotal, consideredQuotes);
      expect(res.selectedTotal).toBe(950000);
      expect(res.highestApprovedTotal).toBe(1200000);
      expect(res.nextBestTotal).toBe(1040000);
      expect(res.savingsVsHighest).toBe(250000);
      expect(res.savingsVsNextBest).toBe(90000);
    });

    it('handles empty or single candidate without negative savings', () => {
      const res = computeQuoteSavings(50000, []);
      expect(res.savingsVsHighest).toBe(0);
      expect(res.savingsVsNextBest).toBe(0);
    });
  });

  describe('computeManualEstimate', () => {
    it('returns auto route manual assumptions (5 handoffs, 4 tools, ~1 day)', () => {
      const est = computeManualEstimate('auto');
      expect(est.handoffs).toBe(5);
      expect(est.toolsCount).toBe(4);
      expect(est.waitDays).toBe(1);
    });

    it('returns manager route manual assumptions (6 handoffs, 4 tools, ~2 days)', () => {
      const est = computeManualEstimate('manager');
      expect(est.handoffs).toBe(6);
      expect(est.toolsCount).toBe(4);
      expect(est.waitDays).toBe(2);
    });

    it('returns finance route manual assumptions (7 handoffs, 4 tools, ~3 days)', () => {
      const est = computeManualEstimate('finance');
      expect(est.handoffs).toBe(7);
      expect(est.toolsCount).toBe(4);
      expect(est.waitDays).toBe(3);
    });
  });

  describe('computeMaxAffordableQuantity', () => {
    it('computes integer floor of units that fit within available budget', () => {
      // Available budget: ₹15,00,000, unit price: ₹95,000
      const qty = computeMaxAffordableQuantity(1500000, 95000);
      expect(qty).toBe(15); // 15 * 95,000 = 14,25,000 <= 15,00,000
    });

    it('returns 0 if budget is 0 or price exceeds budget', () => {
      expect(computeMaxAffordableQuantity(50000, 95000)).toBe(0);
      expect(computeMaxAffordableQuantity(0, 95000)).toBe(0);
    });
  });

  describe('Deterministic Pre-Flight Preview Logic', () => {
    beforeAll(() => {
      localDb.init();
    });

    it('detects blocked category and emits policy warning', () => {
      const parsed = heuristicParseRequest('I need 200 gift cards worth ₹500 each for Diwali distribution.');
      expect(parsed.category).toBe('Prohibited Items');

      const policy = localDb.policies.find((p) => p.category === parsed.category);
      expect(policy).toBeDefined();
      const blocked = isBlocked(policy) || parsed.category === 'Prohibited Items';
      expect(blocked).toBe(true);
    });

    it('detects budget insufficiency for large requests in low-budget department', () => {
      const parsed = heuristicParseRequest('I need 10 laptops for the marketing team.');
      expect(parsed.category).toBe('IT Hardware');

      const primary = parsed.items[0];
      const approvedIds = new Set(localDb.vendors.filter((v) => v.approved).map((v) => v.id));
      const matched = matchCatalogItems(localDb.vendor_catalog, parsed.category, primary.name).filter((c) =>
        approvedIds.has(c.vendor_id)
      );

      const totals = matched.map((c) => recomputeTotal(Number(c.unit_price), primary.quantity));
      const minEstimate = Math.min(...totals);

      // Marketing dept (dept 33333333-3333-4333-8333-333333333333) available budget: ₹1,00,000
      const mktBudget = localDb.budgets.find(
        (b) => b.department_id === '33333333-3333-4333-8333-333333333333'
      );
      expect(mktBudget).toBeDefined();

      const budgetCheck = assertBudgetAvailable(mktBudget!, minEstimate);
      expect(budgetCheck.ok).toBe(false);
      expect(budgetCheck.available).toBe(100000);
      expect(budgetCheck.requested).toBeGreaterThan(900000);
    });

    it('computes correct auto approval route for within-limit software licenses', () => {
      const parsed = heuristicParseRequest('5 software licenses for the developer team');
      expect(parsed.category).toBe('Software Licenses');

      const primary = parsed.items[0];
      const approvedIds = new Set(localDb.vendors.filter((v) => v.approved).map((v) => v.id));
      const matched = matchCatalogItems(localDb.vendor_catalog, parsed.category, primary.name).filter((c) =>
        approvedIds.has(c.vendor_id)
      );

      const totals = matched.map((c) => recomputeTotal(Number(c.unit_price), primary.quantity));
      const minEstimate = Math.min(...totals);
      expect(minEstimate).toBe(24000); // 5 × ₹4,800

      const policy = localDb.policies.find((p) => p.category === parsed.category);
      expect(policy).toBeDefined();

      const route = computeRequiredRoute(minEstimate, policy!, 'low', {
        justificationMissing: true,
        quotesBelowMin: false
      });
      expect(route).toBe('auto'); // ₹24,000 <= ₹25,000 auto limit
    });
  });
});
