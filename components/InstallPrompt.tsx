import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, X, Smartphone } from 'lucide-react';

const InstallPrompt: React.FC = () => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [isDismissed, setIsDismissed] = useState(false);

  // Don't show if already installed, not installable, or dismissed
  if (isInstalled || !isInstallable || isDismissed) {
    return null;
  }

  const handleInstall = async () => {
    const installed = await install();
    if (installed) {
      setIsDismissed(true);
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 px-4 pt-4 pb-2 animate-slide-up">
      <div className="max-w-md mx-auto bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl shadow-2xl p-4 flex items-center gap-3">
        <div className="flex-shrink-0 p-2 bg-white/20 rounded-xl backdrop-blur-sm">
          <Smartphone className="text-white" size={24} />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm mb-1">Install Kharcha Bachau</p>
          <p className="text-white/90 text-xs">Get quick access and use offline</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleInstall}
            className="px-4 py-2 bg-white text-emerald-600 rounded-xl font-bold text-sm hover:bg-emerald-50 active:scale-95 transition-all flex items-center gap-2 shadow-lg"
          >
            <Download size={16} />
            Install
          </button>
          
          <button
            onClick={() => setIsDismissed(true)}
            className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
            aria-label="Dismiss"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallPrompt;

