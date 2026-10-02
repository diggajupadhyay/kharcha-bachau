import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  Modal, View, Text, Pressable, TextInput, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useWindowDimensions } from 'react-native';
import { Category } from '../lib/types';
import { useStore } from '../store';
import { getCurrencySymbol, formatAmount } from '../lib/money';
import { useTheme } from '../lib/theme-context';
import { type, space, radius, touchTarget, getCategoryTint } from '../lib/tokens';
import { Icon } from './Icon';
import { useSheetDrag } from '../lib/useSheetDrag';
import { useScrollTop } from '../lib/useScrollTop';
import { SheetHandle, SheetPanel } from './Sheet';
import DatePicker from './DatePicker';
import { todayISO } from '../lib/date';
import { calculateEqualShares, isSplitSumValid } from '../lib/split';

interface AddExpenseSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

// One sheet, two steps: pick a category, then the amount. Smoother than the web's
// stacked modals — no second modal to mount, no focus trap to manage.
const AddExpenseSheet: React.FC<AddExpenseSheetProps> = ({ isOpen, onClose }) => {
  const { getAllCategories, addExpense, showNotification, triggerHaptic, activeWallet, memberName } = useStore();
  const { theme } = useTheme();

  /**
   * Themed styles, built per render. `st` is the themed sheet; `styles` below is
   * still the light-only one, so both are referenced here while the sheet is
   * migrated. `st` takes precedence wherever it has an entry.
   */
  const st = useMemo(() => StyleSheet.create({
    scrim: { flex: 1, backgroundColor: theme.scrim, justifyContent: 'flex-end' },
    panel: { backgroundColor: theme.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
    heading: { ...type.heading, color: theme.text },
    closeButton: { backgroundColor: theme.surfaceSunken },
    searchInput: {
      minHeight: touchTarget,
      backgroundColor: theme.surfaceSunken,
      borderWidth: 1, borderColor: theme.border,
      borderRadius: radius.md,
      paddingHorizontal: space.md,
      fontSize: 16, color: theme.text,
    },
    tile: { backgroundColor: theme.surface, borderColor: theme.border },
    amountInput: { color: theme.text },
    noteInput: {
      color: theme.text,
      backgroundColor: theme.surfaceSunken,
      borderColor: theme.border,
    },
    dateButton: { backgroundColor: theme.surfaceSunken, borderColor: theme.border },
    dateLabel: { color: theme.textSecondary },
    splitRow: { backgroundColor: theme.surfaceSunken, borderColor: theme.border },
    splitLabel: { color: theme.text },
    primaryButton: { backgroundColor: theme.accent },
    primaryLabel: { color: theme.textOnAccent },
    secondaryButton: { backgroundColor: theme.surfaceSunken, borderColor: theme.border },
    secondaryLabel: { color: theme.textSecondary },
    errorText: { color: theme.negative },
    hint: { color: theme.textTertiary },
    total: { color: theme.text, fontVariant: theme.fontVariant },
    memberChip: { backgroundColor: theme.surfaceSunken, borderColor: theme.border },
    memberChipActive: { backgroundColor: theme.accentSoft, borderColor: theme.accent },
    memberChipLabel: { color: theme.textSecondary },
    memberChipLabelActive: { color: theme.accent },
    backButton: { backgroundColor: theme.surfaceSunken },
    amountSymbol: { color: theme.textTertiary },
    amount: { ...type.display, color: theme.text, fontVariant: theme.fontVariant },
    amountError: { color: theme.negative },
    amountErrorText: { color: theme.negative },
    key: { backgroundColor: theme.surface },
    keyLabel: { ...type.heading, color: theme.text, fontVariant: theme.fontVariant },
    saveButton: { backgroundColor: theme.accent },
    saveLabel: { ...type.label, color: theme.textOnAccent },
    splitToggle: { backgroundColor: theme.surfaceSunken, borderColor: theme.border },
    splitToggleLabel: { ...type.label, color: theme.textSecondary },
    splitPanel: { backgroundColor: theme.surfaceSunken, borderColor: theme.border },
    checkbox: { borderColor: theme.borderStrong },
    checkboxOn: { backgroundColor: theme.accent, borderColor: theme.accent },
    checkboxTick: { color: theme.textOnAccent },
    radio: { borderColor: theme.borderStrong },
    radioOn: { borderColor: theme.accent },
    radioDot: { backgroundColor: theme.accent },
    memberName: { ...type.body, color: theme.text },
    memberShare: { ...type.label, color: theme.text, fontVariant: theme.fontVariant },
    splitSum: { color: theme.textTertiary },
    splitError: { color: theme.negative },
    noResults: { color: theme.textTertiary },
    tileName: { ...type.label, color: theme.text },
  }), [theme]);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitIds, setSplitIds] = useState<string[]>([]);
  const [paidById, setPaidById] = useState<string>('');
  const [splitError, setSplitError] = useState<string | null>(null);
  const [step, setStep] = useState<'category' | 'amount'>('category');
  const [category, setCategory] = useState<Category | null>(null);
  const [search, setSearch] = useState('');
  const [amount, setAmount] = useState('0');
  const [amountError, setAmountError] = useState(false);
  const [note, setNote] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const submittingRef = useRef(false);
  // `disabled` needs state, not a ref. A ref mutation does not re-render, so the
  // button rendered `disabled` from whatever the ref happened to hold at the last
  // render. Any state update raised from inside the submit path — the error toast,
  // or the split-mismatch message — re-rendered while the ref was still true, and
  // because nothing re-rendered after the `finally` cleared it, Save stayed
  // permanently dead. One failed save bricked the sheet until it was reopened.
  const [submitting, setSubmitting] = useState(false);
  const currencySymbol = getCurrencySymbol();

  // Members of the active wallet, resolved to display names. A wallet with only
  // one member has nobody to split with, so the whole control is hidden for it.
  const members = useMemo(
    () => (activeWallet.members ?? []).map(id => ({ id, name: memberName(activeWallet, id) })),
    [activeWallet, memberName]
  );
  const canSplit = members.length > 1;

  // The payer defaults to the wallet owner, which for a guest wallet is them.
  const payer = paidById || activeWallet.ownerId;
  const selectedMembers = splitIds
    .map(id => members.find(m => m.id === id))
    .filter((m): m is { id: string; name: string } => !!m);

  // Shares are derived from the live amount, so changing the figure on the keypad
  // above immediately re-balances without a save/recalculate round-trip.
  const shares = useMemo(
    () => calculateEqualShares(parseFloat(amount) || 0, selectedMembers.length),
    [amount, selectedMembers.length]
  );

  const toggleParticipant = (id: string) => {
    setSplitError(null);
    setSplitIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const resetSplit = () => {
    setSplitOpen(false);
    setSplitIds([]);
    setPaidById('');
    setSplitError(null);
  };

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
    setSplitOpen(false);
    setSplitIds([]);
    setPaidById('');
    setSplitError(null);
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
    if (isOpen) {
      setStep('category'); setCategory(null); setSearch('');
      setSplitOpen(false); setSplitIds([]); setPaidById(''); setSplitError(null);
    }
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
    setSubmitting(true);
    try {
      // Two or more participants means a real split; fewer is just a normal expense.
      const split = selectedMembers.length >= 2
        ? {
            splitType: 'equal' as const,
            participants: selectedMembers.map((m, i) => ({ userId: m.id, userName: m.name, amount: shares[i] })),
            paidBy: payer,
            settlements: [],
          }
        : undefined;
      if (split && !isSplitSumValid(split, val)) {
        setSplitError('The split does not add up to the total');
        return;
      }
      await addExpense(val, category, note, selectedDate, split);
      triggerHaptic();
      onClose();
      resetForm();
    } catch (e: any) {
      showNotification('error', e?.message || 'Could not save. Please try again.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
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

  // A percentage maxHeight does not resolve here: the panel sits inside a Modal
  // whose root has no definite height, so '92%' silently collapses to nothing and
  // the panel grows to its full content — pushing the category grid off the bottom
  // of the screen, where it cannot be tapped at all. An explicit pixel bound is
  // the only form that reliably constrains a bottom sheet on Android.
  const { height: windowHeight } = useWindowDimensions();
  const panelMaxHeight = Math.round(windowHeight * 0.92);

  // Declared after safeClose, which resets the split panel on the way out.
  // Only one of the two step scrollables exists at a time, so both report into the
  // same flag and the sheet is dragged by whichever one is on screen.
  const { atTop, onScroll } = useScrollTop(step);
  const { translateY, panHandlers, onPanelLayout } = useSheetDrag(isOpen, safeClose, atTop);

  return (
    <Modal visible={isOpen} transparent animationType="slide" onRequestClose={safeClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex1}>
        <View style={st.scrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={safeClose} />
          {/* A DEFINITE height, not just a cap. A content-sized panel gives any
              flex: 1 child a height of zero, so the category grid and the keypad both
              render past the bottom of the screen where they cannot be seen or
              scrolled to — the sheet looked fine and was completely unusable. On the
              amount step the split panel adds enough height to push Save off-screen
              too, so the variable middle scrolls and the keypad stays anchored. */}
          <SheetPanel translateY={translateY} panHandlers={panHandlers} onLayout={onPanelLayout} style={[styles.panel, st.panel, { height: panelMaxHeight }]}>
            {step === 'category' ? (
              <>
                <SheetHandle />
                <View style={styles.headerRow}>
                  <Text style={[styles.heading, st.heading]}>Add expense</Text>
                  <Pressable onPress={safeClose} style={[styles.closeButton, st.closeButton]} hitSlop={8} android_ripple={{ color: theme.surfacePressed, radius: 24 }}>
                    <Icon name="x" size={18} color="" theme={theme} tone="muted" strokeWidth={2.4} />
                  </Pressable>
                </View>
                <View style={styles.searchWrap}>
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search categories"
                    placeholderTextColor={theme.textTertiary}
                    style={[styles.searchInput, st.searchInput]}
                  />
                </View>
                <ScrollView style={styles.flex1} contentContainerStyle={styles.gridWrap} keyboardShouldPersistTaps="handled" onScroll={onScroll}>
                  <View style={styles.grid}>
                    {filteredCategories.map(cat => {
                      const tint = getCategoryTint(cat.id, theme.name);
                      return (
                        <Pressable
                          key={cat.id}
                          onPress={() => pickCategory(cat)}
                          style={({ pressed }) => [styles.tile, st.tile, pressed && styles.tilePressed]}
                          android_ripple={{ color: theme.surfacePressed }}
                          accessibilityRole="button"
                          accessibilityLabel={cat.name}
                        >
                          <View style={[styles.tileIcon, { backgroundColor: tint.bg }]}>
                            <Text style={styles.tileEmoji}>{cat.emoji}</Text>
                          </View>
                          <Text style={[styles.tileName, st.tileName]}>{cat.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {search.trim() && filteredCategories.length === 0 && (
                    <Text style={[styles.noResults, st.noResults]}>No categories match "{search}"</Text>
                  )}
                </ScrollView>
              </>
            ) : (
              <>
                <SheetHandle />
                <View style={styles.headerRow}>
                  <Pressable onPress={() => { setStep('category'); setCategory(null); }} style={[styles.backButton, st.backButton]} hitSlop={8}>
                    <Icon name="chevron-left" size={22} color="" theme={theme} tone="muted" strokeWidth={2.4} />
                  </Pressable>
                  <View style={[styles.tileIconSmall, { backgroundColor: category ? getCategoryTint(category.id, theme.name).bg : theme.surfaceSunken }]}>
                    <Text style={styles.tileEmojiSmall}>{category?.emoji}</Text>
                  </View>
                  <Text style={[styles.heading, st.heading]} numberOfLines={1}>{category?.name}</Text>
                  <Pressable onPress={safeClose} style={[styles.closeButton, st.closeButton]} hitSlop={8} android_ripple={{ color: theme.surfacePressed, radius: 24 }}>
                    <Icon name="x" size={18} color="" theme={theme} tone="muted" strokeWidth={2.4} />
                  </Pressable>
                </View>

                {/* Amount */}
                <View style={styles.amountWrap}>
                  <Text style={[styles.amountSymbol, st.amountSymbol]}>{currencySymbol}</Text>
                  <Text style={[styles.amount, st.amount, amountError && st.amountError]} numberOfLines={1} adjustsFontSizeToFit>
                    {amount}
                  </Text>
                </View>
                {amountError && <Text style={[styles.amountErrorText, st.amountErrorText]}>Enter an amount greater than 0</Text>}

                {/* Note + date */}
                <View style={styles.noteRow}>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    maxLength={500}
                    placeholder="Add a note (optional)"
                    placeholderTextColor={theme.textTertiary}
                    style={[styles.noteInput, st.noteInput]}
                  />
                  <Pressable onPress={() => setShowDatePicker(true)} style={[styles.dateButton, st.dateButton]} android_ripple={{ color: theme.surfacePressed }}>
                    <Text style={[styles.dateLabel, st.dateLabel]}>{dateLabel}</Text>
                  </Pressable>
                </View>
                {showDatePicker && (
                  <DatePicker value={selectedDate} onChange={onDateChange} />
                )}

                {/* Split — hidden entirely for a single-person wallet, since there
                    is nobody to split with. Scrollable so the keypad and Save stay
                    on screen however long the member list gets. */}
                <ScrollView
                  style={styles.middleScroll}
                  contentContainerStyle={styles.middleScrollContent}
                  keyboardShouldPersistTaps="handled"
                  onScroll={onScroll}
                >
                {canSplit && (
                  <View style={styles.splitWrap}>
                    <Pressable
                      onPress={() => { setSplitOpen(o => !o); setSplitError(null); }}
                      style={({ pressed }) => [styles.splitToggle, st.splitToggle, pressed && styles.keyPressed]}
                      android_ripple={{ color: theme.surfacePressed }}
                    >
                      <Text style={[styles.splitToggleLabel, st.splitToggleLabel]}>
                        {splitOpen
                          ? 'Hide split'
                          : selectedMembers.length >= 2
                            ? `Split between ${selectedMembers.length} people`
                            : 'Split this expense'}
                      </Text>
                      <Icon name={splitOpen ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textTertiary} theme={theme} strokeWidth={2.4} />
                    </Pressable>

                    {splitOpen && (
                      <View style={[styles.splitPanel, st.splitPanel]}>
                        <Text style={[styles.splitLabel, st.splitLabel]}>Split equally between</Text>
                        {members.map(m => {
                          const on = splitIds.includes(m.id);
                          return (
                            <Pressable
                              key={m.id}
                              onPress={() => toggleParticipant(m.id)}
                              style={({ pressed }) => [styles.memberRow, pressed && styles.keyPressed]}
                              android_ripple={{ color: theme.surfacePressed }}
                            >
                              <View style={[styles.checkbox, st.checkbox, on && st.checkboxOn]}>
                                {on ? <Icon name="check" size={13} color={theme.textOnAccent} theme={theme} strokeWidth={3} /> : null}
                              </View>
                              <Text style={[styles.memberName, st.memberName]}>{m.name}</Text>
                              {on && (
                                <Text style={[styles.memberShare, st.memberShare]}>
                                  {currencySymbol} {formatAmount(shares[splitIds.indexOf(m.id)] ?? 0)}
                                </Text>
                              )}
                            </Pressable>
                          );
                        })}

                        <Text style={[styles.splitLabel, st.splitLabel]}>Who paid?</Text>
                        {members.map(m => (
                          <Pressable
                            key={m.id}
                            onPress={() => setPaidById(m.id)}
                            style={({ pressed }) => [styles.memberRow, pressed && styles.keyPressed]}
                            android_ripple={{ color: theme.surfacePressed }}
                          >
                            <View style={[styles.radio, st.radio, payer === m.id && st.radioOn]}>
                              {payer === m.id ? <View style={st.radioDot} /> : null}
                            </View>
                            <Text style={[styles.memberName, st.memberName]}>{m.name}</Text>
                          </Pressable>
                        ))}

                        {selectedMembers.length >= 2 && (
                          <Text style={[styles.splitSum, st.splitSum]}>
                            {selectedMembers.length} × shares of {currencySymbol} {formatAmount(parseFloat(amount) || 0)}
                          </Text>
                        )}
                        {splitError ? <Text style={[styles.splitError, st.splitError]}>{splitError}</Text> : null}
                      </View>
                    )}
                  </View>
                )}

                </ScrollView>

                {/* Keypad — 3 columns so every cell holds a real key, then one big
                    labeled Save button. */}
                <View style={styles.keypad}>
                  <View style={styles.keyGrid}>
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (
                      <Pressable key={n} onPress={() => handleNumPress(n)} style={[styles.key, st.key]} android_ripple={{ color: theme.surfacePressed }}>
                        <Text style={[styles.keyLabel, st.keyLabel]}>{n}</Text>
                      </Pressable>
                    ))}
                    <Pressable onPress={() => handleNumPress('.')} style={[styles.key, st.key]} android_ripple={{ color: theme.surfacePressed }}>
                      <Text style={[styles.keyLabel, st.keyLabel]}>.</Text>
                    </Pressable>
                    <Pressable onPress={() => handleNumPress('0')} style={[styles.key, st.key]} android_ripple={{ color: theme.surfacePressed }}>
                      <Text style={[styles.keyLabel, st.keyLabel]}>0</Text>
                    </Pressable>
                    <Pressable onPress={handleDeletePress} style={[styles.key, st.key]} android_ripple={{ color: theme.surfacePressed }}>
                      <Text style={[styles.keyLabel, st.keyLabel]}>⌫</Text>
                    </Pressable>
                  </View>
                  <Pressable
                    onPress={handleSubmit}
                    disabled={submitting}
                    style={({ pressed }) => [styles.saveButton, st.saveButton, pressed && styles.savePressed]}
                    android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                  >
                    <Text style={[styles.saveLabel, st.saveLabel]}>Save expense</Text>
                  </Pressable>
                </View>
              </>
            )}
          </SheetPanel>
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
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: 24,
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
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  searchInput: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 16 },
  gridWrap: { padding: 16, paddingTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '31%',
    flexGrow: 1,
    borderRadius: radius.xl,
    borderWidth: 1,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 8,
  },
  tilePressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  tileIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
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
  tileName: { fontSize: 14, fontWeight: '600',  textAlign: 'center' },
  noResults: { textAlign: 'center',  paddingVertical: 32, fontSize: 16 },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  amountSymbol: { fontSize: 20, fontWeight: '600',  },
  amount: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1,
    maxWidth: '70%',
  },
  amountError: {},
  amountErrorText: {
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
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  middleScroll: { flexGrow: 0, flexShrink: 1 },
  middleScrollContent: { flexGrow: 0 },
  splitWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  splitToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  splitToggleLabel: { fontSize: 15, fontWeight: '700',  },
  splitToggleChevron: { fontSize: 16, fontWeight: '700',  },
  splitPanel: { marginTop: 8, padding: 12, borderRadius: radius.md,  gap: 2 },
  splitLabel: { fontSize: 13, fontWeight: '700',  marginTop: 8, marginBottom: 2 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: touchTarget,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  memberName: { flex: 1, fontSize: 15, fontWeight: '600',  },
  memberShare: { fontSize: 15, fontWeight: '700',  },
  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2,  
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: {},
  checkboxTick: {  fontSize: 14, fontWeight: '900' },
  radio: {
    width: 22, height: 22, borderRadius: 999,
    borderWidth: 2,  
    alignItems: 'center', justifyContent: 'center',
  },
  radioOn: {},
  radioDot: { width: 10, height: 10, borderRadius: 999 },
  splitSum: { fontSize: 13,  marginTop: 10 },
  splitError: { fontSize: 13,  marginTop: 6 },
  keyPressed: { opacity: 0.7 },

  dateButton: {
    minWidth: 96,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  dateLabel: { fontSize: 14, fontWeight: '600',  },
  keypad: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  keyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  key: {
    width: '31.5%',
    flexGrow: 1,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyLabel: { fontSize: 20, fontWeight: '700',  },
  saveButton: {
    minHeight: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savePressed: { transform: [{ scale: 0.98 }] },
  saveLabel: { fontSize: 17, fontWeight: '700',  },
});

export default AddExpenseSheet;
