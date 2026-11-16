/**
 * Admin Billing read-only display helpers.
 * Never turn missing/invalid RPC fields into zero-value financial claims.
 */
const validNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)$/.test(value.trim())) {
    return null;
  }
  const number = Number(value.trim());
  return Number.isFinite(number) ? number : null;
};

export const formatBillingCount = (value) => {
  const count = validNumber(value);
  if (count === null || !Number.isSafeInteger(count) || count < 0) return '—';
  return count.toLocaleString('en-PH');
};

export const formatBillingPeso = (centavos) => {
  const amount = validNumber(centavos);
  if (amount === null || !Number.isSafeInteger(amount) || amount < 0) return '—';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount / 100);
};

export const formatBillingDate = (value) => {
  if (typeof value !== 'string' || !value.trim()) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
};
