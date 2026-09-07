import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { getCurrencySymbol } from '../utils/currencyFormatter';
import { LogOut, User, Cloud, Wallet, ChevronRight, ChevronDown, Share2, Trash2, Tag, Upload, Database, AlertTriangle, SlidersHorizontal } from 'lucide-react';
import WalletSelector from '../components/WalletSelector';
import CategoryManager from '../components/CategoryManager';
import ConfirmDialog from '../components/ConfirmDialog';
import { replayFirstRunCoach } from '../components/FirstRunCoach';
import * as storage from '../services/storageService';
import { generateCSVExport } from '../services/csvService';
import { exportBackup, importBackup, previewBackup, mergeBackupData, sanitizeBackupExpenses } from '../services/backupService';

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { budget, setBudget, expenses, activeWallet, leaveWallet, deleteWallet, showNotification, setExpenses, wallets, customCategories, triggerHaptic, pendingGuestExpenses, retryGuestSync } = useStore();
  const { user, logout, signInWithGoogle, deleteAccount } = useAuth();
  const [isRetryingSync, setIsRetryingSync] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isWalletSelectorOpen, setIsWalletSelectorOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [backupPreview, setBackupPreview] = useState<any>(null);
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false, title: '', message: '', destructive: false, confirmLabel: 'Confirm', onConfirm: () => {}
  });

  const requestConfirm = (title: string, message: string, onConfirm: () => void, destructive = false, confirmLabel = 'Confirm') => {
    setConfirmDialog({ open: true, title, message, destructive, confirmLabel, onConfirm });
  };

  const importDialogRef = useRef<HTMLDivElement>(null);
  const closeImportDialog = useCallback(() => {
    if (isImporting) return;
    setShowImportDialog(false); setBackupPreview(null); setSelectedImportFile(null);
  }, [isImporting]);
  useFocusTrap(importDialogRef, showImportDialog, closeImportDialog);

  useEffect(() => {
    if (!activeWallet || activeWallet.id === 'guest_wallet' || activeWallet.isPersonal) {
      setInviteCode(null);
      return;
    }
    // The unhandled branch here produced an uncaught promise rejection whenever the
    // lookup failed (offline, denied), and could also resolve after a wallet switch
    // and paint the previous wallet's code onto the new one.
    let cancelled = false;
    setInviteCode(null);
    storage.getOrGenerateInviteCode(activeWallet.id)
      .then(code => { if (!cancelled) setInviteCode(code); })
      .catch(() => { if (!cancelled) setInviteCode(null); });
    return () => { cancelled = true; };
  }, [activeWallet]);

  // Held as the raw string. Coercing an empty field to the number 0 rewrote what the
  // user was mid-way through typing: clearing the box to retype snapped it to "0" and
  // the next keystroke appended to that.
  const [localBudget, setLocalBudget] = useState(() => String(budget));
  const [budgetError, setBudgetError] = useState('');
  const budgetDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingBudgetRef = useRef<number | null>(null);

  useEffect(() => { setLocalBudget(String(budget)); }, [budget]);

  const commitBudget = (raw: string) => {
    const parsed = parseFloat(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed)) { setBudgetError('Enter a number, or 0 for no budget'); return; }
    if (parsed < 0) { setBudgetError('Budget cannot be negative'); return; }
    if (parsed > 1e12) { setBudgetError('That budget is too large'); return; }
    setBudgetError('');
    pendingBudgetRef.current = null;
    setBudget(parsed);
  };

  // Flush on unmount. The cleanup used to only cancel the timer, so leaving Settings
  // within the 600 ms debounce window discarded the change with no indication.
  useEffect(() => () => {
    if (budgetDebounceRef.current) clearTimeout(budgetDebounceRef.current);
    if (pendingBudgetRef.current !== null) setBudget(pendingBudgetRef.current);
  }, [setBudget]);

  const handleBudgetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setLocalBudget(raw);
    if (budgetError) setBudgetError('');
    const parsed = parseFloat(raw);
    pendingBudgetRef.current = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1e12 ? parsed : null;
    if (budgetDebounceRef.current) clearTimeout(budgetDebounceRef.current);
    budgetDebounceRef.current = setTimeout(() => commitBudget(raw), 600);
  };

  const handleBudgetBlur = () => {
    if (budgetDebounceRef.current) clearTimeout(budgetDebounceRef.current);
    commitBudget(localBudget);
  };

  const handleBackupToCloud = async () => {
    try {
      await signInWithGoogle();
      showNotification('success', 'Signed in with Google');
    } catch (e: any) {
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
      const msg = e.code === 'auth/popup-blocked'
        ? 'Pop-up blocked. Please allow pop-ups and try again.'
        : e.code === 'auth/unauthorized-domain'
        ? 'This domain is not authorized. Contact support.'
        : 'Could not sign in. Make sure pop-ups are allowed, or try a different browser.';
      showNotification('error', msg);
    }
  };

  const handleCSV = () => {
    if (!expenses.length) { showNotification('error', 'No data to export'); return; }
    try { generateCSVExport(expenses); showNotification('success', 'CSV downloaded'); }
    catch { showNotification('error', 'Failed to export CSV'); }
  };

  const handleExportBackup = () => {
    try { exportBackup(expenses, wallets, budget, customCategories, user?.id); showNotification('success', 'Backup saved'); }
    catch { showNotification('error', 'Failed to export backup'); }
  };

  const handleImportFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const preview = await previewBackup(file);
      setSelectedImportFile(file);
      setBackupPreview(preview);
    } catch (error: any) { showNotification('error', error.message || 'Failed to read backup file'); }
    e.target.value = '';
  };

  const handleImportConfirmed = async () => {
    if (!selectedImportFile || !user || !activeWallet) return;
    setIsImporting(true);
    try {
      const backup = await importBackup(selectedImportFile);
      const { valid, rejected } = sanitizeBackupExpenses(backup.data.expenses);
      if (valid.length === 0) { showNotification('error', 'No usable expenses found'); setIsImporting(false); return; }
      const cleanBackup = { ...backup, data: { ...backup.data, expenses: valid } };
      const merged = mergeBackupData(expenses, wallets, customCategories, cleanBackup).expenses;
      if (rejected > 0) showNotification('info', `${rejected} damaged ${rejected === 1 ? 'entry was' : 'entries were'} skipped`);

      if (user.type === 'guest') {
        storage.replaceGuestExpenses(merged);
        setExpenses(merged);
        // A backup whose rows are all already present adds nothing. Reporting that as
        // "Restored 0 expenses" under a green tick read like a failure; say plainly
        // that there was nothing new.
        const added = merged.length - expenses.length;
        showNotification(
          added > 0 ? 'success' : 'info',
          added > 0
            ? `Restored ${added} expense${added === 1 ? '' : 's'}`
            : 'Everything in that backup is already here'
        );
      } else {
        const existingIds = new Set(expenses.map(e => e.id));
        const incoming = merged.filter(e => !existingIds.has(e.id));
        const result = await storage.importExpensesToWallet(user, incoming, activeWallet.id);
        showNotification(result.skipped > 0 ? 'info' : 'success', result.skipped > 0
          ? `Restored ${result.imported} — ${result.skipped} skipped`
          : `Restored ${result.imported} expenses`);
      }
      setShowImportDialog(false); setBackupPreview(null); setSelectedImportFile(null); triggerHaptic();
    } catch (error: any) { showNotification('error', error.message || 'Failed to import backup'); }
    finally { setIsImporting(false); }
  };

  const handleSignOut = () => {
    requestConfirm('Sign out', 'Your expenses stay safe in your account. Sign in again any time to see them. This device will go back to guest mode.', async () => { await logout(); }, false, 'Sign out');
  };

  const handleClearData = () => {
    if (!activeWallet || !user) return;
    // Only the wallet owner may remove other people's expenses. For a joined wallet
    // the sweep is scoped to this user's own entries — and the wording says so,
    // rather than promising to wipe everything and then failing.
    const ownOnly = user.type === 'user' && !activeWallet.isPersonal && activeWallet.ownerId !== user.id;
    requestConfirm(
      ownOnly ? 'Delete My Expenses' : 'Delete All Expenses',
      ownOnly
        ? `Every expense you added to "${activeWallet.name}" will be permanently removed. Other members' entries stay. This cannot be undone.`
        : `Every expense in "${activeWallet.name}" will be permanently removed. The wallet itself stays. This cannot be undone.`,
      async () => {
        try {
          await storage.clearAllExpenses(user, activeWallet.id, ownOnly);
          if (user.type === 'guest') setExpenses([]);
          showNotification('success', ownOnly ? 'Your expenses were cleared' : 'All expenses cleared');
        }
        catch (error: any) { showNotification('error', error.message || 'Failed to clear expenses'); }
      }, true, ownOnly ? 'Delete mine' : 'Delete everything');
  };

  const handleLeaveOrDelete = () => {
    if (!activeWallet || !user || user.type === 'guest') return;
    const isOwner = activeWallet.ownerId === user.id;
    if (isOwner) {
      requestConfirm('Delete Wallet', activeWallet.members.length > 1
        ? `"${activeWallet.name}" and every expense will be deleted for all ${activeWallet.members.length} members. This cannot be undone.`
        : `"${activeWallet.name}" and every expense will be permanently deleted. This cannot be undone.`, async () => { await deleteWallet(activeWallet.id); }, true, 'Delete wallet');
    } else {
      requestConfirm('Leave Wallet', `Leave "${activeWallet.name}"? You can rejoin later with an invite code.`, async () => { await leaveWallet(activeWallet.id); }, false, 'Leave wallet');
    }
  };

  const handleDeleteAccount = () => {
    if (!user) return;
    requestConfirm('Delete Account', user.type === 'user'
      ? 'Permanently delete your account and ALL your data (wallets, expenses, categories)? This cannot be undone.'
      : 'Clear all locally stored data from this device? This cannot be undone.', async () => {
      try { await deleteAccount(); showNotification('success', 'Account deleted'); }
      catch (error: any) { showNotification('error', error.message || 'Failed to delete account'); }
    }, true, user.type === 'user' ? 'Delete my account' : 'Clear this device');
  };

  const isSharedWallet = activeWallet && activeWallet.id !== 'guest_wallet' && user?.type === 'user' && !activeWallet.isPersonal;
  const canClearOthers = !isSharedWallet || activeWallet?.ownerId === user?.id;

  return (
    <div className="min-h-full bg-slate-50 overflow-x-hidden" style={{
      paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
      paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
      paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
      paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))'
    }}>
      <div className="px-4 md:px-6 lg:px-8 max-w-2xl mx-auto">

        {/* Header */}
        <div className="section">
          <h1 className="text-heading text-slate-900 mb-0.5">Settings</h1>
          {activeWallet && <p className="text-caption">{activeWallet.name}</p>}
        </div>

        {/* Account */}
        <div className="card section">
          <p className="section-title">Account</p>
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white flex-shrink-0 ${user?.type === 'guest' ? 'bg-amber-500' : 'bg-emerald-600'}`}>
              <User size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{user?.name || 'Guest User'}</p>
              <p className="text-xs text-slate-500 truncate">{user?.type === 'guest' ? 'Data stored on device' : user?.email}</p>
            </div>
            {user?.type === 'user' && (
              <button onClick={handleSignOut} className="min-h-[44px] px-3 bg-white border border-slate-300 rounded-xl text-xs font-semibold active:scale-95 hover:bg-slate-50 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 flex items-center gap-1.5">
                <LogOut size={14} />
                Sign out
              </button>
            )}
          </div>
          {user?.type === 'guest' && (
            <div className="mt-3 space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-900 leading-relaxed">
                  Your expenses are saved <span className="font-bold">only on this phone</span>. If you clear your browser or lose this device, they are gone. Sign in to keep them safe and see them on any device.
                </p>
              </div>
              <button onClick={handleBackupToCloud} className="btn-primary w-full">
                <Cloud size={20} />
                Keep my data safe
              </button>
            </div>
          )}
        </div>

        {/* Pending sync */}
        {user?.type === 'user' && pendingGuestExpenses > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-900">{pendingGuestExpenses} expense{pendingGuestExpenses === 1 ? '' : 's'} not backed up</p>
              <p className="text-xs text-amber-800 mt-0.5">These are on this phone but not in your account yet. They are still safe here.</p>
              <button onClick={async () => { setIsRetryingSync(true); try { await retryGuestSync(); } finally { setIsRetryingSync(false); } }} disabled={isRetryingSync} className="mt-2 min-h-[44px] w-full bg-amber-600 text-white rounded-xl text-sm font-semibold active:scale-95 hover:bg-amber-700 transition-colors disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-amber-500">
                {isRetryingSync ? 'Backing up...' : 'Back these up now'}
              </button>
            </div>
          </div>
        )}

        {/* Invite Code */}
        {inviteCode && !activeWallet?.isPersonal && (
          <div className="card section text-center">
            <p className="text-subhead mb-2">Invite Code</p>
            <div className="flex items-center justify-center gap-3 mb-1.5">
              <p className="text-2xl font-bold text-slate-900 tracking-widest">{inviteCode}</p>
              <button onClick={async () => { try { await navigator.clipboard.writeText(inviteCode); showNotification('success', 'Copied'); } catch { showNotification('error', 'Failed to copy'); } }} className="min-h-[44px] min-w-[44px] bg-emerald-600 text-white rounded-xl active:scale-95 flex items-center justify-center hover:bg-emerald-700 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
                <Share2 size={20} />
              </button>
            </div>
            <p className="text-caption">Share this code with people you want to add</p>
          </div>
        )}

        {/* Wallet & Categories */}
        <div className="card section">
          <p className="section-title">Organize</p>
          <div className="space-y-2">
            <button onClick={() => setIsWalletSelectorOpen(true)} className="w-full min-h-[56px] bg-white border border-slate-200 rounded-xl px-4 flex items-center justify-between active:scale-[0.98] hover:bg-slate-50 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
              <div className="flex items-center gap-3">
                <Wallet size={22} className="text-slate-600" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-slate-900">Wallet</p>
                  <p className="text-xs text-slate-500">{activeWallet?.name || 'Personal'}</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-slate-400" />
            </button>
            <button onClick={() => { setIsCategoryManagerOpen(true); }} className="w-full min-h-[56px] bg-white border border-slate-200 rounded-xl px-4 flex items-center justify-between active:scale-[0.98] hover:bg-slate-50 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
              <div className="flex items-center gap-3">
                <Tag size={22} className="text-slate-600" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-slate-900">Categories</p>
                  <p className="text-xs text-slate-500">Add, edit, or remove categories</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-slate-400" />
            </button>
            <div>
              <label htmlFor="monthly-budget" className="text-subhead block mb-2">Monthly Budget</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-bold">{getCurrencySymbol()}</span>
                <input id="monthly-budget" type="number" inputMode="decimal" min={0} max={1e12} step="100"
                  value={localBudget} onChange={handleBudgetChange} onBlur={handleBudgetBlur}
                  aria-invalid={!!budgetError} aria-describedby={budgetError ? 'budget-error' : undefined}
                  className={`input pl-12 ${budgetError ? 'border-rose-400' : ''}`} />
              </div>
              {budgetError
                ? <p id="budget-error" className="text-xs text-rose-600 mt-1.5 ml-1">{budgetError}</p>
                : <p className="text-xs text-slate-500 mt-1.5 ml-1">Set 0 to hide the budget bar.</p>}
            </div>
          </div>
        </div>

        {/* Backup — one clear action: save a copy of my data. Restoring and
            the destructive tools live under Advanced below, so nobody taps
            them by accident. */}
        <div className="card section">
          <p className="section-title">Keep my data safe</p>
          <button onClick={handleExportBackup} className="btn-primary w-full">
            <Database size={20} />
            Save a copy of my data
          </button>
          <p className="text-xs text-slate-500 mt-2.5 leading-relaxed">
            Downloads a file you can bring back later with Restore. Once you sign in, your data is also kept safe automatically.
          </p>
          <button onClick={handleCSV} className="mt-1 min-h-[48px] w-full text-sm font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-800 active:scale-95 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 rounded">
            Download as spreadsheet (for viewing only)
          </button>
        </div>

        {/* Advanced — restore and destructive tools, collapsed by default. */}
        <div className="card section">
          <button
            onClick={() => setShowAdvanced(v => !v)}
            aria-expanded={showAdvanced}
            className="w-full min-h-[56px] flex items-center justify-between active:scale-[0.98] transition-transform focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 rounded-xl"
          >
            <div className="flex items-center gap-3">
              <SlidersHorizontal size={22} className="text-slate-600" />
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-900">Advanced</p>
                <p className="text-xs text-slate-500">Restore backups, delete data</p>
              </div>
            </div>
            <ChevronDown size={20} className={`text-slate-400 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          </button>
          {showAdvanced && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
              <button onClick={() => { setShowImportDialog(true); setBackupPreview(null); }} className="btn-secondary w-full justify-start gap-3 px-4">
                <Upload size={20} className="flex-shrink-0" />
                <span className="text-left">
                  <span className="block text-sm font-semibold">Restore from a backup file</span>
                  <span className="block text-xs opacity-70 font-normal">Brings saved expenses back, removes nothing</span>
                </span>
              </button>
              {/* One shared row shape for all danger actions: same padding, same
                  icon gap, same left edge. */}
              <button onClick={handleClearData} className="btn-danger w-full justify-start gap-3 px-4">
                <Trash2 size={20} className="flex-shrink-0" />
                <span className="text-left">
                  <span className="block text-sm font-semibold">{canClearOthers ? 'Delete all expenses' : 'Delete my expenses'}</span>
                  <span className="block text-xs opacity-70 font-normal">{canClearOthers ? 'Keeps the wallet, removes what is in it' : 'Removes only the ones you added'}</span>
                </span>
              </button>
              {isSharedWallet && (
                <button onClick={handleLeaveOrDelete} className={`w-full justify-start gap-3 px-4 focus-visible:ring-2 focus-visible:ring-offset-2 ${activeWallet?.ownerId === user?.id ? 'btn-danger' : 'btn-secondary'}`}>
                  <Trash2 size={20} className="flex-shrink-0" />
                  <span className="text-left">
                    <span className="block text-sm font-semibold">{activeWallet?.ownerId === user?.id ? 'Delete this wallet' : 'Leave this wallet'}</span>
                    <span className="block text-xs opacity-70 font-normal">{activeWallet?.ownerId === user?.id ? 'Removes it for everyone' : 'You can rejoin with the code'}</span>
                  </span>
                </button>
              )}
              <button onClick={handleDeleteAccount} className="btn-danger w-full justify-start gap-3 px-4">
                <Trash2 size={20} className="flex-shrink-0" />
                <span className="text-left">
                  <span className="block text-sm font-semibold">{user?.type === 'user' ? 'Delete my account' : 'Clear this device'}</span>
                  <span className="block text-xs opacity-70 font-normal">{user?.type === 'user' ? 'Removes everything, everywhere' : 'Removes everything saved here'}</span>
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center py-6 space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Kharcha Bachau v{__APP_VERSION__}</p>
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => { navigate('/privacy'); }} className="text-xs text-emerald-600 underline underline-offset-2 hover:text-emerald-700 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 rounded">
              Privacy Policy
            </button>
            <button onClick={replayFirstRunCoach} className="text-xs text-emerald-600 underline underline-offset-2 hover:text-emerald-700 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 rounded">
              Replay quick tour
            </button>
          </div>
        </div>

        {/* Import Dialog — a plain div before, so it had no dialog role, no focus
            trap and no Escape key; keyboard users could tab straight out behind it. */}
        {showImportDialog && (
          <div className="fixed inset-0 z-import flex items-center justify-center p-4 bg-slate-900/60" onClick={closeImportDialog}>
            <div ref={importDialogRef} role="dialog" aria-modal="true" aria-labelledby="restore-title"
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl p-5 max-w-sm w-full mx-4 animate-scale-in">
              <h3 id="restore-title" className="text-heading text-slate-900 mb-3">Restore Data</h3>
              {backupPreview ? (
                <>
                  <div className="space-y-1.5 mb-4 text-xs">
                    <p><span className="font-medium">Version:</span> {backupPreview.version}</p>
                    <p><span className="font-medium">Expenses:</span> {backupPreview.expenseCount}</p>
                    <p><span className="font-medium">Wallets:</span> {backupPreview.walletCount}</p>
                    <p><span className="font-medium">Budget:</span> {getCurrencySymbol()} {backupPreview.budget.toLocaleString()}</p>
                    {backupPreview.rejectedCount > 0 && (
                      <p className="text-amber-700 font-medium">{backupPreview.rejectedCount} damaged {backupPreview.rejectedCount === 1 ? 'entry' : 'entries'} will be skipped</p>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-2.5 mb-4">
                    These will be added to <span className="font-semibold text-slate-900">{activeWallet?.name}</span>. Nothing already there will be removed.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={closeImportDialog} disabled={isImporting} className="btn-secondary flex-1">Cancel</button>
                    <button onClick={handleImportConfirmed} disabled={isImporting} className="btn-primary flex-1">{isImporting ? 'Restoring...' : 'Restore'}</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-600 mb-4">Select a backup file to restore your data.</p>
                  <div className="flex gap-2">
                    <button onClick={closeImportDialog} className="btn-secondary flex-1">Cancel</button>
                    <label className="btn-primary flex-1 text-center cursor-pointer">
                      Select File
                      <input type="file" accept=".json" onChange={handleImportFileSelect} className="hidden" />
                    </label>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <WalletSelector isOpen={isWalletSelectorOpen} onClose={() => setIsWalletSelectorOpen(false)} />
      <CategoryManager isOpen={isCategoryManagerOpen} onClose={() => setIsCategoryManagerOpen(false)} />

      <ConfirmDialog
        isOpen={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        destructive={confirmDialog.destructive}
        confirmLabel={confirmDialog.confirmLabel}
        cancelLabel="Cancel"
        onConfirm={() => { setConfirmDialog(c => ({ ...c, open: false })); confirmDialog.onConfirm(); }}
        onCancel={() => setConfirmDialog(c => ({ ...c, open: false }))}
      />
    </div>
  );
};

export default React.memo(SettingsPage);
