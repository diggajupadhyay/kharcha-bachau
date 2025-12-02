export type CountryCode = 'np' | 'in' | 'au';

export interface Country {
  code: CountryCode;
  name: string;
  name_np: string;
  currency: {
    symbol: string;
    code: string;
  };
  dateFormat: string;
  locale: string;
  flag: string;
}

export const COUNTRIES: Record<CountryCode, Country> = {
  np: {
    code: 'np',
    name: 'Nepal',
    name_np: 'नेपाल',
    currency: {
      symbol: 'रु',
      code: 'NPR'
    },
    dateFormat: 'DD/MM/YYYY',
    locale: 'en-NP',
    flag: '🇳🇵'
  },
  in: {
    code: 'in',
    name: 'India',
    name_np: 'भारत',
    currency: {
      symbol: '₹',
      code: 'INR'
    },
    dateFormat: 'DD/MM/YYYY',
    locale: 'en-IN',
    flag: '🇮🇳'
  },
  au: {
    code: 'au',
    name: 'Australia',
    name_np: 'अस्ट्रेलिया',
    currency: {
      symbol: '$',
      code: 'AUD'
    },
    dateFormat: 'DD/MM/YYYY',
    locale: 'en-AU',
    flag: '🇦🇺'
  }
};

export const DEFAULT_COUNTRY: CountryCode = 'np';

