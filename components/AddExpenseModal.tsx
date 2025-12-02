import React, { useState } from 'react';
import { Category } from '../types';
import { useStore } from '../context/StoreContext';
import { TRANSLATIONS } from '../constants';
import { getCurrencySymbol } from '../utils/currencyFormatter';
import { X, Delete, Check, Calendar as CalendarIcon, ChevronLeft } from 'lucide-react';
import { format, subDays } from 'date-fns';

interface AddExpenseModalProps {
  category: Category;
  isOpen: boolean;
  onClose: () => void;
}

const AddExpenseModal: React.FC<AddExpenseModalProps> = ({ category, isOpen, onClose }) => {
  const { language, country, addExpense, triggerHaptic } = useStore();
  const [amount, setAmount] = useState('0');
  const [note, setNote] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const t = TRANSLATIONS[language];
  const currencySymbol = getCurrencySymbol(country);

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

  const handleSubmit = () => {
    triggerHaptic();
    const val = parseFloat(amount);
    if (val > 0) {
      addExpense(val, category, note, selectedDate);
      onClose();
      setAmount('0');
      setNote('');
      setSelectedDate(new Date());
    }
  };
  
  // Theme Variables
  const themeText = 'text-rose-600';
  const themeBg = 'bg-rose-600';

  const DateSelectionView = () => (
      <div className="absolute inset-0 bg-white z-20 flex flex-col p-6">
          <div className="flex items-center gap-3 mb-8">
              <button onClick={() => setShowDatePicker(false)} className="p-2 -ml-2 text-slate-600 active:scale-95">
                  <ChevronLeft size={28} />
              </button>
              <h3 className="text-2xl font-bold text-slate-900">{t.pickDate}</h3>
          </div>
          <div className="space-y-4">
              <button 
                onClick={() => { setSelectedDate(new Date()); setShowDatePicker(false); }}
                className="w-full p-5 bg-white border-2 border-slate-200 rounded-2xl text-base font-semibold text-left flex justify-between items-center active:scale-95"
              >
                  <span className="text-slate-900">{t.today}</span>
                  <span className="text-slate-500">{format(new Date(), 'MMM d')}</span>
              </button>
              <button 
                onClick={() => { setSelectedDate(subDays(new Date(), 1)); setShowDatePicker(false); }}
                className="w-full p-5 bg-white border-2 border-slate-200 rounded-2xl text-base font-semibold text-left flex justify-between items-center active:scale-95"
              >
                  <span className="text-slate-900">{t.yesterday}</span>
                  <span className="text-slate-500">{format(subDays(new Date(), 1), 'MMM d')}</span>
              </button>
              <div className="mt-6">
                  <label className="text-base font-semibold text-slate-700 block mb-3">{t.date}</label>
                  <input 
                    type="date"
                    value={format(selectedDate, 'yyyy-MM-dd')}
                    onChange={(e) => { setSelectedDate(new Date(e.target.value)); setShowDatePicker(false); }}
                    className="w-full bg-white border-2 border-slate-200 p-5 rounded-2xl text-lg font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
              </div>
          </div>
      </div>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center pointer-events-none">
      <div 
        className="absolute inset-0 bg-slate-900/60 pointer-events-auto"
        onClick={onClose}
      />
      
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl pointer-events-auto flex flex-col h-[92vh] sm:h-[800px] overflow-hidden relative">
        
        {showDatePicker && <DateSelectionView />}

        {/* Drag Handle */}
        <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 sm:hidden" />

        {/* Header / Category Info */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl border-2 bg-slate-50 border-slate-200">
              {category.emoji}
            </div>
            <div>
              <p className="text-sm font-semibold mb-1 text-rose-600">
                  {t.addExpense}
              </p>
              <h2 className="text-2xl font-bold text-slate-900">
                {language === 'en' ? category.name : category.name_np}
              </h2>
            </div>
          </div>
          <div className="flex gap-2">
            <button
                onClick={() => setShowDatePicker(true)}
                className="px-4 py-2 bg-white border-2 border-slate-200 rounded-xl active:scale-95 flex items-center justify-center gap-2"
            >
                <CalendarIcon size={20} className="text-slate-600" />
                <span className="text-base font-semibold text-slate-700">{format(selectedDate, 'MMM d')}</span>
            </button>
            <button 
                onClick={onClose} 
                className="w-12 h-12 bg-white border-2 border-slate-200 rounded-xl active:scale-95 flex items-center justify-center"
            >
                <X size={24} className="text-slate-600" />
            </button>
          </div>
        </div>

        {/* Display Area */}
        <div className="flex-1 flex flex-col justify-end mb-6">
            <div className="relative mb-6">
                <span className="text-3xl font-medium absolute left-4 top-1/2 -translate-y-1/2 text-rose-400">{currencySymbol}</span>
                <input 
                    readOnly
                    value={amount}
                    className={`w-full text-right text-6xl font-bold bg-white border-2 border-slate-200 rounded-2xl p-6 pr-16 focus:outline-none ${themeText}`}
                />
            </div>
            
            <div className="mb-6">
                 <input 
                    type="text" 
                    placeholder={t.description + "..."}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full bg-white border-2 border-slate-200 p-5 rounded-2xl text-lg font-medium text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
            </div>
        </div>

        {/* Simplified Keypad - Larger buttons */}
        <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3].map(num => (
                <KeypadButton key={num} onClick={() => handleNumClick(num.toString())}>{num}</KeypadButton>
            ))}
            <button 
                onClick={handleDelete}
                className="h-16 rounded-xl text-xl font-bold text-slate-600 bg-white border-2 border-slate-200 active:scale-95 flex items-center justify-center"
            >
                <Delete size={24} />
            </button>

            {[4, 5, 6].map(num => (
                <KeypadButton key={num} onClick={() => handleNumClick(num.toString())}>{num}</KeypadButton>
            ))}
            <div className="row-span-2">
                 <button 
                    onClick={handleSubmit}
                    className={`w-full h-full text-white rounded-xl font-bold text-2xl active:scale-95 flex items-center justify-center ${themeBg}`}
                >
                    <Check size={32} strokeWidth={3} />
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
        className="h-16 rounded-xl text-2xl font-bold text-slate-800 bg-white border-2 border-slate-200 active:scale-95"
    >
        {children}
    </button>
);

export default React.memo(AddExpenseModal);