import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useStore } from '../store';
import { getCurrencySymbol, formatAmount } from '../lib/money';
import { colors, radius, parseCategoryColor } from '../lib/theme';
import { exportCSV, exportBackup, readBackupFile } from '../lib/exporters';
import { sanitizeBackupExpenses, mergeBackupData } from '../lib/backup';
import * as DocumentPicker from 'expo-document-picker';
import ConfirmDialog from '../components/ConfirmDialog';

const SettingsScreen: React.FC = () => {
  const {
    budget, setBudget, expenses, activeWallet, customCategories,
    addCustomCategory, deleteCustomCategory, getAllCategories,
    clearAllData, showNotification, triggerHaptic, replaceExpenses,
  } = useStore();
  const currencySymbol = getCurrencySymbol();
  const insets = useSafeAreaInsets();

  const [budgetText, setBudgetText] = useState('');
  const [budgetEditing, setBudgetEditing] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryEmoji, setNewCategoryEmoji] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<string | null>(null);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  useEffect(() => {
    if (!budgetEditing) setBudgetText(String(budget));
  }, [budget, budgetEditing]);

  const saveBudget = async () => {
    const val = parseFloat(budgetText);
    if (!Number.isFinite(val) || val < 0) {
      showNotification('error', 'Enter a valid budget');
      return;
    }
    try {
      await setBudget(val);
      setBudgetEditing(false);
      showNotification('success', 'Budget updated');
    } catch (e: any) {
      showNotification('error', e?.message || 'Could not save the budget');
    }
  };

  const handleExportCSV = async () => {
    try {
      await exportCSV(expenses);
    } catch (e: any) {
      showNotification('error', e?.message || 'Could not export CSV');
    }
  };

  const handleExportBackup = async () => {
    try {
      await exportBackup(expenses, activeWallet, budget, customCategories, appVersion);
    } catch (e: any) {
      showNotification('error', e?.message || 'Could not create the backup');
    }
  };

  const handleRestore = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (result.canceled || result.assets.length === 0) return;
      const picked = result.assets[0];
      const backup = await readBackupFile(picked.uri, picked.size);
      const { valid, rejected } = sanitizeBackupExpenses(backup.data.expenses);
      if (valid.length === 0) {
        showNotification('error', 'No usable expenses in that backup');
        return;
      }
      const merged = mergeBackupData(expenses, customCategories, { ...backup, data: { ...backup.data, expenses: valid } });
      await replaceExpenses(merged.expenses);
      showNotification('success', rejected > 0
        ? `Restored ${valid.length} expenses (${rejected} skipped)`
        : `Restored ${valid.length} expenses`);
    } catch (e: any) {
      showNotification('error', e?.message || 'Could not restore the backup');
    }
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) { showNotification('error', 'Give the category a name'); return; }
    if (name.length > 30) { showNotification('error', 'Name too long (max 30 characters)'); return; }
    const emoji = (newCategoryEmoji.trim() || '📝').slice(0, 4);
    if (getAllCategories().some(c => c.name.toLowerCase() === name.toLowerCase())) {
      showNotification('error', 'That category already exists');
      return;
    }
    await addCustomCategory({ id: `custom_${Date.now()}`, name, emoji, color: 'bg-slate-100 text-slate-600' });
    setNewCategoryName('');
    setNewCategoryEmoji('');
    setShowCategoryModal(false);
    showNotification('success', 'Category added');
  };

  const handleClearAll = async () => {
    setConfirmClear(false);
    await clearAllData();
    showNotification('success', 'All data cleared');
  };

  const categoryToDelete = useMemo(
    () => customCategories.find(c => c.id === confirmDeleteCategory),
    [customCategories, confirmDeleteCategory]
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]}>
        <Text style={styles.heading}>Settings</Text>

        {/* Budget */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Monthly budget</Text>
          {budgetEditing ? (
            <View style={styles.budgetEditRow}>
              <View style={styles.budgetInputWrap}>
                <Text style={styles.currencyPrefix}>{currencySymbol}</Text>
                <TextInput
                  style={styles.budgetInput}
                  value={budgetText}
                  onChangeText={setBudgetText}
                  keyboardType="numeric"
                  inputMode="decimal"
                  selectTextOnFocus
                  onSubmitEditing={saveBudget}
                />
              </View>
              <Pressable onPress={saveBudget} style={[styles.smallButton, styles.saveSmallButton]} android_ripple={{ color: 'rgba(255,255,255,0.2)' }}>
                <Text style={styles.smallButtonLabelLight}>Save</Text>
              </Pressable>
              <Pressable onPress={() => setBudgetEditing(false)} style={[styles.smallButton, styles.cancelSmallButton]} android_ripple={{ color: '#f1f5f9' }}>
                <Text style={styles.smallButtonLabel}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.budgetRow}>
              <View style={styles.flex1}>
                <Text style={styles.budgetValue}>{currencySymbol} {formatAmount(budget)}</Text>
                <Text style={styles.caption}>Spending limit for {activeWallet.name}</Text>
              </View>
              <Pressable
                onPress={() => { triggerHaptic(); setBudgetEditing(true); }}
                style={[styles.smallButton, styles.editSmallButton]}
                android_ripple={{ color: '#f1f5f9' }}
              >
                <Text style={styles.smallButtonLabel}>Edit</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Categories */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Categories</Text>
            <Pressable
              onPress={() => { triggerHaptic(); setShowCategoryModal(true); }}
              style={[styles.smallButton, styles.editSmallButton]}
              android_ripple={{ color: '#f1f5f9' }}
            >
              <Text style={styles.smallButtonLabel}>+ Add</Text>
            </Pressable>
          </View>
          {customCategories.length === 0 ? (
            <Text style={styles.caption}>Custom categories appear here. The 9 defaults cover the basics.</Text>
          ) : (
            <View style={styles.categoryList}>
              {customCategories.map(cat => {
                const { bg } = parseCategoryColor(cat.color);
                return (
                  <View key={cat.id} style={styles.categoryRow}>
                    <View style={[styles.categoryIcon, { backgroundColor: bg }]}>
                      <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                    </View>
                    <Text style={styles.categoryName}>{cat.name}</Text>
                    <Pressable
                      onPress={() => setConfirmDeleteCategory(cat.id)}
                      style={styles.categoryDelete}
                      hitSlop={8}
                    >
                      <Text style={styles.categoryDeleteLabel}>Delete</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Data */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your data</Text>
          <Text style={styles.caption}>Stored on this device. Export anytime — CSV for spreadsheets, JSON for a full backup.</Text>
          <View style={styles.dataButtons}>
            <Pressable onPress={handleExportCSV} style={({ pressed: p }) => [styles.dataButton, p && styles.dataButtonPressed]} android_ripple={{ color: '#f1f5f9' }}>
              <Text style={styles.dataButtonEmoji}>📊</Text>
              <View style={styles.flex1}>
                <Text style={styles.dataButtonTitle}>Export CSV</Text>
                <Text style={styles.dataButtonCaption}>Spreadsheet-friendly</Text>
              </View>
            </Pressable>
            <Pressable onPress={handleExportBackup} style={({ pressed: p }) => [styles.dataButton, p && styles.dataButtonPressed]} android_ripple={{ color: '#f1f5f9' }}>
              <Text style={styles.dataButtonEmoji}>💾</Text>
              <View style={styles.flex1}>
                <Text style={styles.dataButtonTitle}>Backup JSON</Text>
                <Text style={styles.dataButtonCaption}>Everything, restorable</Text>
              </View>
            </Pressable>
            <Pressable onPress={handleRestore} style={({ pressed: p }) => [styles.dataButton, p && styles.dataButtonPressed]} android_ripple={{ color: '#f1f5f9' }}>
              <Text style={styles.dataButtonEmoji}>📥</Text>
              <View style={styles.flex1}>
                <Text style={styles.dataButtonTitle}>Restore backup</Text>
                <Text style={styles.dataButtonCaption}>From a JSON backup file</Text>
              </View>
            </Pressable>
          </View>
          <Pressable onPress={() => setConfirmClear(true)} style={styles.clearAllButton} android_ripple={{ color: '#ffe4e6' }}>
            <Text style={styles.clearAllLabel}>Clear all data</Text>
          </Pressable>
        </View>

        {/* About */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>About</Text>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>{appVersion}</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Storage</Text>
            <Text style={styles.aboutValue}>On this device</Text>
          </View>
          <Text style={styles.caption}>Kharcha Bachau (खर्च बचाउ) — built in Nepal, usable anywhere. Your data never leaves this device.</Text>
        </View>
      </ScrollView>

      {/* Add category modal */}
      <Modal visible={showCategoryModal} transparent animationType="fade" onRequestClose={() => setShowCategoryModal(false)}>
        <View style={styles.modalScrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCategoryModal(false)} />
          <View style={styles.modalPanel}>
            <Text style={styles.modalTitle}>New category</Text>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.noteInput}
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              maxLength={30}
              placeholder="e.g. Pet care"
              placeholderTextColor={colors.slate500}
            />
            <Text style={styles.label}>Emoji</Text>
            <TextInput
              style={[styles.noteInput, styles.emojiInput]}
              value={newCategoryEmoji}
              onChangeText={setNewCategoryEmoji}
              maxLength={4}
              placeholder="🐾"
              placeholderTextColor={colors.slate500}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowCategoryModal(false)} style={[styles.button, styles.modalCancelButton]} android_ripple={{ color: '#f1f5f9' }}>
                <Text style={styles.smallButtonLabel}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleAddCategory} style={[styles.button, styles.modalAddButton]} android_ripple={{ color: 'rgba(255,255,255,0.2)' }}>
                <Text style={styles.smallButtonLabelLight}>Add category</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmDeleteCategory}
        title="Delete category?"
        message={`"${categoryToDelete?.name ?? ''}" will be removed. Expenses already logged with it are kept.`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmDeleteCategory) await deleteCustomCategory(confirmDeleteCategory);
          setConfirmDeleteCategory(null);
        }}
        onCancel={() => setConfirmDeleteCategory(null)}
      />
      <ConfirmDialog
        isOpen={confirmClear}
        title="Clear all data?"
        message="Every expense, custom category and your budget will be removed from this device. This cannot be undone."
        confirmLabel="Clear everything"
        cancelLabel="Keep my data"
        destructive
        onConfirm={handleClearAll}
        onCancel={() => setConfirmClear(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.slate50 },
  content: { paddingHorizontal: 16, gap: 16, paddingTop: 12 },

  heading: { fontSize: 26, fontWeight: '800', color: colors.slate900, letterSpacing: -0.5 },
  caption: { fontSize: 14, color: colors.slate600, lineHeight: 20 },
  label: { fontSize: 15, fontWeight: '600', color: colors.slate700 },

  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.card,
    padding: 20,
    gap: 10,
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.slate900 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  budgetEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex1: { flex: 1 },
  budgetInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: 2,
    borderColor: colors.emerald600,
    borderRadius: radius.input,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    gap: 6,
  },
  currencyPrefix: { fontSize: 16, fontWeight: '700', color: colors.slate500 },
  budgetInput: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.slate900, paddingVertical: 10 },
  budgetValue: { fontSize: 24, fontWeight: '800', color: colors.slate900 },

  smallButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSmallButton: { backgroundColor: colors.slate100 },
  saveSmallButton: { backgroundColor: colors.emerald600 },
  cancelSmallButton: { backgroundColor: colors.slate100 },
  smallButtonLabel: { fontSize: 14, fontWeight: '700', color: colors.slate700 },
  smallButtonLabelLight: { fontSize: 14, fontWeight: '700', color: colors.white },

  categoryList: { gap: 8 },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEmoji: { fontSize: 20 },
  categoryName: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.slate900 },
  categoryDelete: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 8 },
  categoryDeleteLabel: { fontSize: 14, fontWeight: '600', color: colors.rose600 },

  dataButtons: { gap: 8 },
  dataButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radius.input,
    padding: 14,
    backgroundColor: colors.white,
  },
  dataButtonEmoji: { fontSize: 22 },
  dataButtonTitle: { fontSize: 15, fontWeight: '700', color: colors.slate900 },
  dataButtonCaption: { fontSize: 13, color: colors.slate600, marginTop: 1 },

  dataButtonPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },

  clearAllButton: {
    minHeight: 48,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.rose400,
    backgroundColor: colors.rose50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearAllLabel: { fontSize: 15, fontWeight: '700', color: colors.rose700 },

  aboutRow: { flexDirection: 'row', justifyContent: 'space-between' },
  aboutLabel: { fontSize: 15, color: colors.slate600 },
  aboutValue: { fontSize: 15, fontWeight: '700', color: colors.slate900 },

  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalPanel: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.white,
    borderRadius: radius.card,
    padding: 24,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.slate900, marginBottom: 8 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButton: { backgroundColor: colors.slate100 },
  modalAddButton: { backgroundColor: colors.emerald600 },

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
  emojiInput: { minHeight: 48, fontSize: 22, textAlign: 'center' },
});

export default SettingsScreen;
