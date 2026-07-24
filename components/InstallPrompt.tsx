import React, { useEffect, useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, X, Smartphone, Share } from 'lucide-react';

const DISMISS_KEY = 'kharcha_bachau_install_dismissed';
const DISMISS_DAYS = 14;

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

  // iOS Safari never fires beforeinstallprompt — show manual guidance instead.
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
    <div
      className="fixed left-1/2 -translate-x-1/2 w-full max-w-lg sm:max-w-xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl z-notification px-4 animate-slide-up-bottom pointer-events-none"
      style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="pointer-events-auto bg-white rounded-xl shadow-2xl border border-slate-200 p-4 flex items-center gap-3">
        <div className="flex-shrink-0 p-2 bg-emerald-50 rounded-xl">
          <Smartphone className="text-emerald-600" size={22} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-slate-900 font-bold text-sm mb-0.5">Install Kharcha Bachau</p>
          {isInstallable ? (
            <p className="text-slate-500 text-xs">Add to your home screen for quick, offline access</p>
          ) : (
            <p className="text-slate-500 text-xs flex items-center gap-1 flex-wrap">
              Tap <Share size={13} className="inline text-emerald-600" /> then "Add to Home Screen"
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isInstallable && (
            <button
              onClick={handleInstall}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 active:scale-95 transition-all flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            >
              <Download size={16} />
              Install
            </button>
          )}
          <button
            onClick={dismiss}
            className="min-w-[44px] min-h-[44px] text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors flex items-center justify-center focus-visible:ring-2 focus-visible:ring-emerald-500"
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
