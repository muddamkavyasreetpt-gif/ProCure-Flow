export function formatCurrency(amount: number | null | undefined, _currency = 'INR'): string {
  const safeAmount = Number(amount ?? 0);
  if (!Number.isFinite(safeAmount)) {
    return '₹0';
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(safeAmount);
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return String(dateString);
  return d.toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDuration(ms: number | null | undefined): string {
  const val = Number(ms ?? 0);
  if (val < 1000) return `${val}ms`;
  return `${(val / 1000).toFixed(1)}s`;
}
