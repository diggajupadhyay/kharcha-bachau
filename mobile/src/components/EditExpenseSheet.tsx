import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, Pressable, TextInput, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Expense } from '../lib/types';
import { useStore } from '../store';
import { getCurrencySymbol } from '../lib/money';
import { colors, radius, parseCategoryColor } from '../lib/theme';

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

  const tile = expense ? parseCategoryColor(
    // The category color is not stored on the expense; the sheet used to hardcode
    // the rose tile. Resolving from the expense's own fields keeps it consistent.
    expense.categoryId === 'other' ? 'bg-gray-100 text-gray-600' : undefined
  ) : { bg: colors.slate100, text: colors.slate600 };

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex1}>
        <View style={styles.scrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={styles.panel}>
            <View style={styles.dragHandle} />
            <View style={styles.headerRow}>
              <View style={[styles.tileIcon, { backgroundColor: tile.bg }]}>
                <Text style={styles.tileEmoji}>{expense?.categoryEmoji}</Text>
              </View>
              <View style={styles.flex1}>
                <Text style={styles.heading}>Edit Transaction</Text>
                <Text style={styles.caption}>Update the details below</Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeButton} hitSlop={8} android_ripple={{ color: '#f1f5f9', radius: 24 }}>
                <Text style={styles.closeIcon}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.body}>
              <Text style={styles.label}>Amount</Text>
              <View style={styles.amountRow}>
                <Text style={styles.currencyPrefix}>{currencySymbol}</Text>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={text => { setAmount(text); if (error) setError(''); }}
                  onSubmitEditing={handleUpdate}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  selectTextOnFocus
                />
              </View>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Text style={styles.label}>Note</Text>
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                maxLength={500}
                placeholder="Add a note (optional)"
                placeholderTextColor={colors.slate500}
              />

              <Pressable
                onPress={handleUpdate}
                disabled={isSaving}
                style={({ pressed }) => [styles.saveButton, pressed && styles.savePressed]}
                android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
              >
                <Text style={styles.saveLabel}>{isSaving ? 'Saving…' : 'Update'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.6)',
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingBottom: 24,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.slate200,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileEmoji: { fontSize: 20 },
  heading: { fontSize: 18, fontWeight: '700', color: colors.slate900 },
  caption: { fontSize: 14, color: colors.slate600, marginTop: 2 },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.slate100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: { fontSize: 16, color: colors.slate600, fontWeight: '600' },
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 6 },
  label: { fontSize: 15, fontWeight: '600', color: colors.slate700, marginTop: 8 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderWidth: 2,
    borderColor: colors.slate300,
    borderRadius: radius.input,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    gap: 6,
  },
  currencyPrefix: { fontSize: 16, fontWeight: '700', color: colors.slate500 },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: colors.slate900,
    paddingVertical: 12,
  },
  errorText: { fontSize: 13, color: colors.rose600, marginLeft: 4 },
  noteInput: {
    minHeight: 48,
    borderWidth: 2,
    borderColor: colors.slate300,
    borderRadius: radius.input,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.slate900,
  },
  saveButton: {
    minHeight: 56,
    borderRadius: radius.button,
    backgroundColor: colors.emerald600,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  savePressed: { transform: [{ scale: 0.98 }], backgroundColor: colors.emerald700 },
  saveLabel: { fontSize: 17, fontWeight: '700', color: colors.white },
});

export default EditExpenseSheet;
