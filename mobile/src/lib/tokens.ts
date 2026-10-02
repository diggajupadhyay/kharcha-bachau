/**
 * Design tokens.
 *
 * Direction: calm and typographic. A near-monochrome surface ramp does the
 * structural work, a single restrained accent is reserved for the one thing that
 * matters most on a screen, and hierarchy comes from type scale and space rather
 * than from colour. The earlier palette used emerald for the FAB, the active chip,
 * the status badge, the budget bar, the tick and the settle button — with
 * everything accented, nothing was.
 *
 * Every token exists in a light and a dark value. Screens read semantic names
 * (`surface`, `textSecondary`, `danger`) and never a raw hex, so a theme switch is
 * a token swap rather than a rewrite of every component.
 */

export type ThemeName = 'light' | 'dark';

/** A very slightly warm grey ramp — pure blue-grey reads clinical, pure grey reads dead. */
const neutralLight = {
  0: '#ffffff',
  25: '#fcfcfb',
  50: '#f7f7f5',
  100: '#f1f1ee',
  150: '#e8e8e3',
  200: '#deded8',
  300: '#c9c9c1',
  400: '#a3a39a',
  500: '#7c7c73',
  600: '#5c5c55',
  700: '#43433e',
  800: '#2b2b28',
  900: '#1a1a18',
  950: '#111110',
} as const;

const neutralDark = {
  0: '#131312',
  25: '#171716',
  50: '#1c1c1a',
  100: '#242422',
  150: '#2c2c29',
  200: '#373734',
  300: '#4a4a46',
  400: '#6b6b65',
  500: '#8e8e87',
  600: '#b0b0a8',
  700: '#cdcdc5',
  800: '#e4e4dd',
  900: '#f2f2ed',
  950: '#fbfbf8',
} as const;

/**
 * The single accent. Deepened from the old emerald so it reads as considered
 * rather than as a stock success-green, and used sparingly enough that it still
 * means "this is the important thing".
 */
const accent = {
  light: { base: '#0F8A5F', hover: '#0B6E4C', soft: '#E8F5EE', onAccent: '#ffffff' },
  dark:  { base: '#34C88A', hover: '#5AD6A0', soft: '#123326', onAccent: '#06231A' },
} as const;

/**
 * Functional colours. Deliberately narrow: money only has three states, and
 * over-colouring a balance is how a balance becomes unreadable.
 */
const semantic = {
  positive: { light: '#0F7A4C', dark: '#4ED09A' },   // money owed to you
  negative: { light: '#B3261E', dark: '#FF8A80' },   // money you owe
  warning:  { light: '#8A5A00', dark: '#F0B429' },   // approaching the budget
} as const;

export interface Theme {
  name: ThemeName;

  /** Page background, behind all cards. */
  background: string;
  /** Default card / sheet surface. */
  surface: string;
  /** A surface that sits above another surface (nested cards, popovers). */
  surfaceRaised: string;
  /** A recessed area inside a surface (input fields, code blocks). */
  surfaceSunken: string;
  /** Pressed / selected state on a neutral surface. */
  surfacePressed: string;

  border: string;
  /** Borders that need to be seen without hunting — the focused field. */
  borderStrong: string;
  /** Hairline dividers inside a card. */
  divider: string;

  text: string;
  textSecondary: string;
  textTertiary: string;
  /** Text on top of the accent colour. */
  textOnAccent: string;

  accent: string;
  accentHover: string;
  /** A tinted fill for accent-coloured backgrounds, not a solid accent. */
  accentSoft: string;

  positive: string;
  negative: string;
  warning: string;
  /** Tinted fills for the three money states. */
  positiveSoft: string;
  negativeSoft: string;

  /** Overlay behind modals. */
  scrim: string;

  /**
   * Tabular figures for money. Android's default Roboto already has lining
   * tabular digits in most weights, but iOS does not, and a column of amounts
   * that jitters as digits change is the fastest way to make a budget feel cheap.
   */
  fontVariant: ['tabular-nums'];
}

const build = (name: ThemeName): Theme => {
  const dark = name === 'dark';
  const n = dark ? neutralDark : neutralLight;
  const a = accent[name];
  const s = (key: keyof typeof semantic) => semantic[key][name];

  return {
    name,

    background: n[50],
    surface: n[0],
    surfaceRaised: n[0],
    surfaceSunken: n[100],
    surfacePressed: n[150],

    border: n[200],
    borderStrong: n[400],
    divider: n[150],

    text: n[900],
    textSecondary: n[600],
    textTertiary: n[500],
    textOnAccent: a.onAccent,

    accent: a.base,
    accentHover: a.hover,
    accentSoft: a.soft,

    positive: s('positive'),
    negative: s('negative'),
    warning: s('warning'),
    positiveSoft: dark ? '#12281D' : '#E7F4EC',
    negativeSoft: dark ? '#2C1614' : '#FBEAE8',

    scrim: dark ? 'rgba(0,0,0,0.66)' : 'rgba(20,20,18,0.45)',

    fontVariant: ['tabular-nums'],
  };
};

