import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store';
import { useTheme } from '../lib/theme-context';
import { type, radius } from '../lib/tokens';
import { Icon, IconName } from './Icon';

// Notifications render as a small stack at the top. The store auto-dismisses
// entries after 4s; tapping dismisses immediately.
const ToastContainer: React.FC = () => {
  const { notifications, dismissNotification } = useStore();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  if (notifications.length === 0) return null;

  // Errors get the destructive tone and an icon; everything else is a quiet
  // surface. A stack of identical black bars makes an error indistinguishable
  // from a success at a glance.
  const tone = (t: string): { bg: string; fg: string; icon: IconName } => {
    if (t === 'error') return { bg: theme.negative, fg: '#fff', icon: 'alert-circle' };
    if (t === 'success') return { bg: theme.text, fg: theme.background, icon: 'check' };
    return { bg: theme.text, fg: theme.background, icon: 'info' };
  };

  return (
    // top: 0 put the toast underneath the status bar, where it was unreadable on
    // every device with a notch — and an error the user cannot see is the same as
    // no error at all.
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
        paddingTop: insets.top + 4,
        zIndex: 100,
      }}
      pointerEvents="box-none"
    >
      {notifications.map(n => {
        const t = tone(n.type);
        return (
          <Pressable
            key={n.id}
            onPress={() => dismissNotification(n.id)}
            accessibilityRole="alert"
            accessibilityLabel={n.message}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              maxWidth: '92%',
              marginTop: 8,
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: radius.md,
              backgroundColor: t.bg,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 8,
              elevation: 6,
            }}
          >
            <Icon name={t.icon} size={16} color={t.fg} theme={theme} strokeWidth={2.4} />
            <Text
              style={[type.caption, { color: t.fg, fontWeight: '600', flexShrink: 1 }]}
              numberOfLines={3}
            >
              {n.message}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

export default ToastContainer;