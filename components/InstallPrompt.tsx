import React, { useEffect, useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, X, Share2, Smartphone } from 'lucide-react';

const DISMISS_KEY = 'kharcha_bachau_install_dismissed_v2';
const DISMISS_DAYS = 90;

const wasRecentlyDismissed = (): boolean => {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (Number.isNaN(ts)) return false;
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
};

const isIOS = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iOSDevice = /iphone|ipad|ipod/i.test(ua);
  const iPadOS = navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1;
  return iOSDevice || iPadOS;
};

const isStandalone = (): boolean => {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
};

const InstallPrompt: React.FC = () => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [isDismissed, setIsDismissed] = useState(() => wasRecentlyDismissed());
  const [showIOS, setShowIOS] = useState(false);

  useEffect(() => {
    if (isIOS() && !isStandalone() && !wasRecentlyDismissed()) {
      const t = setTimeout(() => setShowIOS(true), 2500);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setIsDismissed(true);
    setShowIOS(false);
  };

  const handleInstall = async () => {
    const installed = await install();
    if (installed) dismiss();
  };

  const shouldShow = !isInstalled && !isDismissed && (isInstallable || showIOS);
  if (!shouldShow) return null;

  return (
    <div className="sticky top-0 z-50 px-0" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="bg-[#0E1833] text-white px-4 py-2.5 flex items-center gap-3 shadow-lg">
        <div className="flex-shrink-0">
          <Smartphone size={18} className="text-[#489240]" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm leading-tight">
            Install Kharcha Bachau
          </p>
          {isInstallable ? (
            <p className="text-white/70 text-xs">Add to home screen for faster, offline access</p>
          ) : (
            <p className="text-white/70 text-xs flex items-center gap-1 flex-wrap">
              Tap <Share2 size={12} className="inline text-white/90" /> then <strong>Add to Home Screen</strong>
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {isInstallable && (
            <button
              onClick={handleInstall}
              className="px-3 py-1.5 bg-[#489240] text-white rounded-lg font-bold text-xs hover:bg-[#3d7a36] active:scale-95 transition-all flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[#489240] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1833]"
            >
              <Download size={14} />
              Install
            </button>
          )}
          <button
            onClick={dismiss}
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

export default InstallPrompt;
