import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { X, Plus, Trash2 } from 'lucide-react';
import { Category } from '../types';
import { getCategoryIcon, parseCategoryColor } from '../utils/categoryIcons';
import ConfirmDialog from './ConfirmDialog';

const CategoryManager: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { addCustomCategory, updateCustomCategory, deleteCustomCategory, getAllCategories, showNotification, triggerHaptic } = useStore();
  const [isAdding, setIsAdding] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<Category | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({ name: '', emoji: '', id: '' });
  const modalRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen, onClose);

  useEffect(() => {
    if (!isOpen) {
      setIsAdding(false); setEditingCategory(null); setConfirmDeleteCategory(null);
      setFormData({ name: '', emoji: '', id: '' });
    }
  }, [isOpen]);

  const allCategories = useMemo(() => getAllCategories(), [getAllCategories]);
  const defaultCategories = useMemo(() => allCategories.filter(c => !c.id.startsWith('custom_')), [allCategories]);
  const customCats = useMemo(() => allCategories.filter(c => c.id.startsWith('custom_')), [allCategories]);

  // Without this the sheet renders permanently over Settings with no way to dismiss it.
  if (!isOpen) return null;

  const handleAdd = () => { setIsAdding(true); setEditingCategory(null); setFormData({ name: '', emoji: '', id: '' }); };
  const handleEdit = (cat: Category) => { setEditingCategory(cat); setIsAdding(false); setFormData({ name: cat.name, emoji: cat.emoji, id: cat.id }); };
  const handleCancel = () => { setIsAdding(false); setEditingCategory(null); setFormData({ name: '', emoji: '', id: '' }); };

  // Derives a document id from the name, and keeps adding a numeric suffix until it
  // is free. Two differently-spelled names ("Pet Food", "pet-food") slugify to the
  // same string, and the store rejects a duplicate id outright.
  const buildUniqueId = (name: string): string => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'cat';
    const taken = new Set(allCategories.map(c => c.id));
    let candidate = `custom_${slug}`;
    let n = 2;
    while (taken.has(candidate)) { candidate = `custom_${slug}_${n}`; n += 1; }
    return candidate;
  };

  const handleSave = async () => {
    if (isSaving) return;
    const name = formData.name.trim();
    const emoji = formData.emoji.trim();
    if (!name || !emoji) { showNotification('error', 'Please fill all required fields'); return; }
    if (name.length > 30) { showNotification('error', 'Category name too long (max 30 characters)'); return; }
    if (emoji.length > 8) { showNotification('error', 'Emoji too long'); return; }
    // The category being edited must be excluded, otherwise saving an edit that keeps
    // the existing name always collides with itself.
    if (allCategories.some(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== editingCategory?.id)) {
      showNotification('error', 'A category with this name already exists'); return;
    }

    triggerHaptic();
    setIsSaving(true);
    try {
      if (isAdding) {
        await addCustomCategory({ id: buildUniqueId(name), name, emoji, color: 'bg-slate-100 text-slate-600' });
      } else if (editingCategory) {
        await updateCustomCategory(editingCategory.id, { name, emoji });
      }
      // Only dismissed once the write actually landed — the form used to close on
      // failure too, discarding what the user had typed.
      setIsAdding(false); setEditingCategory(null); setFormData({ name: '', emoji: '', id: '' });
    } catch {
      /* the store has already surfaced the reason; keep the form open */
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    const target = confirmDeleteCategory;
    setConfirmDeleteCategory(null);
    if (!target) return;
    try { await deleteCustomCategory(target.id); } catch { /* reported by the store */ }
  };

  const showAddButton = !isAdding && !editingCategory;

  return (
    <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center pointer-events-none overflow-x-hidden p-0 sm:p-2 md:p-4 lg:p-6">
      <div className="absolute inset-0 bg-slate-900/60 pointer-events-auto" onClick={onClose} />
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="category-manager-title"
        className="bg-white w-full sm:max-w-md md:max-w-lg lg:max-w-xl rounded-t-2xl sm:rounded-2xl shadow-2xl pointer-events-auto relative z-10 max-w-full max-h-[90vh] overflow-y-auto animate-slide-up-bottom sm:animate-scale-in"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))', paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-3 sm:hidden" />
        <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 id="category-manager-title" className="text-heading text-slate-900">Manage Categories</h2>
            <button onClick={onClose} className="min-w-[44px] min-h-[44px] bg-slate-100 rounded-xl active:scale-95 flex items-center justify-center hover:bg-slate-200 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2" aria-label="Close">
              <X size={20} className="text-slate-600" />
            </button>
          </div>

          {/* Add / Edit form */}
          {(isAdding || editingCategory) && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 space-y-3">
              <div>
                <label htmlFor="category-name" className="text-subhead block mb-1.5">Category Name</label>
                <input id="category-name" type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Groceries" className="input" maxLength={30} autoFocus />
              </div>
              <div>
                <label htmlFor="category-emoji" className="text-subhead block mb-1.5">Emoji</label>
                <input id="category-emoji" type="text" value={formData.emoji} onChange={e => setFormData({ ...formData, emoji: e.target.value })} placeholder="e.g. 🛒" className="input" maxLength={8} />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSave} disabled={isSaving} className="btn-primary flex-1">{isSaving ? 'Saving...' : 'Save'}</button>
                <button onClick={handleCancel} disabled={isSaving} className="btn-secondary flex-1">Cancel</button>
              </div>
            </div>
          )}

          {/* Default Categories */}
          <div className="mb-4">
            <p className="section-title">Default Categories</p>
            <p className="text-xs text-slate-500 mb-2">These are fixed and cannot be removed.</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {defaultCategories.map(cat => {
                const Icon = getCategoryIcon(cat.id);
                const { bg, text } = parseCategoryColor(cat.color);
                return (
                  <div key={cat.id} className="card !p-3 flex flex-col items-center gap-1.5 !border-slate-200">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg}`}>
                      {Icon ? <Icon size={18} className={text} /> : <span className="text-base">{cat.emoji}</span>}
                    </div>
                    <span className="text-xs font-medium text-slate-700 text-center leading-tight">{cat.name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom Categories */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="section-title mb-0">Your Categories</p>
              {/* Shown regardless of how many custom categories exist. Gating this on
                  a non-empty list meant the empty state told people to tap a button
                  that was not on screen, so a first category could never be made. */}
              {showAddButton && (
                <button onClick={handleAdd} className="text-xs font-semibold text-emerald-600 active:scale-95 hover:text-emerald-700 transition-colors min-h-[36px] px-2 flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg">
                  <Plus size={14} /> Add
                </button>
              )}
            </div>
            {customCats.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {customCats.map(cat => (
                  <div key={cat.id} className="card !p-3 flex flex-col items-center gap-1.5 !border-slate-200 relative">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${parseCategoryColor(cat.color).bg}`}>
                      {(() => { const Icon = getCategoryIcon(cat.id); const { text } = parseCategoryColor(cat.color); return Icon ? <Icon size={18} className={text} /> : <span className="text-base">{cat.emoji}</span>; })()}
                    </div>
                    <span className="text-xs font-medium text-slate-700 text-center leading-tight">{cat.name}</span>
                    <div className="flex gap-1.5 mt-1">
                      <button onClick={() => handleEdit(cat)} className="min-w-[32px] min-h-[32px] bg-emerald-50 text-emerald-700 rounded-lg flex items-center justify-center active:scale-95 hover:bg-emerald-100 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500" aria-label={`Edit ${cat.name}`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                      </button>
                      <button onClick={() => setConfirmDeleteCategory(cat)} className="min-w-[32px] min-h-[32px] bg-rose-50 text-rose-700 rounded-lg flex items-center justify-center active:scale-95 hover:bg-rose-100 transition-colors focus-visible:ring-2 focus-visible:ring-rose-500" aria-label={`Delete ${cat.name}`}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-xs text-slate-500 mb-2">No custom categories yet.</p>
                {showAddButton && (
                  <button onClick={handleAdd} className="btn-secondary !py-2.5 text-sm mx-auto">
                    <Plus size={16} /> Create a category
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Two fixes in one: the delete button used to set this state with nothing
          rendering it, so custom categories could never be removed. And it sits
          outside the panel on purpose — the panel keeps a transform after its open
          animation, which would make this fixed overlay resolve against the sheet
          and get clipped inside it. */}
      <ConfirmDialog
        isOpen={!!confirmDeleteCategory}
        title="Delete category"
        message={`Remove "${confirmDeleteCategory?.name ?? ''}"? Expenses already saved under it keep their label.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteCategory(null)}
      />
    </div>
  );
};

export default React.memo(CategoryManager);
