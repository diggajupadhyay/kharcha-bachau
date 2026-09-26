import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '../lib/theme';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen, title, message, confirmLabel, cancelLabel = 'Cancel', destructive, onConfirm, onCancel,
}) => (
  <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.scrim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      <View style={styles.panel}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.actions}>
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [styles.button, styles.cancelButton, pressed && styles.pressed]}
            android_ripple={{ color: '#f1f5f9' }}
          >
            <Text style={styles.cancelLabel}>{cancelLabel}</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            style={({ pressed }) => [
              styles.button,
              destructive ? styles.destructiveButton : styles.confirmButton,
              pressed && styles.pressed,
            ]}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
          >
            <Text style={destructive ? styles.destructiveLabel : styles.confirmLabel}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.white,
    borderRadius: radius.card,
    padding: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.slate900,
  },
  message: {
    fontSize: 15,
    color: colors.slate600,
    lineHeight: 22,
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  cancelButton: {
    backgroundColor: colors.slate100,
  },
  confirmButton: {
    backgroundColor: colors.emerald600,
  },
  destructiveButton: {
    backgroundColor: colors.rose600,
  },
  cancelLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.slate700,
  },
  confirmLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  destructiveLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});

export default ConfirmDialog;
