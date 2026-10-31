export const VALID_CATEGORIES = [
  'IT Hardware',
  'Software Licenses',
  'Office Supplies',
  'Furniture',
  'Marketing Services',
  'Travel & Events',
  'Prohibited Items'
] as const;

export type ProcurementCategory = (typeof VALID_CATEGORIES)[number];

export interface HeuristicParsedResult {
  category: ProcurementCategory;
  items: Array<{ name: string; quantity: number; specHint: string }>;
  statedBudget: number | null;
  neededByDays: number | null;
  summary: string;
}

export function heuristicParseRequest(rawText: string): HeuristicParsedResult {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  // 1. Category inference
  let category: ProcurementCategory = 'IT Hardware';
  if (
    /\b(gift\s*cards?|cash\s*equivalents?|crypto(?:currency)?|bitcoin|personal\s*items?|liquor|alcohol|gambling)\b/i.test(
      lower
    )
  ) {
    category = 'Prohibited Items';
  } else if (/\b(chairs?|desks?|furniture|ergonomic|storage)\b/i.test(lower)) {
    category = 'Furniture';
  } else if (/\b(licenses?|software|saas|project[- ]management|design\s*suite|seats?)\b/i.test(lower)) {
    category = 'Software Licenses';
  } else if (/\b(paper|reams?|stationery|office\s*supplies|pantry|consumables?)\b/i.test(lower)) {
    category = 'Office Supplies';
  } else if (/\b(campaigns?|brand\s*video|video\s*production|marketing\s*services?|creatives?|agency)\b/i.test(lower)) {
    category = 'Marketing Services';
  } else if (/\b(venue|conference|travel|flights?|hotels?|events?)\b/i.test(lower)) {
    category = 'Travel & Events';
  } else if (/\b(laptops?|monitors?|hardware|peripherals?|networking)\b/i.test(lower)) {
    category = 'IT Hardware';
  }

  // 2. Quantity extraction (first integer before item keywords or first standalone integer)
  let quantity = 1;
  const qtyBeforeNoun = lower.match(
    /\b(\d+)\s+(?:annual\s+|monthly\s+|ergonomic\s+|office\s+|business\s+|new\s+|project[- ]management\s+|software\s+)*(?:laptops?|monitors?|chairs?|desks?|licenses?|seats?|tools?|gift\s*cards?|reams?|campaigns?|videos?|days?|guests?|packages?|units?|items?)\b/i
  );
  if (qtyBeforeNoun) {
    quantity = Math.max(1, parseInt(qtyBeforeNoun[1], 10));
  } else {
    const firstInt = lower.match(/\b(\d+)\b/);
    if (firstInt) {
      quantity = Math.max(1, parseInt(firstInt[1], 10));
    }
  }

  // 3. Stated budget extraction (INR: ₹12 lakh, 12 lakh, worth ₹500 each, ₹500000)
  let statedBudget: number | null = null;
  const lakhMatch = lower.match(/(?:₹|rs\.?\s*|inr\s*)?(\d+(?:\.\d+)?)\s*lakhs?\b/i);
  const eachMatch = lower.match(/worth\s*(?:₹|rs\.?\s*|inr\s*)?([\d,]+)\s*each/i);
  const explicitRupeeMatch = text.match(/₹\s*([\d,]+(?:\.\d+)?)/);

  if (lakhMatch) {
    statedBudget = Math.round(parseFloat(lakhMatch[1]) * 100000);
  } else if (eachMatch) {
    const unitVal = parseFloat(eachMatch[1].replace(/,/g, ''));
    statedBudget = Math.round(unitVal * quantity);
  } else if (explicitRupeeMatch) {
    const rawNum = parseFloat(explicitRupeeMatch[1].replace(/,/g, ''));
    if (!Number.isNaN(rawNum) && rawNum > 0) {
      statedBudget = rawNum;
    }
  }

  // 4. Needed-by days extraction ("in 3 weeks", "within 10 days")
  let neededByDays: number | null = null;
  const weeksMatch = lower.match(/\b(?:in|within|by)\s+(\d+)\s*weeks?\b/i);
  const daysMatch = lower.match(/\b(?:in|within|by)\s+(\d+)\s*days?\b/i);
  if (weeksMatch) {
    neededByDays = parseInt(weeksMatch[1], 10) * 7;
  } else if (daysMatch) {
    neededByDays = parseInt(daysMatch[1], 10);
  }

  // 5. Canonical item name & specHint
  let itemName = 'Business Laptop 14"';
  let specHint = 'Standard corporate specification';

  if (category === 'Prohibited Items') {
    itemName = 'Gift Cards';
    specHint = 'Employee reward gift cards';
  } else if (category === 'Furniture') {
    if (lower.includes('desk')) {
      itemName = 'Standing Desk';
      specHint = 'Electric, 140cm';
    } else {
      itemName = 'Ergonomic Office Chair';
      specHint = 'Mesh back, lumbar support';
    }
  } else if (category === 'Software Licenses') {
    if (lower.includes('design suite')) {
      itemName = 'Design Suite (annual seat)';
      specHint = 'Pro plan';
    } else {
      itemName = 'Project Management Tool (annual seat)';
      specHint = 'Team plan annual license';
    }
  } else if (category === 'Office Supplies') {
    itemName = 'A4 Paper Ream (500)';
    specHint = '75 GSM';
  } else if (category === 'Marketing Services') {
    if (lower.includes('video')) {
      itemName = 'Brand Video Production';
      specHint = '60-second explainer';
    } else {
      itemName = 'Social Media Campaign (monthly)';
      specHint = 'Strategy + 12 creatives';
    }
  } else if (category === 'Travel & Events') {
    if (lower.includes('travel') || lower.includes('flight')) {
      itemName = 'Group Travel Package (per person)';
      specHint = 'Return flight + hotel';
    } else {
      itemName = 'Conference Venue Booking (per day)';
      specHint = 'Up to 150 guests';
    }
  } else {
    if (lower.includes('monitor')) {
      itemName = 'Monitor 27" 4K';
      specHint = 'IPS, USB-C';
    } else {
      itemName = 'Business Laptop 14"';
      specHint = '16GB RAM / 512GB SSD / i7';
    }
  }

  return {
    category,
    items: [{ name: itemName, quantity, specHint }],
    statedBudget,
    neededByDays,
    summary: `Request for ${quantity} × ${itemName} under ${category}`
  };
}
