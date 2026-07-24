import React, { useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-auth flex items-center justify-center p-4 bg-slate-900/60 animate-fade-in">
      <div
        ref={modalRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="bg-white rounded-xl p-5 max-w-sm w-full mx-4 shadow-2xl animate-scale-in"
      >
        <div className="flex items-start gap-3 mb-3">
          {destructive && (
            <div className="w-9 h-9 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={18} className="text-rose-600" />
            </div>
          )}
          <div>
            <h3 id="confirm-title" className="text-base font-bold text-slate-900">{title}</h3>
            <p id="confirm-message" className="text-sm text-slate-500 mt-1 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 min-h-[44px] bg-slate-100 text-slate-700 rounded-xl font-medium active:scale-95 hover:bg-slate-200 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 min-h-[44px] rounded-xl font-semibold text-white active:scale-95 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 ${
              destructive ? 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500' : 'bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ConfirmDialog);
