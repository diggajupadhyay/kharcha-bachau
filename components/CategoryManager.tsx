import React, { useState, useMemo } from 'react';
import { Category } from '../types';
import { useStore } from '../context/StoreContext';
import { TRANSLATIONS, EXPENSE_CATEGORIES } from '../constants';
import { X, Plus, Edit2, Trash2, Save } from 'lucide-react';

interface CategoryManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

const CategoryManager: React.FC<CategoryManagerProps> = ({ isOpen, onClose }) => {
  const { language, customCategories, addCustomCategory, updateCustomCategory, deleteCustomCategory, getAllCategories, showNotification, triggerHaptic } = useStore();
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({ name: '', name_np: '', emoji: '', id: '' });
  
  const t = TRANSLATIONS[language];
  const allCategories = useMemo(() => getAllCategories(), [getAllCategories]);
  const defaultCategories = useMemo(() => EXPENSE_CATEGORIES, []);
  
  if (!isOpen) return null;

  const handleAdd = () => {
    setIsAdding(true);
    setEditingCategory(null);
    setFormData({ name: '', name_np: '', emoji: '', id: '' });
  };

  const handleEdit = (category: Category) => {
    // Can't edit default categories
    if (EXPENSE_CATEGORIES.find(c => c.id === category.id)) {
      showNotification('error', t.cannotModifyDefault);
      return;
    }
    setEditingCategory(category);
    setIsAdding(false);
    setFormData({
      name: category.name,
      name_np: category.name_np,
      emoji: category.emoji,
      id: category.id
    });
  };

  const handleDelete = async (categoryId: string) => {
    triggerHaptic();
    await deleteCustomCategory(categoryId);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.emoji) {
      showNotification('error', 'Please fill all required fields');
      return;
    }

    triggerHaptic();
    
    if (isAdding) {
      // Generate ID from name
      const id = formData.name.toLowerCase().replace(/\s+/g, '_');
      const newCategory: Category = {
        id,
        name: formData.name,
        name_np: formData.name_np || formData.name,
        emoji: formData.emoji,
        color: 'bg-slate-100 text-slate-600'
      };
      await addCustomCategory(newCategory);
      setIsAdding(false);
      setFormData({ name: '', name_np: '', emoji: '', id: '' });
    } else if (editingCategory) {
      await updateCustomCategory(editingCategory.id, {
        name: formData.name,
        name_np: formData.name_np || formData.name,
        emoji: formData.emoji
      });
      setEditingCategory(null);
      setFormData({ name: '', name_np: '', emoji: '', id: '' });
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingCategory(null);
    setFormData({ name: '', name_np: '', emoji: '', id: '' });
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center pointer-events-none overflow-x-hidden">
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
          <h2 className="text-lg font-bold text-slate-900">{t.manageCategories}</h2>
          <div className="flex gap-2">
            {!isAdding && !editingCategory && (
              <button
                onClick={handleAdd}
                className="w-9 h-9 bg-emerald-600 text-white rounded-lg flex items-center justify-center active:scale-95"
                aria-label="Add Category"
              >
                <Plus size={18} />
              </button>
            )}
            <button 
              onClick={onClose} 
              className="w-9 h-9 bg-white border border-slate-200 rounded-lg active:scale-95 flex items-center justify-center"
            >
              <X size={18} className="text-slate-600" />
            </button>
          </div>
        </div>

        {/* Add/Edit Form */}
        {(isAdding || editingCategory) && (
          <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              {isAdding ? t.addCategory : t.editCategory}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">{t.categoryEmoji}</label>
                <input
                  type="text"
                  value={formData.emoji}
                  onChange={(e) => setFormData(prev => ({ ...prev, emoji: e.target.value }))}
                  placeholder="🍔"
                  maxLength={2}
                  className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-2xl text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">{t.categoryName}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Food"
                  className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">{t.categoryNameNp}</label>
                <input
                  type="text"
                  value={formData.name_np}
                  onChange={(e) => setFormData(prev => ({ ...prev, name_np: e.target.value }))}
                  placeholder="खाना"
                  className="w-full bg-white border border-slate-200 p-2.5 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSave}
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <Save size={16} />
                  <span>{t.saveCategory}</span>
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold active:scale-95"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Default Categories */}
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">{t.defaultCategories}</h3>
          <div className="grid grid-cols-3 gap-2">
            {defaultCategories.map(cat => (
              <div
                key={cat.id}
                className="flex flex-col items-center gap-1.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200"
              >
                <div className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl bg-white">
                  {cat.emoji}
                </div>
                <p className="text-xs font-medium text-slate-700 text-center">
                  {language === 'en' ? cat.name : cat.name_np}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Categories */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold text-slate-700">{t.customCategories}</h3>
            {!isAdding && !editingCategory && customCategories.length > 0 && (
              <button
                onClick={handleAdd}
                className="text-xs font-medium text-emerald-600 active:scale-95"
              >
                + {t.addCategory}
              </button>
            )}
          </div>
          {customCategories.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {customCategories.map(cat => (
                <div
                  key={cat.id}
                  className="flex flex-col items-center gap-1.5 p-2.5 bg-white rounded-lg border border-slate-200 relative group"
                >
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl bg-slate-50">
                    {cat.emoji}
                  </div>
                  <p className="text-xs font-medium text-slate-700 text-center">
                    {language === 'en' ? cat.name : cat.name_np}
                  </p>
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleEdit(cat)}
                      className="w-6 h-6 bg-emerald-100 text-emerald-600 rounded flex items-center justify-center active:scale-95"
                      aria-label="Edit"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      className="w-6 h-6 bg-rose-100 text-rose-600 rounded flex items-center justify-center active:scale-95"
                      aria-label="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-sm text-slate-500 mb-2">No custom categories yet</p>
              {!isAdding && (
                <button
                  onClick={handleAdd}
                  className="text-sm font-medium text-emerald-600 active:scale-95"
                >
                  + {t.addCategory}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(CategoryManager);


