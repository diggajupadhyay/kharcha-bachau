import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { colors, radius } from '../lib/theme';

// Notifications render as a small stack at the top. The store auto-dismisses
// entries after 4s; tapping dismisses immediately.
const ToastContainer: React.FC = () => {
  const { notifications, dismissNotification } = useStore();
  if (notifications.length === 0) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {notifications.map(n => (
        <Pressable key={n.id} onPress={() => dismissNotification(n.id)} style={[styles.toast, styles[n.type]]}>
          <Text style={styles.label} numberOfLines={2}>{n.message}</Text>
        </Pressable>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  toast: {
    maxWidth: '92%',
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radius.button,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  success: { backgroundColor: colors.slate900 },
  error: { backgroundColor: colors.rose600 },
  info: { backgroundColor: colors.slate900 },
  label: { color: colors.white, fontSize: 14, fontWeight: '600', textAlign: 'center' },
});

export default ToastContainer;
