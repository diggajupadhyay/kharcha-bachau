import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../lib/theme-context';
import { type, space, radius } from '../lib/tokens';
import { PrimaryButton, SecondaryButton } from './primitives';

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
}) => {
  const { theme } = useTheme();

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: theme.scrim, justifyContent: 'center', padding: space.xl }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Dismiss" />
        <View
          accessibilityViewIsModal
          style={{
            width: '100%',
            maxWidth: 360,
            backgroundColor: theme.surface,
            borderRadius: radius.xl,
            padding: space.xl,
          }}
        >
          <Text style={[type.heading, { color: theme.text }]}>{title}</Text>
          <Text style={[type.body, { color: theme.textSecondary, lineHeight: 23, marginTop: space.sm }]}>
            {message}
          </Text>
          {/*
            Cancel is on the left and confirm on the right, but the destructive
            confirm is rendered with the negative token rather than the accent so a
            permanent deletion never looks like an ordinary save.
          */}
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xl }}>
            <SecondaryButton label={cancelLabel} onPress={onCancel} style={{ flex: 1 }} />
            {destructive ? (
              <Pressable
                onPress={onConfirm}
                android_ripple={{ color: 'rgba(255,255,255,0.25)' }}
                accessibilityRole="button"
                accessibilityLabel={confirmLabel}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 48,
                  borderRadius: radius.md,
                  backgroundColor: theme.negative,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={[type.label, { color: '#fff' }]}>{confirmLabel}</Text>
              </Pressable>
            ) : (
              <PrimaryButton label={confirmLabel} onPress={onConfirm} style={{ flex: 1 }} />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default ConfirmDialog;