export const lightTheme = build('light');
export const darkTheme = build('dark');

/**
 * Type scale. Ratios are tight at the top (display → title) so headings read as one
 * family, and open up in the body range where legibility matters more than
 * personality. `tabular` is set per-use via `fontVariant`, not here, because it
 * only belongs on figures.
 */
export const type = {
  display: { fontSize: 44, lineHeight: 48, fontWeight: '700', letterSpacing: -1.4 },
  title:   { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6 },
  heading: { fontSize: 19, lineHeight: 25, fontWeight: '700', letterSpacing: -0.3 },
  body:    { fontSize: 16, lineHeight: 23, fontWeight: '400', letterSpacing: -0.1 },
  label:   { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.1 },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400', letterSpacing: 0 },
  /** Small all-caps section marker. Used sparingly. */
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9 },
} as const;

export type TypeToken = keyof typeof type;

/** 4pt base. Everything in the app should land on one of these. */
export const space = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48,
} as const;

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 20, pill: 999,
} as const;

/** Minimum comfortable target. 44 is the iOS floor; 48 suits Android and large hands. */
export const touchTarget = 48;

/**
 * Elevation as a shadow. Android renders `elevation` natively, so it is set
 * alongside; the two together keep cards from looking either flat or heavy.
 */
export const shadow = {
  none: {},
  low: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  medium: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  high: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16, shadowRadius: 28, elevation: 12,
  },
} as const;

/**
 * Category tile tints.
 *
 * The nine categories each need a colour to be recognisable at a glance, which is
 * the one place a categorical palette is justified. Kept desaturated so they sit
 * quietly inside a monochrome app instead of shouting over the numbers.
 *
 * Both modes are explicit. Light tints are pale washes, which read as glowing
 * panels against a dark surface and pull the eye to the decoration rather than
 * the category name — so the dark set uses a deep tinted fill with a lifted
 * foreground and dot instead.
 */
const lightTints: Record<string, { bg: string; fg: string; dot: string }> = {
  food:         { bg: '#FBEEE4', fg: '#9A5B24', dot: '#D08A4E' },
  transport:    { bg: '#E9EFF7', fg: '#2F5B8A', dot: '#5B87B8' },
  shopping:     { bg: '#F8ECF3', fg: '#8E3F72', dot: '#BC6FA0' },
  bills:        { bg: '#FAF2DD', fg: '#7F6414', dot: '#B79A3C' },
  health:       { bg: '#FBEBEA', fg: '#97362F', dot: '#C46B62' },
  education:    { bg: '#ECEFF8', fg: '#3B4A85', dot: '#6A79B4' },
  entertainment:{ bg: '#F2EDF9', fg: '#5C4391', dot: '#8B77BC' },
  rent:         { bg: '#E8F3F1', fg: '#2A6A62', dot: '#4E9A90' },
  other:        { bg: '#EFEFEC', fg: '#5C5C55', dot: '#8E8E87' },
};

const darkTints: Record<string, { bg: string; fg: string; dot: string }> = {
  food:         { bg: '#2A1D12', fg: '#E0A268', dot: '#D08A4E' },
  transport:    { bg: '#141F2C', fg: '#7FAAD8', dot: '#5B87B8' },
  shopping:     { bg: '#261422', fg: '#CE8FB6', dot: '#BC6FA0' },
  bills:        { bg: '#241D0C', fg: '#CFB055', dot: '#B79A3C' },
  health:       { bg: '#2A1513', fg: '#DE8479', dot: '#C46B62' },
  education:    { bg: '#161A2C', fg: '#93A2DC', dot: '#6A79B4' },
  entertainment:{ bg: '#1E1830', fg: '#A891D6', dot: '#8B77BC' },
  rent:         { bg: '#0F2320', fg: '#63B3A8', dot: '#4E9A90' },
  other:        { bg: '#212120', fg: '#9A9A92', dot: '#8E8E87' },
};

/** Categories a user may have added by hand, so a lookup can miss. */
export const getCategoryTint = (
  name: string,
  mode: ThemeName,
): { bg: string; fg: string; dot: string } => {
  const table = mode === 'dark' ? darkTints : lightTints;
  return table[name] ?? table.other;
};

export const CATEGORY_KEYS = Object.keys(lightTints);
