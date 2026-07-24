import React from 'react';
import { RefreshCw, X } from 'lucide-react';

interface UpdatePromptProps {
  needRefresh: boolean;
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  onClose: () => void;
}

const UpdatePrompt: React.FC<UpdatePromptProps> = ({ needRefresh, updateServiceWorker, onClose }) => {
  if (!needRefresh) return null;

  const handleUpdate = () => {
    updateServiceWorker(true);
  };

  return (
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 animate-slide-up-bottom"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="bg-[#0E1833] text-white rounded-xl shadow-2xl border border-white/10 p-4 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm">New version available</p>
          <p className="text-white/70 text-xs">Tap to update for the latest features</p>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={handleUpdate}
            className="px-3 py-1.5 bg-[#489240] text-white rounded-lg font-bold text-xs hover:bg-[#3d7a36] active:scale-95 transition-all flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[#489240] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1833]"
          >
            <RefreshCw size={14} />
            Update
          </button>
          <button
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center focus-visible:ring-2 focus-visible:ring-white/50"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdatePrompt;
