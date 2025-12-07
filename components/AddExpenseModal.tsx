import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Category, SplitDetails } from '../types';
import { useStore } from '../context/StoreContext';
import { useAuth } from '../context/AuthContext';
import { TRANSLATIONS } from '../constants';
import { getCurrencySymbol } from '../utils/currencyFormatter';
import { X, Delete, Check, Calendar as CalendarIcon, ChevronLeft, Users } from 'lucide-react';
import { format, subDays } from 'date-fns';

interface AddExpenseModalProps {
  category: Category;
  isOpen: boolean;
  onClose: () => void;
}

const AddExpenseModal: React.FC<AddExpenseModalProps> = ({ category, isOpen, onClose }) => {
  const { language, addExpense, triggerHaptic, activeWallet, expenses } = useStore();
  const { user } = useAuth();
  const [amount, setAmount] = useState('0');
  const [note, setNote] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splitType, setSplitType] = useState<'equal' | 'percentage' | 'custom'>('equal');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [paidBy, setPaidBy] = useState<string>('');
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  
  const t = TRANSLATIONS[language];
  const currencySymbol = getCurrencySymbol();
  
  // Check if this is a group wallet
  const isGroupWallet = useMemo(() => {
    return activeWallet && !activeWallet.isPersonal && activeWallet.members.length > 1;
  }, [activeWallet]);
  
  // Get member names from expenses (fallback to user ID if not found)
  const getMemberName = useCallback((userId: string): string => {
    if (userId === user?.id) return user.name;
    // Try to find name from expenses
    const expense = expenses.find(e => e.createdBy.uid === userId);
    if (expense) return expense.createdBy.name;
    return userId.substring(0, 8); // Fallback to first 8 chars of ID
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

  if (!isOpen) return null;

  const handleNumClick = (num: string) => {
    triggerHaptic();
    if (amount === '0' && num !== '.') {
      setAmount(num);
    } else {
      if (num === '.' && amount.includes('.')) return;
      if (amount.replace('.', '').length >= 9) return; 
      setAmount(prev => prev + num);
    }
  };

  const handleDelete = () => {
    triggerHaptic();
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
      percentage?: number;
    }> = [];
    
    if (splitType === 'equal') {
      const perPerson = total / selectedMembers.length;
      selectedMembers.forEach(memberId => {
        participants.push({
          userId: memberId,
          userName: getMemberName(memberId),
          amount: perPerson
        });
      });
    } else if (splitType === 'percentage') {
      let totalPercent = 0;
      selectedMembers.forEach(memberId => {
        const percent = parseFloat(percentages[memberId] || '0');
        totalPercent += percent;
        participants.push({
          userId: memberId,
          userName: getMemberName(memberId),
          amount: (total * percent) / 100,
          percentage: percent
        });
      });
      if (Math.abs(totalPercent - 100) > 0.01) {
        return null; // Invalid percentages
      }
    } else if (splitType === 'custom') {
      let totalCustom = 0;
      selectedMembers.forEach(memberId => {
        const customAmount = parseFloat(customAmounts[memberId] || '0');
        totalCustom += customAmount;
        participants.push({
          userId: memberId,
          userName: getMemberName(memberId),
          amount: customAmount
        });
      });
      if (Math.abs(totalCustom - total) > 0.01) {
        return null; // Invalid custom amounts
      }
    }
    
    return participants;
  }, [amount, isSplitMode, selectedMembers, splitType, percentages, customAmounts, getMemberName]);

  const handleSubmit = () => {
    triggerHaptic();
    const val = parseFloat(amount);
    if (val > 0) {
      let splitDetails: SplitDetails | undefined;
      
      if (isSplitMode && calculateSplitAmounts && paidBy) {
        splitDetails = {
          splitType,
          participants: calculateSplitAmounts,
          paidBy
        };
      }
      
      addExpense(val, category, note, selectedDate, splitDetails);
      onClose();
      setAmount('0');
      setNote('');
      setSelectedDate(new Date());
      setIsSplitMode(false);
      setSelectedMembers([]);
      setPaidBy('');
      setCustomAmounts({});
      setPercentages({});
    }
  };
  
  // Theme Variables
  const themeText = 'text-rose-600';
  const themeBg = 'bg-rose-600';

  const DateSelectionView = () => (
      <div className="absolute inset-0 bg-white z-20 flex flex-col p-4">
          <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setShowDatePicker(false)} className="p-1.5 -ml-1.5 text-slate-600 active:scale-95">
                  <ChevronLeft size={20} />
              </button>
              <h3 className="text-lg font-bold text-slate-900">{t.pickDate}</h3>
          </div>
          <div className="space-y-2">
              <button 
                onClick={() => { setSelectedDate(new Date()); setShowDatePicker(false); }}
                className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-left flex justify-between items-center active:scale-95"
              >
                  <span className="text-slate-900">{t.today}</span>
                  <span className="text-slate-500">{format(new Date(), 'MMM d')}</span>
              </button>
              <button 
                onClick={() => { setSelectedDate(subDays(new Date(), 1)); setShowDatePicker(false); }}
                className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-left flex justify-between items-center active:scale-95"
              >
                  <span className="text-slate-900">{t.yesterday}</span>
                  <span className="text-slate-500">{format(subDays(new Date(), 1), 'MMM d')}</span>
              </button>
              <div className="mt-4">
                  <label className="text-sm font-medium text-slate-700 block mb-2">{t.date}</label>
                  <input 
                    type="date"
                    value={format(selectedDate, 'yyyy-MM-dd')}
                    onChange={(e) => { setSelectedDate(new Date(e.target.value)); setShowDatePicker(false); }}
                    className="w-full bg-white border border-slate-200 p-3 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
              </div>
          </div>
      </div>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center pointer-events-none overflow-x-hidden">
      <div 
        className="absolute inset-0 bg-slate-900/60 pointer-events-auto"
        onClick={onClose}
      />
      
      <div 
        className="bg-white w-full sm:max-w-md rounded-t-xl sm:rounded-xl p-4 shadow-2xl pointer-events-auto flex flex-col overflow-hidden relative max-w-full"
        style={{
          height: 'calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
          maxHeight: '92vh',
          paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))'
        }}
      >
        
        {showDatePicker && <DateSelectionView />}

        {/* Drag Handle */}
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />

        {/* Header / Category Info */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-3xl border bg-slate-50 border-slate-200">
              {category.emoji}
            </div>
            <div>
              <p className="text-xs font-medium mb-0.5 text-rose-600">
                  {t.addExpense}
              </p>
              <h2 className="text-lg font-bold text-slate-900">
                {language === 'en' ? category.name : category.name_np}
              </h2>
            </div>
          </div>
          <div className="flex gap-2">
            <button
                onClick={() => setShowDatePicker(true)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg active:scale-95 flex items-center justify-center gap-1.5"
            >
                <CalendarIcon size={16} className="text-slate-600" />
                <span className="text-sm font-medium text-slate-700">{format(selectedDate, 'MMM d')}</span>
            </button>
            <button 
                onClick={onClose} 
                className="w-9 h-9 bg-white border border-slate-200 rounded-lg active:scale-95 flex items-center justify-center"
            >
                <X size={18} className="text-slate-600" />
            </button>
          </div>
        </div>

        {/* Display Area */}
        <div className="flex-1 flex flex-col justify-end mb-4">
            <div className="relative mb-4">
                <span className="text-xl font-medium absolute left-3 top-1/2 -translate-y-1/2 text-rose-400">{currencySymbol}</span>
                <input 
                    readOnly
                    value={amount}
                    className={`w-full text-right text-4xl font-bold bg-white border border-slate-200 rounded-xl p-4 pr-12 focus:outline-none ${themeText}`}
                />
            </div>
            
            <div className="mb-4">
                 <input 
                    type="text" 
                    placeholder={t.description + "..."}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full bg-white border border-slate-200 p-3 rounded-xl text-sm font-medium text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
            </div>
            
            {/* Split Expense Section - Only for group wallets */}
            {isGroupWallet && (
              <div className="mb-4">
                <button
                  onClick={() => {
                    triggerHaptic();
                    setIsSplitMode(!isSplitMode);
                  }}
                  className={`w-full p-3 rounded-xl border flex items-center justify-between active:scale-95 ${
                    isSplitMode ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Users size={18} className={isSplitMode ? 'text-emerald-600' : 'text-slate-600'} />
                    <span className={`text-sm font-medium ${isSplitMode ? 'text-emerald-700' : 'text-slate-700'}`}>
                      {t.splitExpense}
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
                    {/* Split Type Selector */}
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-2">{t.splitWith}</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { triggerHaptic(); setSplitType('equal'); }}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium active:scale-95 ${
                            splitType === 'equal' ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-700'
                          }`}
                        >
                          {t.splitEqually}
                        </button>
                        <button
                          onClick={() => { triggerHaptic(); setSplitType('percentage'); }}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium active:scale-95 ${
                            splitType === 'percentage' ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-700'
                          }`}
                        >
                          %
                        </button>
                        <button
                          onClick={() => { triggerHaptic(); setSplitType('custom'); }}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium active:scale-95 ${
                            splitType === 'custom' ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-700'
                          }`}
                        >
                          {t.customSplit}
                        </button>
                      </div>
                    </div>
                    
                    {/* Who Paid */}
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-2">{t.whoPaid}</label>
                      <select
                        value={paidBy}
                        onChange={(e) => setPaidBy(e.target.value)}
                        className="w-full bg-white border border-slate-200 p-2 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {availableMembers.map(member => (
                          <option key={member.id} value={member.id}>{member.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    {/* Member Selection */}
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-2">{t.selectMembers}</label>
                      <div className="space-y-2">
                        {availableMembers.map(member => {
                          const isSelected = selectedMembers.includes(member.id);
                          return (
                            <div key={member.id} className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  triggerHaptic();
                                  if (isSelected) {
                                    setSelectedMembers(prev => prev.filter(id => id !== member.id));
                                  } else {
                                    setSelectedMembers(prev => [...prev, member.id]);
                                  }
                                }}
                                className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                                  isSelected ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300'
                                }`}
                              >
                                {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                              </button>
                              <span className="text-sm font-medium text-slate-700 flex-1">{member.name}</span>
                              {isSelected && splitType === 'equal' && (
                                <span className="text-xs text-slate-500">
                                  {currencySymbol}{((parseFloat(amount) || 0) / selectedMembers.length).toFixed(2)} {t.perPerson}
                                </span>
                              )}
                              {isSelected && splitType === 'percentage' && (
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.1"
                                  value={percentages[member.id] || ''}
                                  onChange={(e) => setPercentages(prev => ({ ...prev, [member.id]: e.target.value }))}
                                  placeholder="%"
                                  className="w-16 p-1.5 bg-white border border-slate-200 rounded text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              )}
                              {isSelected && splitType === 'custom' && (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={customAmounts[member.id] || ''}
                                  onChange={(e) => setCustomAmounts(prev => ({ ...prev, [member.id]: e.target.value }))}
                                  placeholder="0"
                                  className="w-20 p-1.5 bg-white border border-slate-200 rounded text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    
                    {/* Split Preview */}
                    {calculateSplitAmounts && (
                      <div className="pt-2 border-t border-slate-200">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-600">{t.totalSplit}:</span>
                          <span className="font-semibold text-slate-900">
                            {currencySymbol}{calculateSplitAmounts.reduce((sum: number, p) => sum + p.amount, 0).toFixed(2)}
                          </span>
                        </div>
                        {Math.abs(calculateSplitAmounts.reduce((sum: number, p) => sum + p.amount, 0) - (parseFloat(amount) || 0)) > 0.01 && (
                          <div className="text-xs text-rose-600 mt-1">
                            {t.remaining}: {currencySymbol}{((parseFloat(amount) || 0) - calculateSplitAmounts.reduce((sum: number, p) => sum + p.amount, 0)).toFixed(2)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
        </div>

        {/* Simplified Keypad - Larger buttons */}
        <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3].map(num => (
                <KeypadButton key={num} onClick={() => handleNumClick(num.toString())}>{num}</KeypadButton>
            ))}
            <button 
                onClick={handleDelete}
                className="h-12 rounded-lg text-base font-bold text-slate-600 bg-white border border-slate-200 active:scale-95 flex items-center justify-center"
            >
                <Delete size={20} />
            </button>

            {[4, 5, 6].map(num => (
                <KeypadButton key={num} onClick={() => handleNumClick(num.toString())}>{num}</KeypadButton>
            ))}
            <div className="row-span-2">
                 <button 
                    onClick={handleSubmit}
                    className={`w-full h-full text-white rounded-lg font-bold text-lg active:scale-95 flex items-center justify-center ${themeBg}`}
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
        className="h-12 rounded-lg text-lg font-bold text-slate-800 bg-white border border-slate-200 active:scale-95"
    >
        {children}
    </button>
);

export default React.memo(AddExpenseModal);