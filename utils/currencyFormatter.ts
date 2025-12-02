import { CountryCode, COUNTRIES } from '../constants/countries';

/**
 * Get currency symbol for a country
 */
export const getCurrencySymbol = (countryCode: CountryCode): string => {
  return COUNTRIES[countryCode].currency.symbol;
};

/**
 * Format currency amount with locale-specific formatting
 */
export const formatCurrency = (amount: number, countryCode: CountryCode, showSymbol: boolean = true): string => {
  const country = COUNTRIES[countryCode];
  const formatted = new Intl.NumberFormat(country.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
  
  if (showSymbol) {
    // For Nepal and India, symbol comes before; for Australia, symbol comes before
    // All three use prefix positioning
    return `${country.currency.symbol} ${formatted}`;
  }
  
  return formatted;
};

/**
 * Format currency amount for display (simplified version matching current app style)
 */
export const formatCurrencyAmount = (amount: number, countryCode: CountryCode): string => {
  const country = COUNTRIES[countryCode];
  return amount.toLocaleString(country.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

