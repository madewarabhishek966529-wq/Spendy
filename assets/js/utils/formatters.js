// ============================================================================
// Spendy — Formatting Utilities
// Shared currency + date formatting so every page renders numbers the same
// way. Currency defaults to INR (₹) per the product brief's example copy;
// pass a different code if a user's profile.currency is ever non-default.
// ============================================================================

const currencyFormatters = new Map();

function getCurrencyFormatter(currencyCode) {
  if (!currencyFormatters.has(currencyCode)) {
    currencyFormatters.set(
      currencyCode,
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: currencyCode,
        maximumFractionDigits: 0,
      })
    );
  }
  return currencyFormatters.get(currencyCode);
}

/** Format a numeric amount as currency, e.g. formatCurrency(2450) -> "₹2,450" */
export function formatCurrency(amount, currencyCode = 'INR') {
  const value = Number(amount);
  if (!Number.isFinite(value)) return getCurrencyFormatter(currencyCode).format(0);
  return getCurrencyFormatter(currencyCode).format(value);
}

/** Compact form for tight spaces, e.g. formatCurrencyCompact(125000) -> "₹1.25L"-ish via Intl compact */
export function formatCurrencyCompact(amount, currencyCode = 'INR') {
  const value = Number(amount) || 0;
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currencyCode,
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  return formatter.format(value);
}

/** "12 Jul" style short date for lists */
export function formatDateShort(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/** "12 July 2026" style long date */
export function formatDateLong(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Relative label used in recent-transactions lists: Today / Yesterday / short date */
export function formatRelativeDate(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '—';

  const today = new Date();
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffDays = Math.round(
    (startOfDay(today) - startOfDay(d)) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return formatDateShort(d);
}

/** Signed percentage change, e.g. formatPercentChange(120, 100) -> "+20%" */
export function formatPercentChange(current, previous) {
  const curr = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) return curr === 0 ? '0%' : '+100%';
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}%`;
}
