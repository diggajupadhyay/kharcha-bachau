import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Theme } from '../lib/tokens';

/**
 * One icon set, one weight.
 *
 * The app previously used raw text glyphs for navigation — `▦` for Home and `⚙️`
 * for Settings. `▦` reads as a spreadsheet, and the gear rendered as a grey emoji
 * sitting next to a coloured word. Feather is thin, geometric and monochrome, which
 * keeps the chrome quiet and lets colour carry meaning instead.
 *
 * Icons take their colour from the theme at the call site rather than hard-coding
 * it, so light and dark both work.
 */
export type IconName = React.ComponentProps<typeof Feather>['name'];

interface IconProps {
  name: IconName;
  size?: number;
  color: string;
  /** Semantic tone so callers do not repeat theme lookups. */
  tone?: 'default' | 'muted' | 'accent' | 'positive' | 'negative';
  theme: Theme;
  strokeWidth?: number;
}

export const Icon: React.FC<IconProps> = ({
  name, size = 20, color, tone = 'default', theme, strokeWidth,
}) => {
  const resolved =
    tone === 'muted' ? theme.textTertiary
      : tone === 'accent' ? theme.accent
        : tone === 'positive' ? theme.positive
          : tone === 'negative' ? theme.negative
            : color;
  return <Feather name={name} size={size} color={resolved} {...(strokeWidth ? { strokeWidth } : {})} />;
};
