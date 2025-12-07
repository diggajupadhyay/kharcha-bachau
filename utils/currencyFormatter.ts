/**
 * Get currency symbol - always Nepali Rupee (रु)
 */
export const getCurrencySymbol = (): string => {
  return 'रु';
};

/**
 * Format currency amount with Nepali locale formatting
 */
export const formatCurrency = (amount: number, showSymbol: boolean = true): string => {
  const formatted = new Intl.NumberFormat('ne-NP', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
  
  if (showSymbol) {
    return `रु ${formatted}`;
  }
  
  return formatted;
};

/**
 * Format currency amount for display (simplified version matching current app style)
 */
export const formatCurrencyAmount = (amount: number): string => {
  return amount.toLocaleString('ne-NP', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

