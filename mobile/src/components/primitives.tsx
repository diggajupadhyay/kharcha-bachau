import React from 'react';
import {
  View, Text, Pressable, StyleSheet, TextInput, ViewStyle,
} from 'react-native';
import { useTheme } from '../lib/theme-context';
import { type, space, radius, touchTarget } from '../lib/tokens';
import { Icon, IconName } from './Icon';

/**
 * Shared presentational primitives.
 *
 * Settings previously rendered nine cards that were visually identical: same
 * surface, same border, same bold title, same 20px padding. Nothing said which
 * card mattered, so "Delete my account" sat next to "Add category" and read as
 * equally routine. These primitives give the screen a hierarchy — grouped
 * sections under small caps labels, rows that share one height, and a genuinely
 * separate home for destructive actions.
 */

/** A titled group of related rows. `label` renders as a small-caps section marker. */
export const Section: React.FC<{
  label?: string;
  title?: string;
  caption?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}> = ({ label, title, caption, children, style }) => {
  const { theme } = useTheme();
  return (
    <View style={[{ gap: space.sm }, style]}>
      {label ? <Text style={[type.overline, { color: theme.textTertiary, textTransform: 'uppercase' }]}>{label}</Text> : null}
      <View
        style={{
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: radius.xl,
          overflow: 'hidden',
        }}
      >
        {title ? (
          <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm }}>
            <Text style={[type.heading, { color: theme.text }]}>{title}</Text>
            {caption ? (
              <Text style={[type.caption, { color: theme.textTertiary, marginTop: space.xs, lineHeight: 18 }]}>
                {caption}
              </Text>
            ) : null}
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );
};

/**
 * One row inside a Section. Rows are separated by hairlines rather than each
 * carrying their own border, which is what made the old list look like nine
 * unrelated boxes stacked on top of each other.
 */
export const Row: React.FC<{
  icon?: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  trailing?: React.ReactNode;
  /** Arbitrary node placed where the icon would go — a category emoji, for example. */
  leading?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  first?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
}> = ({
  icon, title, subtitle, onPress, onLongPress, trailing, leading,
  destructive, disabled, first, accessibilityLabel, style,
}) => {
  const { theme } = useTheme();
  const tint = destructive ? theme.negative : theme.textSecondary;

  const content = (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          opacity: disabled ? 0.4 : 1,
          paddingHorizontal: space.lg,
          minHeight: touchTarget + 4,
          paddingVertical: space.md,
          backgroundColor: theme.surface,
          // Hairline separators, suppressed at the section edges so the group
          // reads as one container.
          borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
          borderTopColor: theme.divider,
        },
        style,
      ]}
    >
      {leading ?? (icon ? (
        <Icon name={icon} size={18} color="" theme={theme} tone={destructive ? 'negative' : 'muted'} />
      ) : null)}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[type.label, { color: destructive ? theme.negative : theme.text }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.caption, { color: theme.textTertiary, marginTop: 1 }]} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );

  if (!onPress && !onLongPress) return content;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      android_ripple={{ color: theme.surfacePressed }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => (pressed ? { opacity: 0.65 } : null)}
    >
      {content}
    </Pressable>
  );
};

/** Small pill used for status and metadata (Shared, Owner, On track). */
export const Badge: React.FC<{
  label: string;
  tone?: 'accent' | 'neutral' | 'positive' | 'negative';
}> = ({ label, tone = 'accent' }) => {
  const { theme } = useTheme();
  const map = {
    accent:   { fg: theme.accent,   bg: theme.accentSoft },
    neutral:  { fg: theme.textSecondary, bg: theme.surfaceSunken },
    positive: { fg: theme.positive, bg: theme.positiveSoft },
    negative: { fg: theme.negative, bg: theme.negativeSoft },
  } as const;
  const { fg, bg } = map[tone];
  return (
    <Text
      style={[
        type.caption,
        { fontWeight: '700', color: fg, backgroundColor: bg },
        { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, overflow: 'hidden' },
      ]}
    >
      {label}
    </Text>
  );
};

