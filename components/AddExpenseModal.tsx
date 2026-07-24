import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Category, SplitDetails } from '../types';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { getCurrencySymbol } from '../utils/currencyFormatter';
import { getCategoryIcon, parseCategoryColor } from '../utils/categoryIcons';
import { X, Delete, Check, Users } from 'lucide-react';
import { format } from 'date-fns';

interface AddExpenseModalProps {
  category: Category;
  isOpen: boolean;
  onClose: () => void;
}

const AddExpenseModal: React.FC<AddExpenseModalProps> = ({ category, isOpen, onClose }) => {
  const { addExpense, activeWallet, expenses } = useStore();
  const { user } = useAuth();
  const [amount, setAmount] = useState('0');
  const [amountError, setAmountError] = useState(false);
  const [note, setNote] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [paidBy, setPaidBy] = useState<string>('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const modalRef = React.useRef<HTMLDivElement>(null);
  
  const currencySymbol = getCurrencySymbol();
  
  // Check if this is a group wallet
  const isGroupWallet = useMemo(() => {
    return activeWallet && !activeWallet.isPersonal && activeWallet.members.length > 1;
  }, [activeWallet]);
  
  // Get member names from expenses (fallback to user ID if not found)
  const getMemberName = useCallback((userId: string): string => {
    if (userId === user?.id) return user.name;
    const expense = expenses.find(e => e.createdBy.uid === userId);
    if (expense) return expense.createdBy.name;
    return `Member ${userId.substring(0, 4)}`;
  }, [user, expenses]);
  
  // Available members for splitting
  const availableMembers = useMemo(() => {
    if (!activeWallet || !isGroupWallet) return [];
    return activeWallet.members.map(memberId => ({
      id: memberId,
      name: getMemberName(memberId)
    }));
  }, [activeWallet, isGroupWallet, getMemberName]);
  
  // Initialize paidBy and selectedMembers when split mode is enabled
  useEffect(() => {
    if (isSplitMode && availableMembers.length > 0) {
      if (!paidBy && user) {
        setPaidBy(user.id);
      }
      if (selectedMembers.length === 0) {
        setSelectedMembers(availableMembers.map(m => m.id));
      }
    }
  }, [isSplitMode, availableMembers, paidBy, selectedMembers.length, user]);

  // Clear the amount error whenever the modal (re)opens
  useEffect(() => {
    if (isOpen) setAmountError(false);
  }, [isOpen]);

  // Keyboard avoidance — adjust modal height when virtual keyboard opens
  useEffect(() => {
    if (!isOpen) return;
    
    const handleViewportResize = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      const windowHeight = window.innerHeight;
      const viewportHeight = vv.height;
      const difference = windowHeight - viewportHeight;
      setKeyboardHeight(difference > 100 ? difference : 0);
    };

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', handleViewportResize);
      handleViewportResize();
    }
    
    return () => {
      if (vv) vv.removeEventListener('resize', handleViewportResize);
      setKeyboardHeight(0);
    };
  }, [isOpen]);

  const hasUnsavedData = useMemo(() => {
    return amount !== '0' || note.trim().length > 0;
  }, [amount, note]);

  const resetForm = useCallback(() => {
    setAmount('0');
    setAmountError(false);
    setNote('');
    setSelectedDate(new Date());
    setIsSplitMode(false);
    setSelectedMembers([]);
    setPaidBy('');
  }, []);

  const safeClose = useCallback(() => {
    if (hasUnsavedData) {
      if (!window.confirm('Discard this expense? Changes will be lost.')) return;
    }
    onClose();
    resetForm();
  }, [hasUnsavedData, onClose, resetForm]);

  const submitAndClose = useCallback(() => {
    onClose();
    resetForm();
  }, [onClose, resetForm]);

  // Physical keyboard support for the on-screen numeric keypad.
  // Stored in a ref so the listener always sees fresh state closures.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t) {
      const tag = t.tagName;
      const editable =
        (tag === 'INPUT' && !(t as HTMLInputElement).readOnly) ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        t.isContentEditable;
      if (editable) return;
    }
    if (e.key >= '0' && e.key <= '9') {
      handleNumClick(e.key);
    } else if (e.key === '.') {
      handleNumClick('.');
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      handleDelete();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else {
      return;
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  useFocusTrap(modalRef, isOpen);

  if (!isOpen) return null;

  const handleNumClick = (num: string) => {
    setAmountError(false);
    if (num === '.') {
      if (amount.includes('.')) return;
      setAmount(prev => prev + '.');
      return;
    }
    // Cap at 2 decimal places
    const dotIdx = amount.indexOf('.');
    if (dotIdx !== -1 && amount.length - dotIdx - 1 >= 2) return;
    // Cap total digit count (excludes the decimal point)
    if (amount.replace('.', '').length >= 9) return;
    if (amount === '0') {
      setAmount(num);
    } else {
      setAmount(prev => prev + num);
    }
  };

  const handleDelete = () => {
    if (amount.length === 1) {
      setAmount('0');
    } else {
      setAmount(prev => prev.slice(0, -1));
    }
  };

  // Calculate split amounts
  const calculateSplitAmounts = useMemo(() => {
    const total = parseFloat(amount) || 0;
    if (!isSplitMode || selectedMembers.length === 0 || total === 0) return null;
    
    const participants: Array<{
      userId: string;
      userName: string;
      amount: number;
    }> = [];
    
    const perPerson = total / selectedMembers.length;
    selectedMembers.forEach(memberId => {
      participants.push({
        userId: memberId,
        userName: getMemberName(memberId),
        amount: perPerson
      });
    });
    
    return participants;
  }, [amount, isSplitMode, selectedMembers, getMemberName]);
  
  const handleSubmit = async () => {
    const val = parseFloat(amount);
    if (val > 0) {
      let splitDetails: SplitDetails | undefined;
      
      if (isSplitMode && calculateSplitAmounts && paidBy) {
        splitDetails = {
          splitType: 'equal',
          participants: calculateSplitAmounts,
          paidBy
        };
      }

      try {
        await addExpense(val, category, note, selectedDate, splitDetails);
        submitAndClose();
      } catch {
        // Error notification is shown by StoreContext
      }
    } else {
      setAmountError(true);
    }
  };
  
  // Theme Variables
  const themeText = 'text-emerald-600';
  const themeBg = 'bg-emerald-600';

  return (
    <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center pointer-events-none overflow-x-hidden p-2 md:p-4 lg:p-6">
      <div 
        className="absolute inset-0 bg-slate-900/60 pointer-events-auto"
        onClick={safeClose}
      />
      
      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-expense-title"
        className="bg-white w-full sm:max-w-md md:max-w-lg lg:max-w-xl rounded-t-xl sm:rounded-xl p-4 sm:p-5 lg:p-6 shadow-2xl pointer-events-auto flex flex-col overflow-hidden relative max-w-full animate-slide-up-bottom sm:animate-scale-in"
        style={{
          height: keyboardHeight > 0
            ? `calc(100dvh - ${keyboardHeight}px - env(safe-area-inset-top, 0px))`
            : 'auto',
          maxHeight: keyboardHeight > 0 ? `calc(100dvh - ${keyboardHeight}px)` : '92vh',
          paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
          paddingBottom: keyboardHeight > 0 ? '0.5rem' : 'max(1rem, env(safe-area-inset-bottom, 0px))'
        }}
      >
        
        {/* Drag Handle */}
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />

        {/* Header / Category Info */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${parseCategoryColor(category.color).bg} border-slate-300`}>
              {(() => {
                const Icon = getCategoryIcon(category.id);
                const { text } = parseCategoryColor(category.color);
                return Icon ? <Icon size={24} className={text} /> : <span className={text}>{category.emoji}</span>;
              })()}
            </div>
            <div>
              <p className="text-xs font-medium mb-0.5 text-emerald-600">
                  {'Add Expense'}
              </p>
              <h2 id="add-expense-title" className="text-lg font-bold text-slate-900">
                {category.name}
              </h2>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              value={format(selectedDate, 'yyyy-MM-dd')}
              onChange={(e) => setSelectedDate(new Date(e.target.value))}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button 
                onClick={safeClose} 
                className="w-9 h-9 bg-white border border-slate-300 rounded-lg active:scale-95 flex items-center justify-center hover:bg-slate-200 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
                <X size={18} className="text-slate-700" />
            </button>
          </div>
        </div>

        {/* Display Area */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
         <div className="flex flex-col">
            <div className="relative mb-1.5">
                <span className="text-lg font-medium absolute left-3 top-1/2 -translate-y-1/2 text-rose-400">{currencySymbol}</span>
                <input 
                    readOnly
                    value={amount}
                    className={`w-full text-right text-3xl font-bold bg-white border rounded-xl p-3 pr-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${amountError ? 'border-rose-400' : 'border-slate-300'} ${themeText}`}
                />
            </div>
            {amountError && (
              <p className="text-xs text-rose-600 mb-2">Enter an amount greater than 0</p>
            )}
            
            <div className="mb-3">
                 <input 
                    type="text" 
                    placeholder={"Note..."}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full bg-white border border-slate-300 p-2.5 rounded-xl text-sm font-medium text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500"
                />
            </div>
            
            {/* Split Expense Section - Only for group wallets */}
            {isGroupWallet && (
              <div className="mb-3">
                <button
                  onClick={() => {
                    setIsSplitMode(!isSplitMode);
                  }}
                  className={`w-full p-3 rounded-xl border flex items-center justify-between active:scale-95 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isSplitMode ? 'bg-emerald-50 border-emerald-300 hover:bg-emerald-100' : 'bg-white border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Users size={18} className={isSplitMode ? 'text-emerald-600' : 'text-slate-700'} />
                    <span className={`text-sm font-medium ${isSplitMode ? 'text-emerald-700' : 'text-slate-700'}`}>
                      {'Split Expense'}
                    </span>
                  </div>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                    isSplitMode ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300'
                  }`}>
                    {isSplitMode && <Check size={12} className="text-white" strokeWidth={3} />}
                  </div>
                </button>
                
                {isSplitMode && (
                  <div className="mt-3 space-y-3 p-3 bg-slate-50 rounded-xl">
                    {/* Who Paid */}
                    <div>
                      <label className="text-xs font-medium text-slate-700 block mb-2">{'Who paid?'}</label>
                      <select
                        value={paidBy}
                        onChange={(e) => setPaidBy(e.target.value)}
                        className="w-full bg-white border border-slate-300 p-2 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-500"
                      >
                        {availableMembers.map(member => (
                          <option key={member.id} value={member.id}>{member.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    {/* Member Selection */}
                    <div>
                      <label className="text-xs font-medium text-slate-700 block mb-2">{'Select members'}</label>
                      <div className="space-y-2">
                        {availableMembers.map(member => {
                          const isSelected = selectedMembers.includes(member.id);
                          return (
                            <div key={member.id} className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedMembers(prev => prev.filter(id => id !== member.id));
                                  } else {
                                    setSelectedMembers(prev => [...prev, member.id]);
                                  }
                                }}
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                                  isSelected ? 'bg-emerald-600 border-emerald-600 hover:bg-emerald-700' : 'border-slate-300 hover:bg-slate-200'
                                }`}
                              >
                                {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                              </button>
                              <span className="text-sm font-medium text-slate-700 flex-1">{member.name}</span>
                              {isSelected && (
                                <span className="text-xs text-slate-700">
                                  {currencySymbol}{((parseFloat(amount) || 0) / selectedMembers.length).toFixed(2)} {'per person'}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    
                    {/* Split Preview */}
                    {calculateSplitAmounts && (
                      <div className="pt-2 border-t border-slate-300">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-700">{'Total Split'}:</span>
                          <span className="font-semibold text-slate-900">
                            {currencySymbol}{calculateSplitAmounts.reduce((sum: number, p) => sum + p.amount, 0).toFixed(2)}
                          </span>
                        </div>
                        {Math.abs(calculateSplitAmounts.reduce((sum: number, p) => sum + p.amount, 0) - (parseFloat(amount) || 0)) > 0.01 && (
                          <div className="text-xs text-rose-600 mt-1">
                            {'Remaining'}: {currencySymbol}{((parseFloat(amount) || 0) - calculateSplitAmounts.reduce((sum: number, p) => sum + p.amount, 0)).toFixed(2)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
        </div>
        </div>

        {/* Simplified Keypad - Larger buttons - Responsive */}
        <div className="grid grid-cols-4 gap-2 md:gap-3 lg:gap-4">
            {[1, 2, 3].map(num => (
                <KeypadButton key={num} onClick={() => handleNumClick(num.toString())}>{num}</KeypadButton>
            ))}
            <button 
                onClick={handleDelete}
                className="h-12 rounded-lg text-base font-bold text-slate-700 bg-white border border-slate-300 active:scale-95 flex items-center justify-center hover:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
                <Delete size={20} />
            </button>

            {[4, 5, 6].map(num => (
                <KeypadButton key={num} onClick={() => handleNumClick(num.toString())}>{num}</KeypadButton>
            ))}
            <div className="row-span-2">
                 <button 
                    onClick={handleSubmit}
                    className={`w-full h-full text-white rounded-lg font-bold text-lg active:scale-95 flex items-center justify-center hover:bg-emerald-700 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${themeBg}`}
                >
                    <Check size={24} strokeWidth={3} />
                </button>
            </div>

            {[7, 8, 9].map(num => (
                <KeypadButton key={num} onClick={() => handleNumClick(num.toString())}>{num}</KeypadButton>
            ))}

            <KeypadButton onClick={() => handleNumClick('.')}>.</KeypadButton>
            <KeypadButton onClick={() => handleNumClick('0')}>0</KeypadButton>
            <KeypadButton onClick={() => handleNumClick('00')}>00</KeypadButton>
        </div>
      </div>
    </div>
  );
};

const KeypadButton: React.FC<{ children: React.ReactNode; onClick: () => void }> = ({ children, onClick }) => (
    <button 
        onClick={onClick}
        className="h-12 md:h-14 lg:h-16 rounded-lg text-lg md:text-xl lg:text-2xl font-bold text-slate-800 bg-white border border-slate-300 active:scale-95 hover:bg-slate-50 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
        {children}
    </button>
);

export default React.memo(AddExpenseModal);