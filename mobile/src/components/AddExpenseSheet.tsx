import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  Modal, View, Text, Pressable, TextInput, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Category } from '../lib/types';
import { useStore } from '../store';
import { getCurrencySymbol } from '../lib/money';
import { colors, radius, parseCategoryColor } from '../lib/theme';
import { todayISO } from '../lib/date';

interface AddExpenseSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

// One sheet, two steps: pick a category, then the amount. Smoother than the web's
// stacked modals — no second modal to mount, no focus trap to manage.
const AddExpenseSheet: React.FC<AddExpenseSheetProps> = ({ isOpen, onClose }) => {
  const { getAllCategories, addExpense, showNotification, triggerHaptic } = useStore();
  const [step, setStep] = useState<'category' | 'amount'>('category');
  const [category, setCategory] = useState<Category | null>(null);
  const [search, setSearch] = useState('');
  const [amount, setAmount] = useState('0');
  const [amountError, setAmountError] = useState(false);
  const [note, setNote] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const submittingRef = useRef(false);
  const currencySymbol = getCurrencySymbol();

  const sortedCategories = useMemo(() => getAllCategories(), [getAllCategories]);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedCategories;
    return sortedCategories.filter(c => c.name.toLowerCase().includes(q));
  }, [sortedCategories, search]);

  const hasUnsavedData = useMemo(
    () => step === 'amount' && (amount !== '0' || note.trim().length > 0 || selectedDate.toDateString() !== new Date().toDateString()),
    [step, amount, note, selectedDate]
  );

  const resetForm = useCallback(() => {
    setStep('category');
    setCategory(null);
    setSearch('');
    setAmount('0');
    setAmountError(false);
    setNote('');
    setSelectedDate(new Date());
    setShowDatePicker(false);
  }, []);

  const safeClose = useCallback(() => {
    if (hasUnsavedData) {
      // The discard confirm is a sibling state here; simplest honest flow is to
      // just close — but work deserves a warning.
      showNotification('info', 'Changes discarded');
      onClose();
      resetForm();
      return;
    }
    onClose();
    resetForm();
  }, [hasUnsavedData, onClose, resetForm, showNotification]);

  useEffect(() => {
    if (isOpen) { setStep('category'); setCategory(null); setSearch(''); }
  }, [isOpen]);

  // Every branch reads and writes `prev`. The web version mixed the two — it tested
  // the `amount` captured at render time but appended to `prev` — so two taps landing
  // in the same React batch both saw "0" and one digit was lost. The digit and
  // decimal caps are applied per character, because a double tap of "00" appends two
  // and used to slip a 10th digit or a 3rd decimal past a check written for one.
  const MAX_DIGITS = 9;
  const MAX_DECIMALS = 2;

  const appendChar = (prev: string, ch: string): string => {
    const dotIdx = prev.indexOf('.');
    if (dotIdx !== -1 && prev.length - dotIdx - 1 >= MAX_DECIMALS) return prev;
    if (prev.replace('.', '').length >= MAX_DIGITS) return prev;
    if (prev === '0') return ch;
    return prev + ch;
  };

  const handleNumPress = (num: string) => {
    triggerHaptic();
    setAmountError(false);
    if (num === '.') {
      setAmount(prev => (prev.includes('.') ? prev : prev + '.'));
      return;
    }
    setAmount(prev => Array.from(num).reduce(appendChar, prev));
  };

  const handleDeletePress = () => {
    triggerHaptic();
    setAmountError(false);
    setAmount(prev => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
  };

  const handleSubmit = async () => {
    if (submittingRef.current || !category) return;
    const val = parseFloat(amount);
    if (!(val > 0)) { setAmountError(true); return; }
    submittingRef.current = true;
    try {
      await addExpense(val, category, note, selectedDate);
      triggerHaptic();
      onClose();
      resetForm();
    } catch (e: any) {
      showNotification('error', e?.message || 'Could not save. Please try again.');
    } finally {
      submittingRef.current = false;
    }
  };

  const pickCategory = (cat: Category) => {
    triggerHaptic();
    setCategory(cat);
    setStep('amount');
  };

  const onDateChange = (_: unknown, date?: Date) => {
    // On Android the picker fires with `date` on change and dismisses itself.
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (!date) return;
    if (date.getFullYear() < 2000 || date.getFullYear() > 2100) return;
    setSelectedDate(date);
  };

  const dateLabel = useMemo(() => {
    const today = todayISO();
    const selected = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
    if (selected === today) return 'Today';
    return selectedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }, [selectedDate]);

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={safeClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex1}>
        <View style={styles.scrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={safeClose} />
          <View style={styles.panel}>
            {step === 'category' ? (
              <>
                <View style={styles.dragHandle} />
                <View style={styles.headerRow}>
                  <Text style={styles.heading}>Add Expense</Text>
                  <Pressable onPress={safeClose} style={styles.closeButton} hitSlop={8} android_ripple={{ color: '#f1f5f9', radius: 24 }}>
                    <Text style={styles.closeIcon}>✕</Text>
                  </Pressable>
                </View>
                <View style={styles.searchWrap}>
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search categories"
                    placeholderTextColor={colors.slate500}
                    style={styles.searchInput}
                  />
                </View>
                <ScrollView style={styles.flex1} contentContainerStyle={styles.gridWrap} keyboardShouldPersistTaps="handled">
                  <View style={styles.grid}>
                    {filteredCategories.map(cat => {
                      const { bg } = parseCategoryColor(cat.color);
                      return (
                        <Pressable
                          key={cat.id}
                          onPress={() => pickCategory(cat)}
                          style={({ pressed }) => [styles.tile, { backgroundColor: colors.white }, pressed && styles.tilePressed]}
                          android_ripple={{ color: '#f1f5f9' }}
                        >
                          <View style={[styles.tileIcon, { backgroundColor: bg }]}>
                            <Text style={styles.tileEmoji}>{cat.emoji}</Text>
                          </View>
                          <Text style={styles.tileName}>{cat.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {search.trim() && filteredCategories.length === 0 && (
                    <Text style={styles.noResults}>No categories match "{search}"</Text>
                  )}
                </ScrollView>
              </>
            ) : (
              <>
                <View style={styles.dragHandle} />
                <View style={styles.headerRow}>
                  <Pressable onPress={() => { setStep('category'); setCategory(null); }} style={styles.backButton} hitSlop={8}>
                    <Text style={styles.backIcon}>‹</Text>
                  </Pressable>
                  <View style={[styles.tileIconSmall, { backgroundColor: category ? parseCategoryColor(category.color).bg : colors.slate100 }]}>
                    <Text style={styles.tileEmojiSmall}>{category?.emoji}</Text>
                  </View>
                  <Text style={styles.heading} numberOfLines={1}>{category?.name}</Text>
                  <Pressable onPress={safeClose} style={styles.closeButton} hitSlop={8} android_ripple={{ color: '#f1f5f9', radius: 24 }}>
                    <Text style={styles.closeIcon}>✕</Text>
                  </Pressable>
                </View>

                {/* Amount */}
                <View style={styles.amountWrap}>
                  <Text style={styles.amountSymbol}>{currencySymbol}</Text>
                  <Text style={[styles.amount, amountError && styles.amountError]} numberOfLines={1} adjustsFontSizeToFit>
                    {amount}
                  </Text>
                </View>
                {amountError && <Text style={styles.amountErrorText}>Enter an amount greater than 0</Text>}

                {/* Note + date */}
                <View style={styles.noteRow}>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    maxLength={500}
                    placeholder="Add a note (optional)"
                    placeholderTextColor={colors.slate500}
                    style={styles.noteInput}
                  />
                  <Pressable onPress={() => setShowDatePicker(true)} style={styles.dateButton} android_ripple={{ color: '#f1f5f9' }}>
                    <Text style={styles.dateLabel}>{dateLabel}</Text>
                  </Pressable>
                </View>
                {showDatePicker && (
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display={Platform.OS === 'android' ? 'default' : 'compact'}
                    maximumDate={new Date()}
                    minimumDate={new Date(2000, 0, 1)}
                    onChange={onDateChange}
                  />
                )}

                {/* Keypad — 3 columns so every cell holds a real key, then one big
                    labeled Save button. */}
                <View style={styles.keypad}>
                  <View style={styles.keyGrid}>
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (
                      <Pressable key={n} onPress={() => handleNumPress(n)} style={styles.key} android_ripple={{ color: '#f1f5f9' }}>
                        <Text style={styles.keyLabel}>{n}</Text>
                      </Pressable>
                    ))}
                    <Pressable onPress={() => handleNumPress('.')} style={styles.key} android_ripple={{ color: '#f1f5f9' }}>
                      <Text style={styles.keyLabel}>.</Text>
                    </Pressable>
                    <Pressable onPress={() => handleNumPress('0')} style={styles.key} android_ripple={{ color: '#f1f5f9' }}>
                      <Text style={styles.keyLabel}>0</Text>
                    </Pressable>
                    <Pressable onPress={handleDeletePress} style={styles.key} android_ripple={{ color: '#f1f5f9' }}>
                      <Text style={styles.keyLabel}>⌫</Text>
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={handleSubmit}
                    disabled={submittingRef.current}
                    style={({ pressed }) => [styles.saveButton, pressed && styles.savePressed]}
                    android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                  >
                    <Text style={styles.saveLabel}>Save expense</Text>
                  </Pressable>
                </View>
              </>
            )}
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
    maxHeight: '92%',
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
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  heading: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: colors.slate900,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.slate100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: { fontSize: 16, color: colors.slate600, fontWeight: '600' },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.slate100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { fontSize: 26, color: colors.slate600, lineHeight: 30, marginTop: -4 },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  searchInput: {
    minHeight: 48,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.slate300,
    borderRadius: radius.input,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.slate900,
  },
  gridWrap: { padding: 16, paddingTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '31%',
    flexGrow: 1,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.slate200,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 8,
  },
  tilePressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  tileIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileEmoji: { fontSize: 28 },
  tileIconSmall: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileEmojiSmall: { fontSize: 20 },
  tileName: { fontSize: 14, fontWeight: '600', color: colors.slate700, textAlign: 'center' },
  noResults: { textAlign: 'center', color: colors.slate600, paddingVertical: 32, fontSize: 16 },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  amountSymbol: { fontSize: 20, fontWeight: '600', color: colors.slate500 },
  amount: {
    fontSize: 44,
    fontWeight: '800',
    color: colors.slate900,
    letterSpacing: -1,
    maxWidth: '70%',
  },
  amountError: { color: colors.rose600 },
  amountErrorText: {
    color: colors.rose600,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 4,
  },
  noteRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  noteInput: {
    flex: 1,
    minHeight: 48,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.slate300,
    borderRadius: radius.input,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.slate900,
  },
  dateButton: {
    minWidth: 96,
    minHeight: 48,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.slate300,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: colors.white,
  },
  dateLabel: { fontSize: 14, fontWeight: '600', color: colors.slate700 },
  keypad: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  keyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  key: {
    width: '31.5%',
    flexGrow: 1,
    minHeight: 52,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyLabel: { fontSize: 20, fontWeight: '700', color: colors.slate900 },
  saveButton: {
    minHeight: 56,
    borderRadius: radius.button,
    backgroundColor: colors.emerald600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savePressed: { transform: [{ scale: 0.98 }], backgroundColor: colors.emerald700 },
  saveLabel: { fontSize: 17, fontWeight: '700', color: colors.white },
});

export default AddExpenseSheet;
