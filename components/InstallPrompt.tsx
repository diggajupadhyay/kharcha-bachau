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
    <div 
      className="fixed top-0 left-0 right-0 z-50 px-4 pb-2 animate-slide-up"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))'
      }}
    >
      <div className="max-w-md md:max-w-lg lg:max-w-xl mx-auto bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl shadow-2xl p-4 md:p-5 lg:p-6 flex items-center gap-3 md:gap-4 max-w-full">
        <div className="flex-shrink-0 p-2 md:p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
          <Smartphone className="text-white md:w-7 md:h-7 lg:w-8 lg:h-8" size={24} />
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm md:text-base lg:text-lg mb-1">Install Kharcha Bachau</p>
          <p className="text-white/90 text-xs md:text-sm">Get quick access and use offline</p>
        </div>

        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          <button
            onClick={handleInstall}
            className="px-4 py-2 md:px-5 md:py-2.5 lg:px-6 lg:py-3 bg-white text-emerald-600 rounded-xl font-bold text-sm md:text-base hover:bg-emerald-50 active:scale-95 transition-all flex items-center gap-2 shadow-lg"
          >
            <Download size={16} className="md:w-5 md:h-5 lg:w-6 lg:h-6" />
            <span className="hidden sm:inline">Install</span>
          </button>
          
          <button
            onClick={() => setIsDismissed(true)}
            className="p-2 md:p-2.5 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-colors"
            aria-label="Dismiss"
          >
            <X size={18} className="md:w-5 md:h-5 lg:w-6 lg:h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallPrompt;

