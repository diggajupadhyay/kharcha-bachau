import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Wallet, Check, Plus, X, Users, Share2 } from 'lucide-react';
import * as storage from '../services/storageService';

interface WalletSelectorProps {
  isOpen: boolean;
  onClose: () => void;
}

const WalletSelector: React.FC<WalletSelectorProps> = ({ isOpen, onClose }) => {
  const { wallets, activeWallet, switchWallet, createNewWallet, joinWallet, showNotification } = useStore();
  const { user } = useAuth();
  
  const [mode, setMode] = useState<'select' | 'create' | 'join'>('select');
  const [inputValue, setInputValue] = useState('');
  const [inputError, setInputError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [inviteCodes, setInviteCodes] = useState<Record<string, string>>({});
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen);

  // Load invite codes for group wallets when modal opens
  useEffect(() => {
    if (!isOpen || user?.type === 'guest') return;
    
    const loadInviteCodes = async () => {
      const codes: Record<string, string> = {};
      for (const wallet of wallets) {
        if (!wallet.isPersonal && wallet.id !== 'guest_wallet') {
          try {
            const code = await storage.getOrGenerateInviteCode(wallet.id);
            codes[wallet.id] = code;
          } catch (error) {
            // Silently fail - invite code will not be shown
          }
        }
      }
      setInviteCodes(codes);
    };
    
    loadInviteCodes();
  }, [isOpen, wallets, user]);

  if (!isOpen) return null;

  const handleCopyInviteCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      showNotification('success', 'Invite code copied to clipboard');
    } catch (error) {
      showNotification('error', 'Failed to copy invite code');
    }
  };

  const validateInput = (value: string): string => {
      const trimmed = value.trim();
      if (mode === 'create') {
          if (trimmed.length < 2) return 'Wallet name must be at least 2 characters';
          if (trimmed.length > 30) return 'Wallet name must be 30 characters or less';
      } else if (mode === 'join') {
          if (trimmed.length < 4) return 'Enter a valid invite code';
      }
      return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      const validationError = validateInput(inputValue);
      if (validationError) {
          setInputError(validationError);
          return;
      }

      setIsLoading(true);
      try {
        if (mode === 'create') {
            await createNewWallet(inputValue.trim());
        } else if (mode === 'join') {
            await joinWallet(inputValue.trim());
        }
        setInputValue('');
        setInputError('');
        setMode('select');
        onClose();
      } catch (e) {
          // Error handled by store notification
      } finally {
          setIsLoading(false);
      }
  };

  return (
    <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center pointer-events-none overflow-x-hidden p-0 sm:p-2 md:p-4 lg:p-6">
       <div className="absolute inset-0 bg-slate-900/60 pointer-events-auto" onClick={onClose} />
      
      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-selector-title"
        className="bg-white w-full sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl rounded-t-xl sm:rounded-xl shadow-2xl pointer-events-auto relative max-w-full overflow-y-auto max-h-[90vh] sm:max-h-[80vh] animate-slide-up-bottom sm:animate-scale-in"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))'
        }}
      >
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3 sm:hidden" />

          <div className="px-4 sm:px-6">
          <div className="flex justify-between items-center mb-4">
              <h2 id="wallet-selector-title" className="text-base sm:text-lg font-bold text-slate-900">
                  {mode === 'select' ? 'My Wallets' : mode === 'create' ? 'Create New Wallet' : 'Join Wallet'}
              </h2>
              {mode !== 'select' && (
                  <button onClick={() => { setMode('select'); setInputValue(''); setInputError(''); }} className="min-w-[44px] min-h-[44px] bg-slate-100 rounded-xl active:scale-95 hover:bg-slate-200 transition-colors flex items-center justify-center focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
                      <X size={20} className="text-slate-700"/>
                  </button>
              )}
          </div>

          {mode === 'select' ? (
              <div className="space-y-2 pb-4">
                  {wallets.map(wallet => {
                    const inviteCode = inviteCodes[wallet.id];
                    const isGroupWallet = !wallet.isPersonal && wallet.id !== 'guest_wallet';
                    
                    return (
                      <div key={wallet.id}>
                        <button
                          onClick={() => { switchWallet(wallet.id); onClose(); }}
                          className={`w-full p-3.5 rounded-xl flex items-center justify-between border active:scale-[0.98] min-h-[56px] hover:bg-slate-50 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${activeWallet?.id === wallet.id ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-300'}`}
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={`min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center ${activeWallet?.id === wallet.id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                              <Wallet size={20} />
                            </div>
                            <div className="text-left flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                <p className={`text-sm font-medium truncate ${activeWallet?.id === wallet.id ? 'text-slate-900' : 'text-slate-700'}`}>{wallet.name}</p>
                                {wallet.isPersonal && (
                                  <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Personal</span>
                                )}
                              </div>
                              <p className="text-xs text-slate-700">{wallet.members.length} member{wallet.members.length > 1 ? 's' : ''}</p>
                              {isGroupWallet && inviteCode && (
                                <div className="flex items-center gap-1.5 mt-1">
                                  <p className="text-xs text-indigo-600 font-medium">Code: {inviteCode}</p>
                                   <button onClick={(e) => { e.stopPropagation(); handleCopyInviteCode(inviteCode); }}
                                    className="min-w-[32px] min-h-[32px] bg-indigo-100 text-indigo-600 rounded-lg active:scale-95 flex items-center justify-center hover:bg-indigo-200 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2" title="Copy invite code">
                                    <Share2 size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          {activeWallet?.id === wallet.id && <Check size={20} className="text-emerald-600 flex-shrink-0" />}
                        </button>
                      </div>
                    );
                  })}
                  
                  {user?.type === 'user' && (
                    <div className="grid grid-cols-2 gap-2 mt-4">
                        <button onClick={() => setMode('create')} className="min-h-[52px] border-2 border-dashed border-slate-300 rounded-xl text-slate-700 font-medium flex flex-col items-center justify-center gap-1 active:scale-95 hover:border-emerald-300 hover:text-emerald-600 transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
                            <Plus size={20} />
                            <span className="text-xs">{'Create'}</span>
                        </button>
                        <button onClick={() => setMode('join')} className="min-h-[52px] border-2 border-dashed border-slate-300 rounded-xl text-slate-700 font-medium flex flex-col items-center justify-center gap-1 active:scale-95 hover:border-emerald-300 hover:text-emerald-600 transition-all focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
                            <Users size={20} />
                            <span className="text-xs">Join</span>
                        </button>
                    </div>
                  )}
              </div>
          ) : (
              <form onSubmit={handleSubmit} className="space-y-4 pb-4">
                  <div>
                      <label className="text-xs font-medium text-slate-700 block mb-2">
                          {'Join a Shared Wallet'}
                      </label>
                      <p className="text-xs text-slate-700 mb-2">Ask your family member for their wallet code</p>
                      <input type="text" value={inputValue} onChange={(e) => { setInputValue(e.target.value); if (inputError) setInputError(''); }}
                        maxLength={mode === 'create' ? 30 : 20}
                        aria-invalid={!!inputError}
                        placeholder={"e.g. HK-1234"} autoFocus
                        className={`w-full bg-white border min-h-[48px] px-3.5 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 ${inputError ? 'border-rose-400 focus:ring-rose-500' : 'border-slate-300 focus:ring-emerald-500'}`} />
                      {inputError && <p className="text-xs text-rose-600 mt-1.5">{inputError}</p>}
                  </div>
                  <button type="submit" disabled={isLoading || !inputValue.trim()} className="w-full min-h-[48px] bg-emerald-600 text-white rounded-xl shadow-md text-sm font-semibold active:scale-95 disabled:opacity-50 hover:bg-emerald-700 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
                      {isLoading ? 'Processing...' : (mode === 'create' ? 'Create' : 'Join Wallet')}
                  </button>
              </form>
          )}
          </div>
      </div>
    </div>
  );
};

export default React.memo(WalletSelector);

