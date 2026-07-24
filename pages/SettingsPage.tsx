import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { getCurrencySymbol } from '../utils/currencyFormatter';
import { LogOut, User, Cloud, Wallet, Download, ChevronRight, Share2, Trash2, Tag, Upload, Database, Settings } from 'lucide-react';
import WalletSelector from '../components/WalletSelector';
import CategoryManager from '../components/CategoryManager';
import AuthModal from '../components/AuthModal';
import ConfirmDialog from '../components/ConfirmDialog';
import * as storage from '../services/storageService';
import { generateCSVExport } from '../services/csvService';
import { exportBackup, importBackup, previewBackup, mergeBackupData } from '../services/backupService';

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { budget, setBudget, expenses, activeWallet, leaveWallet, deleteWallet, showNotification, setExpenses, wallets, customCategories, triggerHaptic } = useStore();
  const { user, logout, signInWithGoogle, deleteAccount } = useAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isWalletSelectorOpen, setIsWalletSelectorOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [backupPreview, setBackupPreview] = useState<any>(null);
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    destructive?: boolean;
    onConfirm: () => void;
  }>({ open: false, title: '', message: '', destructive: false, onConfirm: () => {} });

  const requestConfirm = (title: string, message: string, onConfirm: () => void, destructive = false) => {
    setConfirmDialog({ open: true, title, message, destructive, onConfirm });
  };

  useEffect(() => {
    if (activeWallet && activeWallet.id !== 'guest_wallet' && !activeWallet.isPersonal) {
        storage.getOrGenerateInviteCode(activeWallet.id).then(setInviteCode);
    } else {
        setInviteCode(null);
    }
  }, [activeWallet]);

  const [localBudget, setLocalBudget] = useState(budget);
  const budgetDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setLocalBudget(budget);
  }, [budget]);

  const handleBudgetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setLocalBudget(raw === '' ? 0 : parseFloat(raw));

      if (budgetDebounceRef.current) clearTimeout(budgetDebounceRef.current);
      budgetDebounceRef.current = setTimeout(() => {
          const parsed = parseFloat(raw);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 1e12) setBudget(parsed);
      }, 600);
  };

  useEffect(() => {
      return () => {
          if (budgetDebounceRef.current) clearTimeout(budgetDebounceRef.current);
      };
  }, []);

  const handleBackupToCloud = async () => {
    try {
      await signInWithGoogle();
      showNotification('success', 'Signed in with Google');
    } catch (e: any) {
      if (e.code === 'auth/popup-closed-by-user') return;
      const msg = e.code === 'auth/popup-blocked'
        ? 'Pop-up blocked by your browser. Please allow pop-ups and try again.'
        : e.code === 'auth/unauthorized-domain'
        ? 'This domain is not authorized for sign-in. Please contact support.'
        : 'Could not sign in. Make sure pop-ups are allowed, or try a different browser.';
      showNotification('error', msg);
    }
  };

  const handleCSV = () => {
    if (!expenses.length) {
      showNotification('error', 'No data to export');
      return;
    }
    try {
      generateCSVExport(expenses);
      showNotification('success', 'CSV file downloaded');
    } catch (error) {
      showNotification('error', 'Failed to export CSV');
    }
  };

  const handleExportBackup = () => {
    try {
      exportBackup(expenses, wallets, budget, customCategories, user?.id);
      showNotification('success', 'Backup exported successfully');
    } catch (error) {
      showNotification('error', 'Failed to export backup');
    }
  };

  const handleImportFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const preview = await previewBackup(file);
      setSelectedImportFile(file);
      setBackupPreview(preview);
    } catch (error: any) {
      showNotification('error', error.message || 'Failed to read backup file');
    }
    e.target.value = '';
  };

  const handleImportConfirmed = async () => {
    if (!selectedImportFile) return;
    try {
      const backup = await importBackup(selectedImportFile);
      const targetExpenses = mergeBackupData(expenses, wallets, customCategories, backup).expenses;
      const result = await storage.bulkImportExpenses(user!, targetExpenses);
      if (user?.type === 'guest') {
        setExpenses(targetExpenses);
      }
      showNotification('success', `Imported ${result.imported} expenses${result.skipped > 0 ? ` (${result.skipped} skipped)` : ''}`);
      setShowImportDialog(false);
      setBackupPreview(null);
      setSelectedImportFile(null);
      triggerHaptic();
    } catch (error: any) {
      showNotification('error', error.message || 'Failed to import backup');
    }
  };

  const handleClearData = () => {
    if (!activeWallet || !user) return;
    requestConfirm(
      'Clear All Data',
      `Clear all expenses in "${activeWallet.name}"? This cannot be undone.`,
      async () => {
        try {
          await storage.clearAllExpenses(user, activeWallet.id);
          setExpenses([]);
          showNotification('success', 'All expenses cleared');
        } catch (error: any) {
          showNotification('error', error.message || 'Failed to clear expenses');
        }
      },
      true
    );
  };

  const handleLeaveOrDelete = () => {
    if (!activeWallet || !user || user.type === 'guest') return;
    const isOwner = activeWallet.ownerId === user.id;
    if (isOwner) {
      requestConfirm(
        'Delete Wallet',
        `Permanently delete "${activeWallet.name}"? This cannot be undone.`,
        async () => {
          await deleteWallet(activeWallet.id);
        },
        true
      );
    } else {
      requestConfirm(
        'Leave Wallet',
        `Leave "${activeWallet.name}"? You can rejoin later with an invite code.`,
        async () => {
          await leaveWallet(activeWallet.id);
        },
        true
      );
    }
  };

  const handleDeleteAccount = () => {
    if (!user) return;
    requestConfirm(
      'Delete Account',
      user.type === 'user'
        ? 'Permanently delete your account and ALL your data (wallets, expenses, categories)? This cannot be undone.'
        : 'Clear all locally stored data from this device? This cannot be undone.',
      async () => {
        try {
          await deleteAccount();
          showNotification('success', 'Account deleted');
        } catch (error: any) {
          showNotification('error', error.message || 'Failed to delete account');
        }
      },
      true
    );
  };

  const isSharedWallet = activeWallet && activeWallet.id !== 'guest_wallet' && user?.type === 'user' && !activeWallet.isPersonal;

  return (
    <div
      className="min-h-full bg-slate-50 overflow-x-hidden"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
        paddingBottom: 'calc(9rem + env(safe-area-inset-bottom, 0px))'
      }}
    >
      <div className="pt-3 px-3 md:px-5 lg:px-6">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 mb-0.5 flex items-center gap-2">
              <Settings size={22} className="text-emerald-600" />
              Settings
            </h1>
            {activeWallet && (
              <p className="text-xs sm:text-sm text-slate-700">{activeWallet.name}</p>
            )}
          </div>
        </div>

        {/* Content — 2-col grid on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-6 space-y-4 lg:space-y-0">
          
          {/* Left Column */}
          <div className="space-y-4">
            {/* Account */}
            <div className="bg-white p-4 md:p-5 lg:p-6 rounded-xl border border-slate-300 space-y-3">
              <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">Account</h3>
              <div className="bg-white p-3.5 rounded-xl flex items-center gap-3 border border-slate-300 min-h-[60px]">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-white ${user?.type === 'guest' ? 'bg-amber-500' : 'bg-emerald-600'}`}>
                  <User size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{user?.name || 'Guest User'}</p>
                  <p className="text-[11px] text-slate-700 truncate">{user?.type === 'guest' ? 'Data stored on device' : user?.email}</p>
                </div>
                {user?.type === 'user' && (
                  <button onClick={() => { logout(); }} className="min-w-[44px] min-h-[44px] text-rose-600 bg-rose-50 rounded-xl font-medium active:scale-95 flex items-center justify-center hover:bg-rose-100 transition-colors focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2">
                    <LogOut size={20} />
                  </button>
                )}
              </div>
              {user?.type === 'guest' && (
                <button onClick={handleBackupToCloud} className="w-full min-h-[48px] bg-slate-900 text-white rounded-xl shadow-md text-sm font-semibold flex items-center justify-center gap-2 active:scale-95 hover:bg-slate-800 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
                  <Cloud size={20} />
                  <span>Back up Data to Cloud</span>
                </button>
              )}
            </div>

            {/* Invite Code */}
            {inviteCode && !activeWallet?.isPersonal && (
              <div className="bg-white p-4 md:p-5 lg:p-6 rounded-xl border border-slate-300 text-center">
                <p className="text-xs font-medium text-slate-700 mb-2">Invite Code</p>
                <div className="flex items-center justify-center gap-3 mb-1.5">
                  <p className="text-xl font-bold text-slate-900 tracking-widest">{inviteCode}</p>
                  <button 
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteCode);
                        showNotification('success', 'Invite code copied');
                      } catch (error) {
                        showNotification('error', 'Failed to copy');
                      }
                    }}
                    className="min-w-[44px] min-h-[44px] bg-emerald-600 text-white rounded-xl active:scale-95 flex items-center justify-center hover:bg-emerald-700 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                  >
                    <Share2 size={20} />
                  </button>
                </div>
                <p className="text-[11px] text-slate-700">Share this code to add members</p>
              </div>
            )}

            {/* Settings Section */}
            <div className="bg-white p-4 md:p-5 lg:p-6 rounded-xl border border-slate-300 space-y-3">
              <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">Settings</h3>
              
              <button onClick={() => setIsWalletSelectorOpen(true)} className="w-full min-h-[52px] bg-white border border-slate-300 rounded-xl px-4 flex items-center justify-between active:scale-[0.98] hover:bg-slate-50 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
                <div className="flex items-center gap-3">
                  <Wallet size={20} className="text-slate-700" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-900">Wallet</p>
                    <p className="text-[11px] text-slate-700">{activeWallet?.name || 'Personal'}</p>
                  </div>
                </div>
                <ChevronRight size={20} className="text-slate-400" />
              </button>

              <button onClick={() => { setIsCategoryManagerOpen(true); }} className="w-full min-h-[52px] bg-white border border-slate-300 rounded-xl px-4 flex items-center justify-between active:scale-[0.98] hover:bg-slate-50 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
                <div className="flex items-center gap-3">
                  <Tag size={20} className="text-slate-700" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-900">Manage Categories</p>
                    <p className="text-[11px] text-slate-700">Customize categories</p>
                  </div>
                </div>
                <ChevronRight size={20} className="text-slate-400" />
              </button>

              <div className="pt-1">
                <label className="text-xs font-medium text-slate-900 block mb-2">Monthly Budget Limit</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-700 text-sm font-bold">{getCurrencySymbol()}</span>
                    <input type="number" min={0} step="100" value={localBudget} onChange={handleBudgetChange} className="w-full bg-white border border-slate-300 rounded-xl min-h-[48px] pl-9 pr-3.5 font-bold text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* Export / Backup */}
            <div className="bg-white p-4 md:p-5 lg:p-6 rounded-xl border border-slate-300 space-y-3">
              <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">Download & Backup</h3>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={handleCSV} className="min-h-[48px] bg-white border border-slate-300 text-slate-700 rounded-xl font-medium active:scale-95 flex flex-col items-center justify-center gap-1 hover:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
                  <Download size={20} />
                  <span className="text-xs">Download Report</span>
                </button>
                <button onClick={handleExportBackup} className="min-h-[48px] bg-white border border-slate-300 text-slate-700 rounded-xl font-medium active:scale-95 flex flex-col items-center justify-center gap-1 hover:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
                  <Database size={20} />
                  <span className="text-xs">Save Data</span>
                </button>
                <button onClick={() => { setShowImportDialog(true); setBackupPreview(null); }} className="min-h-[48px] bg-white border border-slate-300 text-slate-700 rounded-xl font-medium active:scale-95 flex flex-col items-center justify-center gap-1 hover:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
                  <Upload size={20} />
                  <span className="text-xs">Restore Data</span>
                </button>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-white p-4 md:p-5 lg:p-6 rounded-xl border border-slate-300 space-y-3">
              <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">Data</h3>
              {activeWallet && (
                <button onClick={handleClearData} className="w-full min-h-[48px] bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium flex items-center justify-center gap-2 active:scale-95 hover:bg-rose-100 transition-colors focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2">
                  <Trash2 size={20} />
                  <span>Clear All Data</span>
                </button>
              )}
              {isSharedWallet && (
                <button onClick={handleLeaveOrDelete} className="w-full min-h-[48px] bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium flex items-center justify-center gap-2 active:scale-95 hover:bg-rose-100 transition-colors focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2">
                  <Trash2 size={20} />
                  <span>{activeWallet?.ownerId === user?.id ? 'Delete Wallet' : 'Leave Wallet'}</span>
                </button>
              )}
              <button onClick={handleDeleteAccount} className="w-full min-h-[48px] bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium flex items-center justify-center gap-2 active:scale-95 hover:bg-rose-100 transition-colors focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2">
                <Trash2 size={20} />
                <span>{user?.type === 'user' ? 'Delete Account' : 'Clear Local Data'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Version */}
        <div className="text-center py-6 space-y-2">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Kharcha Bachau v0.5-beta</p>
          <button
            onClick={() => { navigate('/privacy'); }}
            className="text-[11px] text-emerald-600 underline underline-offset-2 hover:text-emerald-700 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 rounded"
          >
            Privacy Policy
          </button>
        </div>

        {/* Import Dialog */}
        {showImportDialog && (
          <div className="fixed inset-0 z-import flex items-center justify-center p-4 bg-slate-900/60">
            <div className="bg-white rounded-xl p-5 max-w-sm w-full mx-4 animate-scale-in">
              <h3 className="text-base font-bold text-slate-900 mb-3">Restore Data</h3>
              
              {backupPreview ? (
                <>
                  <div className="space-y-1.5 mb-4 text-xs">
                    <p><span className="font-medium">Version:</span> {backupPreview.version}</p>
                    <p><span className="font-medium">Export:</span> {new Date(backupPreview.exportDate).toLocaleString()}</p>
                    <p><span className="font-medium">Expenses:</span> {backupPreview.expenseCount}</p>
                    <p><span className="font-medium">Wallets:</span> {backupPreview.walletCount}</p>
                    <p><span className="font-medium">Budget:</span> {getCurrencySymbol()} {backupPreview.budget.toLocaleString()}</p>
                    <p><span className="font-medium">Categories:</span> {backupPreview.customCategoryCount}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setShowImportDialog(false); setBackupPreview(null); setSelectedImportFile(null); }} className="flex-1 min-h-[44px] bg-slate-100 text-slate-700 rounded-xl font-medium active:scale-95 hover:bg-slate-200 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">Cancel</button>
                    <button onClick={handleImportConfirmed} className="flex-1 min-h-[44px] bg-emerald-600 text-white rounded-xl shadow-md font-semibold active:scale-95 hover:bg-emerald-700 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">Import</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-700 mb-4">Select a backup file to restore your data.</p>
                  <div className="flex gap-2">
                    <button onClick={() => { setShowImportDialog(false); setBackupPreview(null); setSelectedImportFile(null); }} className="flex-1 min-h-[44px] bg-slate-100 text-slate-700 rounded-xl font-medium active:scale-95 hover:bg-slate-200 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">Cancel</button>
                    <label className="flex-1 min-h-[44px] bg-emerald-600 text-white rounded-xl shadow-md font-semibold active:scale-95 text-center flex items-center justify-center cursor-pointer hover:bg-emerald-700 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
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

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      <WalletSelector isOpen={isWalletSelectorOpen} onClose={() => setIsWalletSelectorOpen(false)} />
      <CategoryManager isOpen={isCategoryManagerOpen} onClose={() => setIsCategoryManagerOpen(false)} />

      <ConfirmDialog
        isOpen={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        destructive={confirmDialog.destructive}
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        onConfirm={() => { setConfirmDialog(c => ({ ...c, open: false })); confirmDialog.onConfirm(); }}
        onCancel={() => setConfirmDialog(c => ({ ...c, open: false }))}
      />
    </div>
  );
};

export default React.memo(SettingsPage);