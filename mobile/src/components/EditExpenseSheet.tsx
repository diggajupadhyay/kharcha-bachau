import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Modal, View, Text, Pressable, TextInput, StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useWindowDimensions } from 'react-native';
import { Expense } from '../lib/types';
import { useStore } from '../store';
import { getCurrencySymbol } from '../lib/money';
import { useTheme } from '../lib/theme-context';
import { type, space, radius, getCategoryTint } from '../lib/tokens';
import { Icon } from './Icon';
import { useSheetDrag } from '../lib/useSheetDrag';
import { useScrollTop } from '../lib/useScrollTop';
import { SheetHandle, SheetPanel } from './Sheet';

interface EditExpenseSheetProps {
  expense: Expense | null;
  isOpen: boolean;
  onClose: () => void;
}

const EditExpenseSheet: React.FC<EditExpenseSheetProps> = ({ expense, isOpen, onClose }) => {
  const { updateExpense } = useStore();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const currencySymbol = getCurrencySymbol();

  useEffect(() => {
    if (isOpen && expense) {
      setAmount(expense.amount.toString());
      setNote(expense.note);
      setError('');
    }
  }, [isOpen, expense]);

  const handleUpdate = async () => {
    if (isSaving || !expense) return;
    const val = parseFloat(amount);
    if (!Number.isFinite(val) || val <= 0) { setError('Enter an amount greater than 0'); return; }
    if (val > 1000000000) { setError('That amount is too large'); return; }
    if (note.length > 500) { setError('Note too long (max 500 characters)'); return; }
    setError('');
    setIsSaving(true);
    savingRef.current = true;
    try {
      await updateExpense(expense.id, val, note);
      // Only closed on success — a swallowed error used to close the sheet over a
      // red toast and throw away the user's correction.
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not save. Please try again.');
    } finally {
      setIsSaving(false);
      savingRef.current = false;
    }
  };

  const { theme } = useTheme();

  // The category colour is not stored on the expense, so it is resolved from the
  // category id — the same source Home uses, so the tile matches the list row.
  const tile = expense
    ? getCategoryTint(expense.categoryId, theme.name)
    : getCategoryTint('other', theme.name);

  const st = useMemo(() => StyleSheet.create({
    scrim: { backgroundColor: theme.scrim },
    panel: { backgroundColor: theme.surface },
    heading: { ...type.heading, color: theme.text },
    caption: { ...type.caption, color: theme.textTertiary },
    closeButton: { backgroundColor: theme.surfaceSunken },
    label: { ...type.label, color: theme.textSecondary },
    amountInput: { color: theme.text },
    noteInput: {
      backgroundColor: theme.surfaceSunken, borderColor: theme.border, color: theme.text,
    },
    errorText: { ...type.caption, color: theme.negative },
    saveButton: { backgroundColor: theme.accent },
    saveLabel: { ...type.label, color: theme.textOnAccent },
    currencyPrefix: { color: theme.textTertiary },
  }), [theme]);

  // Bounded in pixels, not percent: a percentage maxHeight does not resolve inside
  // a Modal, so the sheet would size to its content and overflow the screen.
  const { height: windowHeight } = useWindowDimensions();
  const panelMaxHeight = Math.round(windowHeight * 0.92);

  // Placed before the JSX so the gesture is available to the panel and handle.
  const { atTop, onScroll } = useScrollTop(isOpen);
  const { translateY, panHandlers, onPanelLayout } = useSheetDrag(isOpen, onClose, atTop);

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex1}>
        <View style={[styles.scrim, st.scrim]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <SheetPanel translateY={translateY} panHandlers={panHandlers} onLayout={onPanelLayout} style={[styles.panel, st.panel, { height: panelMaxHeight }]}>
            <SheetHandle />
            <View style={styles.headerRow}>
              <View style={[styles.tileIcon, { backgroundColor: tile.bg }]}>
                <Text style={styles.tileEmoji}>{expense?.categoryEmoji}</Text>
              </View>
              <View style={styles.flex1}>
                <Text style={[st.heading]}>Edit expense</Text>
                <Text style={[st.caption]}>Amount and note only</Text>
              </View>
              <Pressable onPress={onClose} style={[styles.closeButton, st.closeButton]} hitSlop={8} android_ripple={{ color: theme.surfacePressed, radius: 24 }} accessibilityRole="button" accessibilityLabel="Close">
                <Icon name="x" size={18} color="" theme={theme} tone="muted" strokeWidth={2.4} />
              </Pressable>
            </View>

            <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" onScroll={onScroll}>
              <View>
              <Text style={[styles.label, st.label]}>Amount</Text>
              <View style={styles.amountRow}>
                <Text style={[st.currencyPrefix]}>{currencySymbol}</Text>
                <TextInput
                  style={[st.amountInput]}
                  value={amount}
                  onChangeText={text => { setAmount(text); if (error) setError(''); }}
                  onSubmitEditing={handleUpdate}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  selectTextOnFocus
                />
              </View>
              {error ? <Text style={[st.errorText]}>{error}</Text> : null}

              <Text style={[styles.label, st.label]}>Note</Text>
              <TextInput
                style={[st.noteInput]}
                value={note}
                onChangeText={setNote}
                maxLength={500}
                placeholder="Add a note (optional)"
                placeholderTextColor={theme.textTertiary}
              />

              </View>
            </ScrollView>
            <View style={styles.footer}>
              <Pressable
                onPress={handleUpdate}
                disabled={isSaving}
                style={({ pressed }) => [styles.saveButton, st.saveButton, pressed && styles.savePressed]}
                android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                accessibilityRole="button"
                accessibilityLabel="Update expense"
              >
                <Text style={[st.saveLabel]}>{isSaving ? 'Saving…' : 'Update'}</Text>
              </Pressable>
            </View>
          </SheetPanel>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

/** Layout only. Every colour is supplied by the themed `st` above. */
const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: space.xxl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileEmoji: { fontSize: 20 },
  flex1: { flex: 1 },

  bodyScroll: { flex: 1 },
  body: { paddingHorizontal: space.lg, gap: space.sm, paddingTop: space.sm, paddingBottom: space.lg },
  // The action lives outside the scroll area so it is always visible and always a
  // full-size target, however long the note gets.
  footer: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xl },
  label: { marginTop: space.xs },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 56,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  currencyPrefix: { fontSize: 19, fontWeight: '600' },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    paddingVertical: 0,
  },

  noteInput: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    fontSize: 16,
  },

  saveButton: {
    minHeight: 48,
    flexShrink: 0,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
  },
  saveLabel: {},
  savePressed: { transform: [{ scale: 0.98 }] },

  closeButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default EditExpenseSheet;
