import React, { useState, useMemo, useRef } from 'react';
import { useStore } from '../context/StoreContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { X, Search } from 'lucide-react';
import { Category } from '../types';
import AddExpenseModal from './AddExpenseModal';
import { getCategoryIcon, parseCategoryColor } from '../utils/categoryIcons';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const QuickAddModal: React.FC<QuickAddModalProps> = ({ isOpen, onClose }) => {
  const { getAllCategories } = useStore();
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  const sortedCategories = useMemo(() => {
    return getAllCategories().sort((a, b) => {
      const aIsOther = a.name.toLowerCase() === 'other';
      const bIsOther = b.name.toLowerCase() === 'other';
      if (aIsOther && !bIsOther) return 1;
      if (!aIsOther && bIsOther) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [getAllCategories]);

  const [search, setSearch] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedCategories;
    return sortedCategories.filter(c => c.name.toLowerCase().includes(q));
  }, [sortedCategories, search]);

  if (!isOpen) return null;

  const handleClose = () => {
    setSelectedCategory(null);
    setSearch('');
    onClose();
  };

  const handleCategorySelect = (cat: Category) => {
    setSelectedCategory(cat);
  };

  const handleExpenseClose = () => {
    setSelectedCategory(null);
    onClose();
  };

  return (
    <>
      {!selectedCategory && (
        <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center p-0 sm:p-2 md:p-4 lg:p-6 overflow-x-hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={handleClose} />
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-add-title"
            className="bg-white w-full sm:max-w-md md:max-w-lg lg:max-w-2xl xl:max-w-3xl rounded-t-xl sm:rounded-xl shadow-2xl relative z-10 flex flex-col max-h-[90vh] max-w-full animate-slide-up-bottom sm:animate-scale-in"
            style={{
              paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
              paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))'
            }}
          >
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mt-3 sm:hidden" />
            <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b border-slate-300 flex-shrink-0">
              <h2 id="quick-add-title" className="text-base sm:text-lg font-bold text-slate-900">{'Quick Add'}</h2>
              <button onClick={handleClose} className="min-w-[44px] min-h-[44px] text-slate-600 hover:bg-slate-100 rounded-xl active:scale-95 flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2" aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="px-4 sm:px-6 pt-3 pb-1 flex-shrink-0">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search categories"
                  className="w-full min-h-[44px] pl-9 pr-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                  aria-label="Search categories"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-2.5 md:gap-3">
                {filteredCategories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategorySelect(cat)}
                    className="flex flex-col items-center gap-1.5 p-2.5 sm:p-3 md:p-4 bg-white rounded-xl border border-slate-300 active:scale-95 hover:shadow-md hover:border-emerald-300 transition-all select-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                    aria-label={cat.name}
                  >
                    <div className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 lg:w-20 lg:h-20 rounded-xl flex items-center justify-center ${parseCategoryColor(cat.color).bg}`}>
                      {(() => {
                        const Icon = getCategoryIcon(cat.id);
                        const { text } = parseCategoryColor(cat.color);
                        return Icon ? <Icon size={24} className={text} /> : <span className={text}>{cat.emoji}</span>;
                      })()}
                    </div>
                    <p className="text-[11px] sm:text-xs md:text-sm lg:text-base font-medium text-slate-700 text-center leading-tight">
                      {cat.name}
                    </p>
                  </button>
                ))}
              </div>
              {search.trim() && filteredCategories.length === 0 && (
                <p className="text-center text-sm text-slate-400 py-8">No categories match "{search}"</p>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedCategory && (
        <AddExpenseModal
          category={selectedCategory}
          isOpen={!!selectedCategory}
          onClose={handleExpenseClose}
        />
      )}
    </>
  );
};

export default React.memo(QuickAddModal);
