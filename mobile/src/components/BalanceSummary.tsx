import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Wallet } from '../lib/types';
import { DebtTransfer } from '../lib/balances';
import { useTheme } from '../lib/theme-context';
import { type, space, radius } from '../lib/tokens';
import { formatAmount, getCurrencySymbol } from '../lib/money';
import { Icon } from './Icon';

interface BalanceSummaryProps {
  wallet: Wallet;
  balances: Record<string, number>;
  transfers: DebtTransfer[];
  nameOf: (userId: string) => string;
  onSettle: (fromUserId: string, toUserId: string) => void;
}

// Only shown for a wallet that actually has people to owe each other money.
// "Who owes whom" on a one-person wallet is always "nobody", which is just noise.
const BalanceSummary: React.FC<BalanceSummaryProps> = ({
  wallet, balances, transfers, nameOf, onSettle,
}) => {
  const { theme } = useTheme();
  const symbol = getCurrencySymbol();
  const hasPeople = (wallet.members?.length ?? 0) > 1;
  const everyoneSquare = transfers.length === 0;

  // Largest debts first — those are the ones worth chasing.
  const ordered = useMemo(
    () => [...transfers].sort((a, b) => b.amount - a.amount),
    [transfers]
  );

  // Members with a non-zero position only. Listing settled members as
  // "Name: settled" on every row is filler, not information.
  const netRows = useMemo(
    () => Object.entries(balances).filter(([, v]) => v !== 0),
    [balances]
  );

  if (!hasPeople) return null;

  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: radius.xl,
        padding: space.lg,
        gap: space.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[type.heading, { color: theme.text }]}>Who owes whom</Text>
        {!everyoneSquare && (
          <Text
            style={[
              type.caption,
              {
                fontWeight: '700',
                color: theme.negative,
                backgroundColor: theme.negativeSoft,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 5,
                overflow: 'hidden',
              },
            ]}
          >
            {ordered.length} open
          </Text>
        )}
      </View>

      {everyoneSquare ? (
        // This is the one genuinely satisfying state in the app, so it gets an
        // explicit positive signal instead of just falling through to prose.
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View
            style={{
              width: 28, height: 28, borderRadius: radius.pill,
              backgroundColor: theme.positiveSoft,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="check" size={15} color="" theme={theme} tone="positive" strokeWidth={2.8} />
          </View>
          <Text style={[type.body, { color: theme.textSecondary }]}>
            All square — nobody owes anybody.
          </Text>
        </View>
      ) : (
        ordered.map((t, i) => {
          const key = `${t.fromUserId}->${t.toUserId}`;
          return (
            <View
              key={key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.md,
                paddingTop: i === 0 ? space.xs : space.md,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: theme.divider,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type.label, { color: theme.text }]} numberOfLines={1}>
                  {nameOf(t.fromUserId)}
                  <Text style={{ color: theme.textTertiary, fontWeight: '400' }}> pays </Text>
                  {nameOf(t.toUserId)}
                </Text>
                <Text
                  style={[
                    type.body,
                    { color: theme.negative, fontWeight: '600', marginTop: 1, fontVariant: theme.fontVariant },
                  ]}
                >
                  {symbol} {formatAmount(t.amount)}
                </Text>
              </View>
              <Pressable
                onPress={() => onSettle(t.fromUserId, t.toUserId)}
                android_ripple={{ color: 'rgba(255,255,255,0.22)' }}
                accessibilityRole="button"
                accessibilityLabel={`Mark ${symbol} ${formatAmount(t.amount)} from ${nameOf(t.fromUserId)} to ${nameOf(t.toUserId)} as settled`}
                style={({ pressed }) => [{
                  minHeight: 40,
                  paddingHorizontal: space.lg,
                  borderRadius: radius.md,
                  backgroundColor: theme.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.85 : 1,
                }]}
              >
                <Text style={[type.caption, { fontWeight: '700', color: theme.textOnAccent }]}>
                  Settle
                </Text>
              </Pressable>
            </View>
          );
        })
      )}

      {netRows.length > 0 && (
        <View
          style={{
            paddingTop: space.md,
            borderTopWidth: 1,
            borderTopColor: theme.divider,
            gap: space.xs,
          }}
        >
          <Text style={[type.overline, { color: theme.textTertiary, textTransform: 'uppercase' }]}>
            Net position
          </Text>
          {netRows.map(([id, value]) => (
            <View
              key={id}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md }}
            >
              <Text style={[type.body, { color: theme.textSecondary, flexShrink: 1 }]} numberOfLines={1}>
                {nameOf(id)}
              </Text>
              <Text
                style={[
                  type.body,
                  {
                    fontWeight: '700',
                    fontVariant: theme.fontVariant,
                    color: value > 0 ? theme.positive : theme.negative,
                  },
                ]}
              >
                {value > 0
                  ? `+${symbol} ${formatAmount(value)}`
                  : `-${symbol} ${formatAmount(-value)}`}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

export default BalanceSummary;