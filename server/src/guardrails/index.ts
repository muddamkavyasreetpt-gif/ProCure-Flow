import { Policy, Budget, Vendor, VendorCatalogItem } from '../types';

export type ApprovalRoute = 'auto' | 'manager' | 'finance';

const ROUTE_RANK: Record<ApprovalRoute, number> = {
  auto: 0,
  manager: 1,
  finance: 2
};

export function isBlocked(policy: Pick<Policy, 'is_blocked'> | null | undefined): boolean {
  return Boolean(policy?.is_blocked);
}

export function recomputeTotal(unitPrice: number, quantity: number): number {
  const raw = Number(unitPrice) * Number(quantity);
  return Math.round(raw * 100) / 100;
}

export function assertBudgetAvailable(
  budget: Pick<Budget, 'total_amount' | 'reserved_amount' | 'spent_amount'>,
  amount: number
): { ok: boolean; available: number; requested: number } {
  const available =
    Math.round(
      (Number(budget.total_amount) - Number(budget.reserved_amount) - Number(budget.spent_amount)) * 100
    ) / 100;
  const requested = Math.round(Number(amount) * 100) / 100;
  return {
    ok: requested <= available,
    available,
    requested
  };
}

export function computeMaxAffordableQuantity(
  availableBudget: number,
  cheapestUnitPrice: number
): number {
  if (cheapestUnitPrice <= 0 || availableBudget <= 0) return 0;
  return Math.floor(availableBudget / cheapestUnitPrice);
}

export function maxRoute(a: ApprovalRoute, b: ApprovalRoute): ApprovalRoute {
  return ROUTE_RANK[a] >= ROUTE_RANK[b] ? a : b;
}

export interface RouteConditionFlags {
  justificationMissing?: boolean;
  quotesBelowMin?: boolean;
}

export function computeRequiredRoute(
  total: number,
  policy: Pick<
    Policy,
    'auto_approve_limit' | 'manager_limit' | 'min_quotes' | 'requires_justification_above'
  >,
  vendorRisk: 'low' | 'medium' | 'high',
  flags: RouteConditionFlags = {}
): ApprovalRoute {
  // 1. Base route from policy spend thresholds
  let route: ApprovalRoute;
  if (total <= Number(policy.auto_approve_limit)) {
    route = 'auto';
  } else if (total <= Number(policy.manager_limit)) {
    route = 'manager';
  } else {
    route = 'finance';
  }

  // 2. Vendor risk adjustments:
  // medium raises by one step (auto->manager, manager->finance); high always means finance.
  // auto additionally requires vendor risk low.
  if (vendorRisk === 'high') {
    route = 'finance';
  } else if (vendorRisk === 'medium') {
    route = route === 'auto' ? 'manager' : 'finance';
  }

  // 3. Floors (raise route to at least manager, never reject):
  // - justification required (amount > requires_justification_above) but not provided
  // - fewer distinct approved quotes than min_quotes
  const justificationFloorApplies =
    Boolean(flags.justificationMissing) && total > Number(policy.requires_justification_above);
  const quotesFloorApplies = Boolean(flags.quotesBelowMin);

  if (justificationFloorApplies || quotesFloorApplies) {
    route = maxRoute(route, 'manager');
  }

  return route;
}

export interface VendorCandidateInput {
  vendor: Vendor;
  catalogItem: VendorCatalogItem;
  quantity: number;
  neededByDays?: number | null;
}

export interface RankedVendorQuote {
  vendorId: string;
  vendorName: string;
  itemName: string;
  spec: string;
  quantity: number;
  unitPrice: number;
  total: number;
  leadTimeDays: number;
  rating: number;
  riskLevel: 'low' | 'medium' | 'high';
  approved: boolean;
  stockQty: number;
  score: number;
  stockOk: boolean | null;
  excludedReason: string | null;
}

export function scoreVendor(params: {
  total: number;
  minTotal: number;
  leadTimeDays: number;
  maxLeadTimeAmongCandidates: number;
  neededByDays?: number | null;
  rating: number;
  riskLevel: 'low' | 'medium' | 'high';
}): number {
  const { total, minTotal, leadTimeDays, maxLeadTimeAmongCandidates, neededByDays, rating, riskLevel } = params;
  const priceScore = total > 0 ? minTotal / total : 0;
  const denom = Math.max(maxLeadTimeAmongCandidates, neededByDays ?? 30, 1);
  const deliveryScore = 1 - leadTimeDays / denom;
  const ratingScore = Number(rating) / 5;
  const riskScore = riskLevel === 'low' ? 1 : riskLevel === 'medium' ? 0.5 : 0;

  let score = 0.45 * priceScore + 0.25 * deliveryScore + 0.20 * ratingScore + 0.10 * riskScore;
  if (neededByDays !== null && neededByDays !== undefined && leadTimeDays > neededByDays) {
    score -= 0.3;
  }

  return Math.round(score * 10000) / 10000;
}

