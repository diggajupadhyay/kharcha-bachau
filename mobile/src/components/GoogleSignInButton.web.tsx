import React from 'react';
import { Pressable, Text, View, ActivityIndicator, StyleSheet } from 'react-native';

import { useTheme } from '../lib/theme-context';
import { type, space, radius } from '../lib/tokens';
import { Icon } from './Icon';

/**
 * The Google sign-in button, in a browser.
 *
 * `GoogleSignInButton` is a native view from `react-native-nitro-google-signin`,
 * which has no web build — importing it made the whole bundle throw "Native
 * NitroModules are not available on web" before anything rendered. The browser gets
 * an equivalent control built from the same tokens, so both builds present the same
 * affordance and neither carries the other's button.
 *
 * This is not Google's official button, so it deliberately does not imitate the
 * branded "Sign in with Google" layout. Pressing it opens a real Google popup via
 * firebase/auth, which is what makes the flow work at all here.
 */
interface Props {
  size?: string;
  colorScheme?: string;
  signInBehavior?: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: any;
}

const GoogleSignInButton: React.FC<Props> = ({ onPress, loading, disabled }) => {
  const { theme } = useTheme();
  const off = loading || disabled;

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel="Sign in with Google"
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          minHeight: 48,
          paddingHorizontal: space.lg,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.surfaceRaised ?? theme.surface,
          opacity: off ? 0.6 : pressed ? 0.85 : 1,
          width: '100%',
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={theme.text} />
      ) : (
        <View style={styles.mark}>
          <Icon name="globe" size={15} color="" theme={theme} tone="muted" strokeWidth={2} />
        </View>
      )}
      <Text style={[type.body, { color: theme.text, fontWeight: '600' }]}>
        {loading ? 'Signing in…' : 'Continue with Google'}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  mark: { width: 22, alignItems: 'center' },
});

export default GoogleSignInButton;