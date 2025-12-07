
import React, { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { TRANSLATIONS } from '../constants';
import { getCurrencySymbol } from '../utils/currencyFormatter';
import { X, LogOut, User, Cloud, Wallet, Download, Globe, ChevronRight, Share2, FileText, Trash2, Tag } from 'lucide-react';
import AuthModal from './AuthModal';
import WalletSelector from './WalletSelector';
import LanguagePicker from './LanguagePicker';
import CategoryManager from './CategoryManager';
import * as storage from '../services/storageService';
// Lazy load PDF service to reduce initial bundle size
const generatePDFReport = async (expenses: any, monthlyStats: any, title: string) => {
  const { generatePDFReport: generate } = await import('../services/pdfService');
  return generate(expenses, monthlyStats, title);
};
import { generateCSVExport } from '../services/csvService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin?: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onLogin }) => {
  const { language, setLanguage, budget, setBudget, expenses, activeWallet, monthlyStats, leaveWallet, deleteWallet, showNotification, setExpenses, triggerHaptic } = useStore();
  const { user, logout } = useAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isWalletSelectorOpen, setIsWalletSelectorOpen] = useState(false);
  const [isLanguagePickerOpen, setIsLanguagePickerOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  
  const t = TRANSLATIONS[language];

  useEffect(() => {
    // Only show invite code for shared wallets (not personal, not guest)
    if (activeWallet && activeWallet.id !== 'guest_wallet' && !activeWallet.isPersonal) {
        storage.getOrGenerateInviteCode(activeWallet.id).then(setInviteCode);
    } else {
        setInviteCode(null);
    }
  }, [activeWallet]);

  if (!isOpen) return null;

  const handleBudgetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val)) setBudget(val);
  };

  const handlePDF = async () => {
    if (!expenses.length) {
      showNotification('error', 'No data to export');
      return;
    }
    try {
      await generatePDFReport(expenses, monthlyStats, 'All Time Report');
      showNotification('success', 'PDF report generated');
    } catch (error) {
      showNotification('error', 'Failed to generate PDF report');
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

  const openAuth = () => {
      if (onLogin) onLogin();
      else setIsAuthOpen(true);
  }

  const handleLeaveOrDelete = async () => {
    if (!activeWallet || !user || user.type === 'guest') return;
    const isOwner = activeWallet.ownerId === user.id;

    if (isOwner) {
        if (confirm(`Are you sure you want to PERMANENTLY DELETE "${activeWallet.name}"? This cannot be undone.`)) {
            await deleteWallet(activeWallet.id);
            onClose();
        }
    } else {
        if (confirm(`Are you sure you want to leave "${activeWallet.name}"?`)) {
            await leaveWallet(activeWallet.id);
            onClose();
        }
    }
  };

  const handleClearData = async () => {
    if (!activeWallet || !user) return;
    if (!confirm(`Are you sure you want to clear all expenses in "${activeWallet.name}"? This cannot be undone.`)) {
        return;
    }
    
    try {
        await storage.clearAllExpenses(user, activeWallet.id);
        setExpenses([]);
        showNotification('success', 'All expenses cleared');
    } catch (error: any) {
        showNotification('error', error.message || 'Failed to clear expenses');
    }
  };

  const handleClearDataAndWallet = async () => {
    if (!activeWallet || !user || user.type === 'guest') return;
    const isOwner = activeWallet.ownerId === user.id;
    
    if (!isOwner) {
        showNotification('error', 'Only the wallet owner can delete the wallet');
        return;
    }
    
    if (!confirm(`Are you sure you want to PERMANENTLY DELETE "${activeWallet.name}" and all its data? This cannot be undone.`)) {
        return;
    }
    
    try {
        await deleteWallet(activeWallet.id);
        showNotification('success', 'Wallet and all data deleted');
        onClose();
    } catch (error: any) {
        showNotification('error', error.message || 'Failed to delete wallet');
    }
  };

  const isSharedWallet = activeWallet && activeWallet.id !== 'guest_wallet' && user?.type === 'user' && !activeWallet.isPersonal;
  // Don't allow leaving if it's the only wallet or a personal one we auto-created, usually we check if members.length > 1 or just allow delete
  // For safety, let's just show it for any non-guest wallet
  
  return (
    <>
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-x-hidden">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
      
      <div 
        className="relative bg-white w-full sm:max-w-md rounded-xl p-4 shadow-2xl flex flex-col max-w-full"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxHeight: 'calc(90vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
          paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))'
        }}
      >
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">{t.settings}</h2>
          <button onClick={onClose} className="p-1.5 bg-slate-100 rounded-lg active:scale-95">
            <X size={18} className="text-slate-600" />
          </button>
        </div>

        <div className="overflow-y-auto no-scrollbar space-y-4 pb-2">
            
            {/* Profile Section */}
            <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">Account</h3>
                <div className="bg-white p-3 rounded-xl flex items-center gap-3 border border-slate-200">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-white ${user?.type === 'guest' ? 'bg-amber-500' : 'bg-emerald-600'}`}>
                        <User size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-base font-bold text-slate-900 truncate">{user?.name || 'Guest User'}</p>
                        <p className="text-xs text-slate-600 truncate">{user?.type === 'guest' ? 'Data stored on device' : user?.email}</p>
                    </div>
                    {user?.type === 'user' && (
                        <button onClick={() => { logout(); onClose(); }} className="px-3 py-2 text-rose-600 bg-rose-50 rounded-lg font-medium active:scale-95">
                            <LogOut size={18} />
                        </button>
                    )}
                </div>

                {/* Guest Login CTA */}
                {user?.type === 'guest' && (
                    <button onClick={openAuth} className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 active:scale-95">
                        <Cloud size={18} />
                        <span>Back up Data to Cloud</span>
                    </button>
                )}
            </div>

            {/* Invite Members - Only for shared wallets */}
            {inviteCode && !activeWallet?.isPersonal && (
                <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                    <p className="text-sm font-medium text-slate-700 mb-2">Invite Code</p>
                    <div className="flex items-center justify-center gap-3 mb-2">
                        <p className="text-2xl font-bold text-slate-900 tracking-widest">{inviteCode}</p>
                        <button 
                            onClick={async () => {
                                try {
                                    await navigator.clipboard.writeText(inviteCode);
                                    showNotification('success', 'Invite code copied');
                                } catch (error) {
                                    showNotification('error', 'Failed to copy');
                                }
                            }}
                            className="w-10 h-10 bg-emerald-600 text-white rounded-lg active:scale-95 flex items-center justify-center"
                        >
                            <Share2 size={18} />
                        </button>
                    </div>
                    <p className="text-xs text-slate-600">Share this code to add members</p>
                </div>
            )}

            {/* Settings Section */}
            <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">Settings</h3>
                
                {/* Wallet */}
                <button onClick={() => setIsWalletSelectorOpen(true)} className="w-full bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between active:scale-95">
                    <div className="flex items-center gap-3">
                        <Wallet size={18} className="text-slate-600" />
                        <div className="text-left">
                            <p className="text-sm font-medium text-slate-900">{t.wallet}</p>
                            <p className="text-xs text-slate-500">{activeWallet?.name || 'Personal'}</p>
                        </div>
                    </div>
                    <ChevronRight size={18} className="text-slate-400" />
                </button>

                {/* Language */}
                <button onClick={() => { triggerHaptic(); setIsLanguagePickerOpen(true); }} className="w-full bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between active:scale-95">
                    <div className="flex items-center gap-3">
                        <Globe size={18} className="text-slate-600" />
                        <div className="text-left">
                            <p className="text-sm font-medium text-slate-900">{language === 'en' ? 'Language' : 'भाषा'}</p>
                            <p className="text-xs text-slate-500">{language === 'en' ? 'English' : 'नेपाली'}</p>
                        </div>
                    </div>
                    <ChevronRight size={18} className="text-slate-400" />
                </button>

                {/* Categories */}
                <button onClick={() => { triggerHaptic(); setIsCategoryManagerOpen(true); }} className="w-full bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between active:scale-95">
                    <div className="flex items-center gap-3">
                        <Tag size={18} className="text-slate-600" />
                        <div className="text-left">
                            <p className="text-sm font-medium text-slate-900">{t.manageCategories}</p>
                            <p className="text-xs text-slate-500">{language === 'en' ? 'Customize categories' : 'वर्गहरू अनुकूलन गर्नुहोस्'}</p>
                        </div>
                    </div>
                    <ChevronRight size={18} className="text-slate-400" />
                </button>

                {/* Budget */}
                <div>
                     <label className="text-sm font-medium text-slate-900 block mb-2">{t.budgetLimit}</label>
                     <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-base font-bold">{getCurrencySymbol()}</span>
                        <input type="number" value={budget} onChange={handleBudgetChange} className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-10 pr-3 font-bold text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                     </div>
                </div>
            </div>

            {/* Data Export Section */}
            <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">Export Data</h3>
                <div className="grid grid-cols-2 gap-2">
                     <button onClick={handlePDF} className="bg-white border border-slate-200 text-slate-700 rounded-xl py-3 font-medium active:scale-95 flex flex-col items-center justify-center gap-1.5">
                        <FileText size={18} />
                        <span className="text-sm">PDF</span>
                     </button>
                     <button onClick={handleCSV} className="bg-white border border-slate-200 text-slate-700 rounded-xl py-3 font-medium active:scale-95 flex flex-col items-center justify-center gap-1.5">
                        <Download size={18} />
                        <span className="text-sm">CSV</span>
                     </button>
                </div>
            </div>

            {/* Danger Zone */}
            <div className="space-y-3">
                <h3 className="text-sm font-semibold text-rose-600">Danger Zone</h3>
                
                {/* Clear All Data - Combined action */}
                {activeWallet && (
                    <div className="space-y-2">
                        <button 
                            onClick={handleClearData}
                            className="w-full bg-rose-50 border border-rose-200 text-rose-700 rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 active:scale-95"
                        >
                            <Trash2 size={18} />
                            <span>Clear All Data</span>
                        </button>
                        <p className="text-xs text-rose-600 text-center">
                            Deletes all expenses in this wallet. Wallet will remain.
                        </p>
                    </div>
                )}
                
                {/* Delete/Leave Wallet */}
                {isSharedWallet && (
                    <div className="space-y-2">
                        <button 
                            onClick={handleLeaveOrDelete}
                            className="w-full bg-rose-600 border border-rose-700 text-white rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 active:scale-95"
                        >
                            <Trash2 size={18} />
                            <span>{activeWallet?.ownerId === user?.id ? 'Delete Wallet' : 'Leave Wallet'}</span>
                        </button>
                        <p className="text-xs text-rose-600 text-center">
                            {activeWallet?.ownerId === user?.id 
                                ? "Permanently deletes this wallet and all data." 
                                : "You will lose access to this wallet."}
                        </p>
                    </div>
                )}
            </div>
        </div>
        
        <div className="mt-4 text-center border-t border-slate-100 pt-3 flex-shrink-0">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Kharcha Bachau v0.4-beta 🇳🇵</p>
        </div>
      </div>
      
      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      <WalletSelector isOpen={isWalletSelectorOpen} onClose={() => setIsWalletSelectorOpen(false)} />
      <LanguagePicker isOpen={isLanguagePickerOpen} onClose={() => setIsLanguagePickerOpen(false)} />
      <CategoryManager isOpen={isCategoryManagerOpen} onClose={() => setIsCategoryManagerOpen(false)} />
    </div>
    </>
  );
};

export default React.memo(SettingsModal);
