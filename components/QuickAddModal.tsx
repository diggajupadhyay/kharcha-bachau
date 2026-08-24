import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useStore } from '../context/StoreContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { X, Search } from 'lucide-react';
import { Category } from '../types';
import AddExpenseModal from './AddExpenseModal';
import { getCategoryIcon, parseCategoryColor } from '../utils/categoryIcons';

const QuickAddModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { getAllCategories } = useStore();
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [search, setSearch] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  const sortedCategories = useMemo(() => {
    return getAllCategories().sort((a, b) => {
      const aOther = a.name.toLowerCase() === 'other';
      const bOther = b.name.toLowerCase() === 'other';
      if (aOther && !bOther) return 1;
      if (!aOther && bOther) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [getAllCategories]);

  const handleClose = useCallback(() => { setSelectedCategory(null); setSearch(''); onClose(); }, [onClose]);
  useFocusTrap(modalRef, isOpen, handleClose);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedCategories;
    return sortedCategories.filter(c => c.name.toLowerCase().includes(q));
  }, [sortedCategories, search]);

  if (!isOpen) return null;

  return (
    <>
      {/* pointer-events-auto is required on both the scrim and the panel: the wrapper
          disables pointer events, so without it the sheet opened by the main + button
          could not be clicked, scrolled or dismissed. */}
      {!selectedCategory && (
        <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center pointer-events-none overflow-x-hidden p-0 sm:p-2 md:p-4 lg:p-6">
          <div className="absolute inset-0 bg-slate-900/60 pointer-events-auto" onClick={handleClose} />
          <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="quick-add-title"
            className="bg-white w-full sm:max-w-md md:max-w-lg lg:max-w-2xl xl:max-w-3xl rounded-t-2xl sm:rounded-2xl shadow-2xl pointer-events-auto relative z-10 flex flex-col max-h-[90vh] max-w-full animate-slide-up-bottom sm:animate-scale-in"
            style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>

            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 sm:hidden" />
            <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-slate-200 flex-shrink-0">
              <h2 id="quick-add-title" className="text-heading text-slate-900">Add Expense</h2>
              <button onClick={handleClose} className="min-w-[44px] min-h-[44px] text-slate-500 hover:bg-slate-100 rounded-xl active:scale-95 flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2" aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="px-4 sm:px-6 pt-3 pb-1 flex-shrink-0">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search categories"
                  className="input pl-10" aria-label="Search categories" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {/* 3 columns at every width: tiles stay big and tappable instead of
                  shrinking into a dense grid on wide screens */}
              <div className="grid grid-cols-3 gap-3 max-w-xl mx-auto">
                {filteredCategories.map(cat => {
                  const Icon = getCategoryIcon(cat.id);
                  const { bg, text } = parseCategoryColor(cat.color);
                  return (
                    <button key={cat.id} onClick={() => setSelectedCategory(cat)}
                      className="card card-interactive flex flex-col items-center gap-2.5 p-4 !border-slate-200 hover:border-emerald-400 hover:shadow-md"
                      aria-label={cat.name}>
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${bg}`}>
                        {Icon ? <Icon size={28} className={text} /> : <span className="text-2xl">{cat.emoji}</span>}
                      </div>
                      <span className="text-sm font-semibold text-slate-800 text-center leading-tight">{cat.name}</span>
                    </button>
                  );
                })}
              </div>
              {search.trim() && filteredCategories.length === 0 && (
                <p className="text-center text-base text-slate-600 py-8">No categories match "{search}"</p>
              )}
            </div>
          </div>
        </div>
      )}
      {selectedCategory && (
        <AddExpenseModal category={selectedCategory} isOpen={!!selectedCategory} onClose={() => { setSelectedCategory(null); onClose(); }} />
      )}
    </>
  );
};

export default React.memo(QuickAddModal);
