import React, { useState } from 'react';
import { View, Text, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { useTheme } from '../lib/theme-context';
import { type, space, radius, touchTarget } from '../lib/tokens';
import { Icon, IconName } from '../components/Icon';
import { PrimaryButton, SecondaryButton } from '../components/primitives';

/**
 * First-run intro.
 *
 * Three steps, and each one explains a capability that is otherwise invisible on
 * the Home screen: a wallet holds one pot of money, splitting is the reason to use
 * a shared wallet at all, and the budget is what turns a log into a limit. The
 * previous first-run experience was an empty list reading "Tap the big + button",
 * which teaches nothing and looks broken.
 *
 * Nothing is written to the wallet here — onboarding is a tour, not a setup wizard.
 * Asking for a budget during the intro would put a data-entry form in front of
 * someone who has not decided they want to track spending at all.
 */

interface Step {
  icon: IconName;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    icon: 'credit-card',
    title: 'Wallets are pots of money',
    body:
      'One for home, one for a trip, one for anything you share. Each keeps its own expenses and its own budget.',
  },
  {
    icon: 'users',
    title: 'Split without the maths',
    body:
      'Log one expense, pick who it was between, and everyone sees what they owe. Settle up when the cash actually changes hands.',
  },
  {
    icon: 'pie-chart',
    title: 'Set a limit you can see',
    body:
      'A monthly budget turns a list of expenses into a number you are trying to stay under.',
  },
];

const OnboardingScreen: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { showNotification, triggerHaptic } = useStore();
  const [index, setIndex] = useState(0);

  const last = index === STEPS.length - 1;
  const step = STEPS[index];

  const advance = () => {
    triggerHaptic();
    if (last) {
      showNotification('success', 'You are all set');
      onDone();
    } else {
      setIndex(i => i + 1);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.background,
        paddingTop: insets.top + space.xl,
        paddingBottom: insets.bottom + space.xl,
        paddingHorizontal: space.xl,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: space.xxl }}>
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={{
              height: 3,
              flex: 1,
              borderRadius: radius.pill,
              backgroundColor: i === index ? theme.accent : theme.surfaceSunken,
            }}
          />
        ))}
      </View>

      {/* Flex-centres the art and copy between the progress bar and the buttons. */}
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: radius.xl,
            backgroundColor: theme.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: space.xl,
          }}
        >
          <Icon name={step.icon} size={32} color="" theme={theme} tone="accent" strokeWidth={1.9} />
        </View>

        <Text style={[type.display, { fontSize: 30, lineHeight: 37, color: theme.text }]}>
          {step.title}
        </Text>
        <Text
          style={[
            type.body,
            { color: theme.textSecondary, lineHeight: 24, marginTop: space.md, maxWidth: 420 },
          ]}
        >
          {step.body}
        </Text>
      </ScrollView>

      <View style={{ gap: space.sm }}>
        <PrimaryButton
          label={last ? 'Start tracking' : 'Next'}
          onPress={advance}
          icon={last ? undefined : 'chevron-right'}
          style={{ minHeight: Math.min(52, height * 0.07) }}
        />
        {!last && (
          <SecondaryButton label="Skip" onPress={onDone} />
        )}
      </View>
    </View>
  );
};

export default OnboardingScreen;