/**
 * Destructive actions live here, below everything else, with their own border.
 *
 * This is the one place the old layout actively misled: a red-outlined "Delete my
 * account" sat inside the same card as "Export CSV", and a red-outlined "Clear
 * all data" was the last thing in a scrolling list people skimmed past. A
 * dedicated block at the bottom, separated by a rule, is findable but never
 * adjacent to something you might do by accident.
 */
export const DangerZone: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      <Text style={[type.overline, { color: theme.textTertiary, textTransform: 'uppercase' }]}>
        Destructive
      </Text>
      <View
        style={{
          borderWidth: 1,
          borderColor: theme.negativeSoft,
          borderRadius: radius.xl,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
      <Text style={[type.caption, { color: theme.textTertiary, paddingHorizontal: space.xs }]}>
        These cannot be undone.
      </Text>
    </View>
  );
};

/** A primary action button. The one place the accent is allowed as a fill. */
export const PrimaryButton: React.FC<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: IconName;
  style?: ViewStyle;
}> = ({ label, onPress, disabled, icon, style }) => {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: 'rgba(255,255,255,0.25)' }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        {
          minHeight: touchTarget,
          borderRadius: radius.md,
          backgroundColor: theme.accent,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space.sm,
          opacity: disabled ? 0.4 : 1,
        },
        pressed && !disabled ? { backgroundColor: theme.accentHover } : null,
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={18} color={theme.textOnAccent} theme={theme} /> : null}
      <Text style={[type.label, { color: theme.textOnAccent }]}>{label}</Text>
    </Pressable>
  );
};

/** A quiet secondary action. Outlined, never filled with the accent. */
export const SecondaryButton: React.FC<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: IconName;
  style?: ViewStyle;
}> = ({ label, onPress, disabled, icon, style }) => {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: theme.surfacePressed }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          minHeight: touchTarget,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.surface,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space.sm,
          opacity: disabled ? 0.4 : 1,
        },
        pressed ? { backgroundColor: theme.surfacePressed } : null,
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={18} color="" theme={theme} tone="muted" /> : null}
      <Text style={[type.label, { color: theme.textSecondary }]}>{label}</Text>
    </Pressable>
  );
};

/**
 * Empty-state placeholder. Takes an icon and copy rather than a single hardcoded
 * emoji, so "no expenses yet" and "no results" cannot look identical again.
 */
export const EmptyState: React.FC<{
  icon: IconName;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
  compact?: boolean;
}> = ({ icon, title, body, action, compact }) => {
  const { theme } = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        paddingVertical: compact ? space.xl : space.xxl,
        paddingHorizontal: space.lg,
      }}
    >
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: radius.pill,
          backgroundColor: theme.surfaceSunken,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: space.md,
        }}
      >
        <Icon name={icon} size={24} color="" theme={theme} tone="muted" />
      </View>
      <Text style={[type.heading, { color: theme.text, textAlign: 'center' }]}>{title}</Text>
      <Text
        style={[type.body, { color: theme.textTertiary, textAlign: 'center', marginTop: space.xs, maxWidth: 300 }]}
      >
        {body}
      </Text>
      {action ? (
        <SecondaryButton
          label={action.label}
          onPress={action.onPress}
          style={{ marginTop: space.lg, paddingHorizontal: space.xl }}
        />
      ) : null}
    </View>
  );
};

/** Themed input, so focus rings and placeholders match the rest of the app. */
export const Field: React.FC<
  React.ComponentProps<typeof TextInput> & { label?: string }
> = ({ label, style, ...rest }) => {
  const { theme } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      {label ? <Text style={[type.label, { color: theme.textSecondary }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={theme.textTertiary}
        {...rest}
        style={[
          {
            minHeight: touchTarget,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: radius.md,
            backgroundColor: theme.surfaceSunken,
            paddingHorizontal: space.md,
            fontSize: 16,
            color: theme.text,
          },
          style,
        ]}
      />
    </View>
  );
};

/** Label + value line used for read-only facts (version, email, storage). */
export const FactRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const { theme } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: space.lg,
        minHeight: touchTarget,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.divider,
      }}
    >
      <Text style={[type.body, { color: theme.textSecondary }]}>{label}</Text>
      <Text
        style={[type.body, { color: theme.text, fontWeight: '600', flexShrink: 1 }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
};