export function rankVendors(
  candidates: VendorCandidateInput[],
  options: { excludeVendorIds?: string[]; neededByDays?: number | null } = {}
): RankedVendorQuote[] {
  const excludeSet = new Set(options.excludeVendorIds || []);
  const neededByDays = options.neededByDays ?? null;

  // Separate eligible (approved and not excluded) vs excluded candidates
  const eligible = candidates.filter((c) => c.vendor.approved && !excludeSet.has(c.vendor.id));

  const minTotal =
    eligible.length > 0
      ? Math.min(...eligible.map((c) => recomputeTotal(c.catalogItem.unit_price, c.quantity)))
      : 0;

  const maxLeadTimeAmongCandidates =
    eligible.length > 0
      ? Math.max(...eligible.map((c) => Number(c.catalogItem.lead_time_days)))
      : 1;

  const quotes: RankedVendorQuote[] = candidates.map((c) => {
    const unitPrice = Number(c.catalogItem.unit_price);
    const total = recomputeTotal(unitPrice, c.quantity);
    const leadTimeDays = Number(c.catalogItem.lead_time_days);
    const rating = Number(c.vendor.rating);
    const riskLevel = c.vendor.risk_level;

    if (!c.vendor.approved) {
      return {
        vendorId: c.vendor.id,
        vendorName: c.vendor.name,
        itemName: c.catalogItem.item_name,
        spec: c.catalogItem.spec,
        quantity: c.quantity,
        unitPrice,
        total,
        leadTimeDays,
        rating,
        riskLevel,
        approved: false,
        stockQty: Number(c.catalogItem.stock_qty),
        score: 0,
        stockOk: null,
        excludedReason: 'Vendor not approved'
      };
    }

    if (excludeSet.has(c.vendor.id)) {
      return {
        vendorId: c.vendor.id,
        vendorName: c.vendor.name,
        itemName: c.catalogItem.item_name,
        spec: c.catalogItem.spec,
        quantity: c.quantity,
        unitPrice,
        total,
        leadTimeDays,
        rating,
        riskLevel,
        approved: true,
        stockQty: Number(c.catalogItem.stock_qty),
        score: 0,
        stockOk: false,
        excludedReason: 'Excluded after stock check failure'
      };
    }

    const score = scoreVendor({
      total,
      minTotal,
      leadTimeDays,
      maxLeadTimeAmongCandidates,
      neededByDays,
      rating,
      riskLevel
    });

    return {
      vendorId: c.vendor.id,
      vendorName: c.vendor.name,
      itemName: c.catalogItem.item_name,
      spec: c.catalogItem.spec,
      quantity: c.quantity,
      unitPrice,
      total,
      leadTimeDays,
      rating,
      riskLevel,
      approved: true,
      stockQty: Number(c.catalogItem.stock_qty),
      score,
      stockOk: null,
      excludedReason: null
    };
  });

  // Sort eligible first descending by score (tie-break by lower total), then excluded
  quotes.sort((a, b) => {
    const aExcluded = a.excludedReason !== null;
    const bExcluded = b.excludedReason !== null;
    if (aExcluded !== bExcluded) {
      return aExcluded ? 1 : -1;
    }
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.total - b.total;
  });

  return quotes;
}

// Deterministic normalised token-overlap catalog matching
function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .map((t) => {
      if (t.endsWith('ies') && t.length > 4) return t.slice(0, -3) + 'y';
      if (t.endsWith('s') && !t.endsWith('ss') && t.length > 3) return t.slice(0, -1);
      return t;
    });
}

export function matchCatalogItems(
  catalog: VendorCatalogItem[],
  category: string,
  requestedItemName: string
): VendorCatalogItem[] {
  const categoryItems = catalog.filter(
    (c) => c.category.toLowerCase() === category.toLowerCase()
  );
  if (categoryItems.length === 0) return [];

  const queryTokens = normalizeTokens(requestedItemName);
  // Add helpful domain synonyms so e.g. "software licenses" or "project management licenses" matches "Project Management Tool (annual seat)"
  if (queryTokens.includes('license') || queryTokens.includes('software')) {
    if (!queryTokens.includes('design')) {
      queryTokens.push('project', 'management', 'tool', 'seat');
    }
  }

  let bestScore = 0;
  const scoredByItemName = new Map<string, number>();

  for (const item of categoryItems) {
    const itemTokens = normalizeTokens(item.item_name + ' ' + item.spec);
    let overlap = 0;
    for (const qt of queryTokens) {
      if (itemTokens.some((it) => it === qt || it.includes(qt) || qt.includes(it))) {
        overlap++;
      }
    }
    const prev = scoredByItemName.get(item.item_name) ?? 0;
    if (overlap > prev) {
      scoredByItemName.set(item.item_name, overlap);
    }
    if (overlap > bestScore) {
      bestScore = overlap;
    }
  }

  if (bestScore === 0) {
    return [];
  }

  // Pick the canonical catalog item_name with highest token overlap
  let bestItemName = '';
  let maxOverlap = -1;
  for (const [name, score] of scoredByItemName.entries()) {
    if (score > maxOverlap) {
      maxOverlap = score;
      bestItemName = name;
    }
  }

  return categoryItems.filter((c) => c.item_name === bestItemName);
}
