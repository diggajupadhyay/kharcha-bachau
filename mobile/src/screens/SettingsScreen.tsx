import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, TextInput, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { useStore } from '../store';
import { getCurrencySymbol, formatAmount } from '../lib/money';
import { useTheme } from '../lib/theme-context';
import { type, space, radius, touchTarget } from '../lib/tokens';
import {
  Section, Row, Badge, DangerZone, PrimaryButton, SecondaryButton, Field, FactRow,
  EmptyState,
} from '../components/primitives';
import { Icon } from '../components/Icon';
import { exportCSV, exportBackup, readBackupFile } from '../lib/exporters';

import * as DocumentPicker from 'expo-document-picker';
import ConfirmDialog from '../components/ConfirmDialog';
import WalletSelector from '../components/WalletSelector';
import { useAuth, cloudAvailable } from '../AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';

const SettingsScreen: React.FC = () => {
  const {
    budget, setBudget, expenses, activeWallet, wallets, monthSpendByWallet,
    totalSpendByWallet, customCategories,
    addCustomCategory, deleteCustomCategory, getAllCategories,
    clearAllData, showNotification, triggerHaptic, restoreFromBackup,
    setActiveWallet, createWallet, renameWallet, deleteWallet,
    addMember, removeMember, memberName,
    getInviteCode, joinWallet, leaveWallet,
  } = useStore();
  const { user: session, signIn, signOut } = useAuth();
  const cloudUsable = cloudAvailable();
  const { theme, preference, setPreference } = useTheme();
  const [signingIn, setSigningIn] = useState(false);
  const [inviteInput, setInviteInput] = useState('');
  const currencySymbol = getCurrencySymbol();
  const insets = useSafeAreaInsets();

  const [budgetText, setBudgetText] = useState('');
  const [budgetEditing, setBudgetEditing] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryEmoji, setNewCategoryEmoji] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<string | null>(null);
  const [confirmDeleteWallet, setConfirmDeleteWallet] = useState<string | null>(null);
  const [walletsOpen, setWalletsOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<string | null>(null);

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

  /**
   * Restores a whole backup rather than folding its expenses into whichever wallet
   * is open. A file from the old webapp carries its own wallets, and a flat merge
   * left rows pointing at ids that no longer existed — invisible immediately, with
   * no error.
   */
  const handleRestore = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (result.canceled || result.assets.length === 0) return;
      const picked = result.assets[0];
      const backup = await readBackupFile(picked.uri, picked.size);
      setRestoring(true);

      const summary = await restoreFromBackup(backup);

      // Counts are spelled out because a silent partial restore is worse than a
      // loud one — the user has no other way to tell 37 rows from 12.
      const parts = [
        `${summary.expenses} expense${summary.expenses === 1 ? '' : 's'}`,
        `${summary.wallets} wallet${summary.wallets === 1 ? '' : 's'}`,
      ];
      if (summary.categories > 0) parts.push(`${summary.categories} categor${summary.categories === 1 ? 'y' : 'ies'}`);
      if (summary.rejected > 0) parts.push(`${summary.rejected} skipped`);
      if (summary.orphaned > 0) parts.push(`${summary.orphaned} could not be matched to a wallet`);

      showNotification(
        summary.rejected > 0 || summary.orphaned > 0 ? 'info' : 'success',
        `Restored ${parts.join(', ')}`,
      );
    } catch (e: any) {
      showNotification('error', e?.message || 'Could not restore the backup');
    } finally {
      setRestoring(false);
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

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      const result = await signIn();
      if (result?.type === 'cloud') showNotification('success', `Signed in as ${result.displayName}`);
    } catch (e: any) {
      showNotification('error', e?.message || 'Sign-in failed');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
      showNotification('info', 'Signed out — back to this device');
    } catch (e: any) {
      showNotification('error', e?.message || 'Could not sign out');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    const code = inviteInput.trim();
    if (!code || busy) return;
    setBusy(true);
    try {
      const result = await joinWallet(code);
      setInviteInput('');
      showNotification(
        'success',
        result.alreadyMember ? `You are already in ${result.name}` : `Joined ${result.name}`,
      );
    } catch (e: any) {
      showNotification('error', e?.message || 'Could not join that wallet');
    } finally {
      setBusy(false);
    }
  };

  const handleAddMember = async () => {
    const name = newMemberName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await addMember(activeWallet.id, name);
      setNewMemberName('');
      showNotification('success', `${name} added`);
    } catch (e: any) {
      showNotification('error', e?.message || 'Could not add that person');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Deletes the cloud account. Play Store requires an in-app deletion path, and
   * "clear this device" is not it — the data lives in Firestore, so removing local
   * copies would leave it all still there after signing back in.
   */
  const handleDeleteAccount = async () => {
    setConfirmDeleteAccount(false);
    setBusy(true);
    try {
      const { getCloud } = await import('../AuthContext');
      await getCloud().deleteCloudAccount(session.type === 'cloud' ? session.uid : '');
      await signOut();
      showNotification('success', 'Your account and data have been deleted');
    } catch (e: any) {
      showNotification('error', e?.message || 'Could not delete your account');
    } finally {
      setBusy(false);
    }
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
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: space.lg,
          paddingTop: space.md,
          paddingBottom: 120 + insets.bottom,
          gap: space.xl,
        }}
      >
        <Text style={[type.title, { color: theme.text }]}>Settings</Text>

        {/* Account leads because it changes what the rest of the screen means. */}
        <Section label="Account">
          {session.type === 'cloud' ? (
            <>
              <Row
                icon="user"
                title={session.displayName}
                subtitle={session.email ?? 'Signed in'}
                trailing={<Badge label="Cloud" tone="positive" />}
                first
              />
              <Row
                icon="cloud"
                title="Synced across devices"
                subtitle="Your wallets and expenses live in the cloud. Anything left on this device has been moved up."
              />
              <Row
                icon="log-out"
                title="Sign out"
                subtitle="Back to this device only"
                onPress={handleSignOut}
                disabled={busy}
              />
            </>
          ) : (
            <View style={{ padding: space.lg, gap: space.md }}>
              <Text style={[type.body, { color: theme.textSecondary, lineHeight: 23 }]}>
                You are using Kharcha Bachau without an account, so your data stays on this
                device. Sign in to keep it in the cloud, sync across devices, and share a
                wallet with an invite code.
              </Text>
              {cloudUsable ? (
                <GoogleSignInButton
                  size="wide"
                  colorScheme="light"
                  signInBehavior="none"
                  onPress={handleSignIn}
                  loading={signingIn}
                  disabled={signingIn}
                  style={{ width: '100%' }}
                />
              ) : (
                <Text style={[type.caption, { color: theme.textTertiary }]}>
                  Cloud sign-in is unavailable in this build.
                </Text>
              )}
            </View>
          )}
        </Section>

        {/* Wallets */}
        <Section
          label="Wallets"
          title={`${wallets.length} ${wallets.length === 1 ? 'wallet' : 'wallets'}`}
          caption={
            wallets.length === 1
              ? 'A wallet is one pot of money. Add another for a trip, a home, or a shared group.'
              : 'Each wallet keeps its own expenses and budget.'
          }
        >
          {wallets.map((wallet, i) => {
            const isActive = wallet.id === activeWallet.id;
            // Never call a wallet empty just because this month is quiet — see the
            // note on walletSubtitle in WalletSelector.
            const spend = monthSpendByWallet[wallet.id];
            const total = totalSpendByWallet[wallet.id];
            return (
              <Row
                key={wallet.id}
                first={i === 0}
                icon={wallet.isPersonal ? 'credit-card' : 'users'}
                title={wallet.name}
                subtitle={
                  spend
                    ? `${currencySymbol} ${formatAmount(spend)} this month`
                    : total
                      ? `${currencySymbol} ${formatAmount(total)} in total`
                      : 'Nothing recorded yet'
                }
                trailing={
                  isActive
                    ? <Icon name="check" size={18} color="" theme={theme} tone="accent" strokeWidth={2.6} />
                    : wallet.isPersonal
                      ? undefined
                      : <Badge label="Shared" />
                }
                onPress={async () => {
                  if (isActive) { setWalletsOpen(true); return; }
                  try {
                    await setActiveWallet(wallet.id);
                    showNotification('success', `Switched to ${wallet.name}`);
                  } catch (e: any) {
                    showNotification('error', e?.message || 'Could not switch wallet');
                  }
                }}
                accessibilityLabel={`${wallet.name}${wallet.isPersonal ? '' : ', shared'}. ${isActive ? 'Active. ' : ''}Tap to switch.`}
              />
            );
          })}
          <Row
            icon="plus"
            title="Manage wallets"
            subtitle="Create, rename or delete"
            onPress={() => { triggerHaptic(); setWalletsOpen(true); }}
          />
        </Section>

        {/* Joining needs an account, so it only appears when signed in. */}
        {session.type === 'cloud' && (
          <Section
            label="Shared wallets"
            title="Redeem an invite"
            caption="Share a wallet with a 6-character code, or enter one you were given."
          >
            <View style={{ padding: space.lg, paddingTop: space.xs, gap: space.sm }}>
              <Field
                value={inviteInput}
                onChangeText={setInviteInput}
                maxLength={8}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="Invite code"
                returnKeyType="go"
                onSubmitEditing={handleJoin}
                style={{
                  letterSpacing: 3,
                  fontWeight: '600',
                  fontVariant: theme.fontVariant,
                }}
              />
              <PrimaryButton
                label="Join wallet"
                icon="users"
                onPress={handleJoin}
                disabled={busy || inviteInput.trim().length < 6}
              />
            </View>
          </Section>
        )}

        {/* People — splitting needs at least two. */}
        <Section
          label="People"
          title={activeWallet.name}
          caption={
            session.type === 'cloud'
              ? 'Members of a cloud wallet are real accounts, added by redeeming an invite code. Adding a name here could not be verified, so the app does not allow it.'
              : 'Add the people you split with. Everyone you add can be picked when you split an expense.'
          }
        >
          {(activeWallet.members ?? []).length === 0 ? (
            <EmptyState
              compact
              icon="users"
              title="No one else here yet"
              body="Add people you split with, then pick them when logging an expense."
            />
          ) : (
            (activeWallet.members ?? []).map((id, i) => (
              <Row
                key={id}
                first={i === 0}
                title={memberName(activeWallet, id)}
                subtitle={id === activeWallet.ownerId ? 'Owns this wallet' : 'Member'}
                trailing={
                  id === activeWallet.ownerId
                    ? <Badge label="Owner" tone="neutral" />
                    : (
                      <Pressable
                        onPress={() => setConfirmRemoveMember(id)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${memberName(activeWallet, id)}`}
                      >
                        <Text style={[type.caption, { fontWeight: '700', color: theme.negative }]}>
                          Remove
                        </Text>
                      </Pressable>
                    )
                }
              />
            ))
          )}
          {session.type === 'cloud' ? null : (
            <View style={{ padding: space.lg, paddingTop: space.sm, gap: space.sm }}>
              <Field
                value={newMemberName}
                onChangeText={setNewMemberName}
                maxLength={40}
                placeholder="Add someone by name"
                onSubmitEditing={handleAddMember}
                returnKeyType="done"
              />
              <SecondaryButton
                label="Add person"
                icon="plus"
                onPress={handleAddMember}
                disabled={busy || newMemberName.trim().length === 0}
              />
            </View>
          )}
        </Section>

        {/* Budget */}
        <Section label="Budget" title="Monthly limit">
          {budgetEditing ? (
            <View style={{ padding: space.lg, paddingTop: space.xs, gap: space.sm }}>
              <Field
                label={`Amount in ${currencySymbol}`}
                value={budgetText}
                onChangeText={setBudgetText}
                keyboardType="numeric"
                inputMode="decimal"
                selectTextOnFocus
                onSubmitEditing={saveBudget}
                style={{
                  fontSize: 22,
                  fontWeight: '700',
                  fontVariant: theme.fontVariant,
                }}
              />
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <PrimaryButton label="Save" onPress={saveBudget} style={{ flex: 1 }} />
                <SecondaryButton
                  label="Cancel"
                  onPress={() => setBudgetEditing(false)}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : (
            <Row
              first
              icon="pie-chart"
              title={`${currencySymbol} ${formatAmount(budget)}`}
              subtitle={budget > 0 ? `Spending limit for ${activeWallet.name}` : 'No limit set'}
              trailing={
                <Pressable
                  onPress={() => { triggerHaptic(); setBudgetEditing(true); }}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Edit monthly budget"
                >
                  <Text style={[type.caption, { fontWeight: '700', color: theme.accent }]}>Edit</Text>
                </Pressable>
              }
              onPress={() => { triggerHaptic(); setBudgetEditing(true); }}
            />
          )}
        </Section>

        {/* Categories */}
        <Section
          label="Categories"
          title="Custom categories"
          caption={customCategories.length === 0
            ? 'The 9 defaults cover the basics. Add your own for anything specific to you.'
            : undefined}
        >
          {customCategories.length === 0 ? (
            <Row
              first
              icon="tag"
              title="Add a category"
              subtitle="e.g. Pet care"
              onPress={() => { triggerHaptic(); setShowCategoryModal(true); }}
            />
          ) : (
            customCategories.map((cat, i) => {
              return (
                <Row
                  key={cat.id}
                  first={i === 0}
                  title={cat.name}
                  leading={<Text style={{ fontSize: 19 }}>{cat.emoji}</Text>}
                  trailing={
                    <Pressable
                      onPress={() => setConfirmDeleteCategory(cat.id)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${cat.name}`}
                    >
                      <Text style={[type.caption, { fontWeight: '700', color: theme.negative }]}>
                        Delete
                      </Text>
                    </Pressable>
                  }
                  style={{ paddingLeft: space.lg }}
                />
              );
            })
          )}
          {customCategories.length > 0 && (
            <Row icon="plus" title="Add a category" onPress={() => { triggerHaptic(); setShowCategoryModal(true); }} />
          )}
        </Section>

        {/* Appearance — the theme switch lives here rather than in a hidden menu. */}
        <Section
          label="Appearance"
          title="Theme"
          caption={preference === 'system' ? 'Following your device setting' : undefined}
        >
          <View style={{ padding: space.lg, paddingTop: space.xs, flexDirection: 'row', gap: space.sm }}>
            {([
              { key: 'system' as const, label: 'System', icon: 'sun' as const },
              { key: 'light' as const, label: 'Light', icon: 'sun' as const },
              { key: 'dark' as const, label: 'Dark', icon: 'moon' as const },
            ]).map(opt => {
              const active = preference === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setPreference(opt.key)}
                  android_ripple={{ color: theme.surfacePressed }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={opt.label}
                  style={{
                    flex: 1,
                    minHeight: touchTarget,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: active ? theme.accent : theme.border,
                    backgroundColor: active ? theme.accentSoft : theme.surfaceSunken,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: space.xs,
                  }}
                >
                  <Icon
                    name={opt.icon}
                    size={15}
                    color=""
                    theme={theme}
                    tone={active ? 'accent' : 'muted'}
                  />
                  <Text
                    style={[
                      type.caption,
                      { fontWeight: '600', color: active ? theme.accent : theme.textSecondary },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        {/* Data */}
        <Section
          label="Your data"
          caption={
            session.type === 'cloud'
              ? 'Also in the cloud, so you can reach it from another device. Export anytime.'
              : 'Stored on this device. Export anytime.'
          }
        >
          <Row
            first
            icon="grid"
            title="Export CSV"
            subtitle="Spreadsheet-friendly"
            onPress={handleExportCSV}
          />
          <Row icon="file" title="Backup JSON" subtitle="Everything, restorable" onPress={handleExportBackup} />
          <Row
            icon="upload"
            title={restoring ? 'Restoring…' : 'Restore backup'}
            subtitle="From a JSON backup file"
            disabled={restoring}
            onPress={handleRestore}
          />
        </Section>

        {/*
          Destructive actions sit in their own block, below everything else, and
          are never adjacent to an everyday action. Previously "Delete my account"
          sat inside the same card as "Export CSV".
        */}
        <DangerZone>
          {session.type === 'cloud' ? (
            <Row
              first
              icon="trash"
              title="Delete my account"
              subtitle="Removes your cloud wallets, expenses and categories, and signs you out."
              destructive
              onPress={() => setConfirmDeleteAccount(true)}
            />
          ) : (
            <Row
              first
              icon="trash"
              title="Clear all data"
              subtitle="Removes every expense, category and your budget from this device."
              destructive
              onPress={() => setConfirmClear(true)}
            />
          )}
        </DangerZone>

        <Section label="About" title={appVersion}>
          <FactRow label="Storage" value={session.type === 'cloud' ? 'This device and cloud' : 'This device'} />
          <FactRow label="Built in" value="Nepal" />
          <View style={{ padding: space.lg, paddingTop: space.sm }}>
            <Text style={[type.caption, { color: theme.textTertiary, lineHeight: 18 }]}>
              Kharcha Bachau (खर्च बचाउ) — built in Nepal, usable anywhere.
            </Text>
          </View>
        </Section>
      </ScrollView>

      <WalletSelector
        isOpen={walletsOpen}
        wallets={wallets}
        activeWalletId={activeWallet.id}
        monthSpend={monthSpendByWallet}
        totalSpend={totalSpendByWallet}
        onSwitch={setActiveWallet}
        onCreate={async (name, isPersonal = true) => { await createWallet(name, isPersonal); }}
        onRename={renameWallet}
        // Confirmed here rather than in the sheet: deleting a wallet also deletes
        // every expense in it, permanently, and one mis-tap on a row of small buttons
        // is enough. The sheet itself is a Modal, so its dialog would have to stack
        // a second one on top.
        onDelete={async (walletId) => { setConfirmDeleteWallet(walletId); }}
        onInvite={session.type === 'cloud' ? getInviteCode : undefined}
        onClose={() => setWalletsOpen(false)}
      />

      {/* Add category modal */}
      <Modal
        visible={showCategoryModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCategoryModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: theme.scrim, justifyContent: 'center', padding: space.xl }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCategoryModal(false)} />
          <View
            style={{
              backgroundColor: theme.surface,
              borderRadius: radius.xl,
              padding: space.xl,
              gap: space.md,
            }}
          >
            <Text style={[type.heading, { color: theme.text }]}>New category</Text>
            <Field
              label="Name"
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              maxLength={30}
              placeholder="e.g. Pet care"
            />
            <Field
              label="Emoji"
              value={newCategoryEmoji}
              onChangeText={setNewCategoryEmoji}
              maxLength={4}
              placeholder="🐾"
              style={{ fontSize: 22, textAlign: 'center' }}
            />
            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.xs }}>
              <SecondaryButton
                label="Cancel"
                onPress={() => setShowCategoryModal(false)}
                style={{ flex: 1 }}
              />
              <PrimaryButton label="Add" onPress={handleAddCategory} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmDeleteWallet}
        title="Delete wallet?"
        message={`"${wallets.find(w => w.id === confirmDeleteWallet)?.name ?? ''}" and every expense in it will be permanently deleted. Anyone splitting with you loses access too. This cannot be undone.`}
        confirmLabel="Delete wallet"
        destructive
        onConfirm={async () => {
          if (!confirmDeleteWallet) return;
          try {
            await deleteWallet(confirmDeleteWallet);
            setConfirmDeleteWallet(null);
            setWalletsOpen(false);
          } catch (e: any) {
            setConfirmDeleteWallet(null);
            showNotification('error', e?.message || 'Could not delete the wallet');
          }
        }}
        onCancel={() => setConfirmDeleteWallet(null)}
      />
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
        isOpen={!!confirmRemoveMember}
        title="Remove from wallet?"
        message={`${confirmRemoveMember ? memberName(activeWallet, confirmRemoveMember) : ''} will no longer appear when you split expenses. Anything they already owe stays on the books.`}
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (confirmRemoveMember) {
            try {
              await removeMember(activeWallet.id, confirmRemoveMember);
              showNotification('success', 'Removed');
            } catch (e: any) {
              showNotification('error', e?.message || 'Could not remove that person');
            }
          }
          setConfirmRemoveMember(null);
        }}
        onCancel={() => setConfirmRemoveMember(null)}
      />
      <ConfirmDialog
        isOpen={confirmDeleteAccount}
        title="Delete your account?"
        message="This permanently removes your cloud wallets, expenses and categories, and signs you out. Anything already synced cannot be recovered."
        confirmLabel="Delete everything"
        cancelLabel="Keep my account"
        destructive
        onConfirm={handleDeleteAccount}
        onCancel={() => setConfirmDeleteAccount(false)}
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

export default SettingsScreen;