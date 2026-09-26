export const getCurrencySymbol = (): string => {
  return 'Rs.';
};

/** Groups digits (1,234,567) for display. Falls back to the raw number if Intl is unavailable. */
export const formatAmount = (amount: number): string => {
  if (!Number.isFinite(amount)) return '0';
  try {
    return amount.toLocaleString('en-US');
  } catch {
    return String(amount);
  }
};
