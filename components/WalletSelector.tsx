import React, { useState, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { TRANSLATIONS } from '../constants';
import { Wallet, Check, Plus, X, Users, Share2 } from 'lucide-react';
import * as storage from '../services/storageService';

interface WalletSelectorProps {
  isOpen: boolean;
  onClose: () => void;
}

const WalletSelector: React.FC<WalletSelectorProps> = ({ isOpen, onClose }) => {
  const { language, wallets, activeWallet, switchWallet, createNewWallet, joinWallet, showNotification } = useStore();
  const { user } = useAuth();
  const t = TRANSLATIONS[language];
  
  const [mode, setMode] = useState<'select' | 'create' | 'join'>('select');
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [inviteCodes, setInviteCodes] = useState<Record<string, string>>({});

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

  const handleCopyInviteCode = async (code: string, walletName: string) => {
    try {
      await navigator.clipboard.writeText(code);
      showNotification('success', 'Invite code copied to clipboard');
    } catch (error) {
      showNotification('error', 'Failed to copy invite code');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim()) return;
      
      setIsLoading(true);
      try {
        if (mode === 'create') {
            await createNewWallet(inputValue);
        } else if (mode === 'join') {
            await joinWallet(inputValue);
        }
        setInputValue('');
        setMode('select');
        onClose();
      } catch (e) {
          // Error handled by store notification
      } finally {
          setIsLoading(false);
      }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center pointer-events-none overflow-x-hidden">
       <div 
        className="absolute inset-0 bg-slate-900/60 pointer-events-auto"
        onClick={onClose}
      />
      
      <div 
        className="bg-white w-full sm:max-w-md rounded-t-xl sm:rounded-xl p-4 shadow-2xl pointer-events-auto relative max-w-full overflow-y-auto max-h-[90vh]"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))'
        }}
      >
          
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />

          <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-slate-900">
                  {mode === 'select' ? t.myWallets : mode === 'create' ? t.createWallet : 'Join Wallet'}
              </h2>
              {mode !== 'select' && (
                  <button onClick={() => setMode('select')} className="p-1.5 bg-slate-100 rounded-lg active:scale-95">
                      <X size={18} className="text-slate-600"/>
                  </button>
              )}
          </div>

          {mode === 'select' ? (
              <div className="space-y-2">
                  {wallets.map(wallet => {
                    const inviteCode = inviteCodes[wallet.id];
                    const isGroupWallet = !wallet.isPersonal && wallet.id !== 'guest_wallet';
                    
                    return (
                      <div key={wallet.id} className="space-y-1.5">
                        <button
                          onClick={() => {
                            switchWallet(wallet.id);
                            onClose();
                          }}
                          className={`w-full p-3 rounded-xl flex items-center justify-between border active:scale-95 ${activeWallet?.id === wallet.id ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200'}`}
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <div className={`p-2 rounded-lg ${activeWallet?.id === wallet.id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                              <Wallet size={18} />
                            </div>
                            <div className="text-left flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <p className={`text-sm font-medium truncate ${activeWallet?.id === wallet.id ? 'text-slate-900' : 'text-slate-700'}`}>{wallet.name}</p>
                                {wallet.isPersonal && (
                                  <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded flex-shrink-0">Personal</span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500">{wallet.members.length} member{wallet.members.length > 1 ? 's' : ''}</p>
                              {isGroupWallet && inviteCode && (
                                <div className="flex items-center gap-1.5 mt-1">
                                  <p className="text-xs text-indigo-600 font-medium">Code: {inviteCode}</p>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopyInviteCode(inviteCode, wallet.name);
                                    }}
                                    className="w-7 h-7 bg-indigo-100 text-indigo-600 rounded active:scale-95 flex items-center justify-center"
                                    title="Copy invite code"
                                  >
                                    <Share2 size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          {activeWallet?.id === wallet.id && <Check size={18} className="text-emerald-600 flex-shrink-0" />}
                        </button>
                      </div>
                    );
                  })}
                  
                  {user?.type === 'user' && (
                    <div className="grid grid-cols-2 gap-2 mt-4">
                        <button 
                            onClick={() => setMode('create')}
                            className="p-3 border border-dashed border-slate-300 rounded-xl text-slate-600 font-medium flex flex-col items-center justify-center gap-2 active:scale-95"
                        >
                            <Plus size={18} />
                            <span className="text-sm">{t.create}</span>
                        </button>
                        <button 
                            onClick={() => setMode('join')}
                            className="p-3 border border-dashed border-slate-300 rounded-xl text-slate-600 font-medium flex flex-col items-center justify-center gap-2 active:scale-95"
                        >
                            <Users size={18} />
                            <span className="text-sm">Join</span>
                        </button>
                    </div>
                  )}
              </div>
          ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                      <label className="text-sm font-medium text-slate-700 block mb-2">
                          {mode === 'create' ? t.walletName : 'Invite Code'}
                      </label>
                      <input 
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={mode === 'create' ? "e.g. Home Expenses" : "e.g. HK-1234"}
                        autoFocus
                        className="w-full bg-white border border-slate-200 p-3 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                  </div>
                  <button 
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 bg-emerald-600 text-white rounded-xl text-sm font-medium active:scale-95 disabled:opacity-50"
                  >
                      {isLoading ? 'Processing...' : (mode === 'create' ? t.create : 'Join Wallet')}
                  </button>
              </form>
          )}
      </div>
    </div>
  );
};

export default React.memo(WalletSelector);

