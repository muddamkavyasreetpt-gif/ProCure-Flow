export interface QuoteCandidate {
  vendorId?: string;
  vendorName?: string;
  total?: number;
  approved?: boolean;
  stockOk?: boolean | null;
  excludedReason?: string | null;
}

export interface QuoteSavingsResult {
  selectedTotal: number;
  highestApprovedTotal: number;
  nextBestTotal: number;
  savingsVsHighest: number;
  savingsVsNextBest: number;
}

export function computeQuoteSavings(
  selectedTotal: number,
  consideredQuotes: QuoteCandidate[] = []
): QuoteSavingsResult {
  const approvedEligibleQuotes = consideredQuotes.filter(
    (q) => q.approved !== false && q.excludedReason === null && Number(q.total) > 0
  );

  const totals = approvedEligibleQuotes.map((q) => Number(q.total)).sort((a, b) => a - b);

  if (totals.length === 0 || selectedTotal <= 0) {
    return {
      selectedTotal,
      highestApprovedTotal: selectedTotal,
      nextBestTotal: selectedTotal,
      savingsVsHighest: 0,
      savingsVsNextBest: 0
    };
  }

  const highestApprovedTotal = Math.max(...totals, selectedTotal);
  const greaterQuotes = totals.filter((t) => t > selectedTotal);
  const nextBestTotal = greaterQuotes.length > 0 ? greaterQuotes[0] : selectedTotal;

  const savingsVsHighest = Math.max(0, Math.round((highestApprovedTotal - selectedTotal) * 100) / 100);
  const savingsVsNextBest = Math.max(0, Math.round((nextBestTotal - selectedTotal) * 100) / 100);

  return {
    selectedTotal,
    highestApprovedTotal,
    nextBestTotal,
    savingsVsHighest,
    savingsVsNextBest
  };
}
