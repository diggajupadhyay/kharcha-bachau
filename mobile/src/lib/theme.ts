/**
 * Design tokens ported from the web app's CSS (emerald/slate/rose scales,
 * category tile colors). Single source of truth for the RN stylesheets.
 */

export const colors = {
  // Primary
  emerald50: '#ecfdf5',
  emerald100: '#d1fae5',
  emerald200: '#a7f3d0',
  emerald300: '#6ee7b7',
  emerald400: '#34d399',
  emerald500: '#10b981',
  emerald600: '#059669',
  emerald700: '#047857',

  // Danger
  rose50: '#fff1f2',
  rose100: '#ffe4e6',
  rose400: '#fb7185',
  rose500: '#f43f5e',
  rose600: '#e11d48',
  rose700: '#be123c',

  // Neutrals (slate)
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#e2e8f0',
  slate300: '#cbd5e1',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate600: '#475569',
  slate700: '#334155',
  slate900: '#0f172a',

  white: '#ffffff',

  // Warning (budget progress past 80%)
  orange400: '#fb923c',
  orange500: '#f97316',
};

// Category tile colors: the categories carry Tailwind class strings (shared with
// the cloud data model), mapped here to the real hex values.
const CATEGORY_BG: Record<string, string> = {
  'bg-orange-100': '#ffedd5',
  'bg-blue-100': '#dbeafe',
  'bg-pink-100': '#fce7f3',
  'bg-yellow-100': '#fef9c3',
  'bg-red-100': '#fee2e2',
  'bg-indigo-100': '#e0e7ff',
  'bg-purple-100': '#f3e8ff',
  'bg-teal-100': '#ccfbf1',
  'bg-gray-100': '#f3f4f6',
  'bg-slate-100': '#f1f5f9',
};

const CATEGORY_TEXT: Record<string, string> = {
  'text-orange-600': '#ea580c',
  'text-blue-600': '#2563eb',
  'text-pink-600': '#db2777',
  'text-yellow-600': '#ca8a04',
  'text-red-600': '#dc2626',
  'text-indigo-600': '#4f46e5',
  'text-purple-600': '#9333ea',
  'text-teal-600': '#0d9488',
  'text-gray-600': '#4b5563',
  'text-slate-600': '#475569',
};

export const parseCategoryColor = (color?: string): { bg: string; text: string } => {
  const [bgClass = '', textClass = ''] = (color || 'bg-slate-100 text-slate-600').split(' ');
  return {
    bg: CATEGORY_BG[bgClass] ?? '#f1f5f9',
    text: CATEGORY_TEXT[textClass] ?? '#475569',
  };
};

export const radius = {
  card: 20,
  input: 14,
  button: 14,
  tile: 16,
};

export const touchTarget = 48;
