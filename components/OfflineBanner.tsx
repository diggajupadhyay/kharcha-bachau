import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Slim, non-blocking banner shown when the device is offline.
 * Data is persisted locally (IndexedDB) so expenses still save and will
 * sync on reconnect; this just makes that state visible.
 */
const OfflineBanner: React.FC = () => {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed top-0 left-0 right-0 z-[120] bg-amber-500 text-white text-xs font-medium px-4 py-2 flex items-center justify-center gap-2"
      style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}
    >
      <WifiOff size={14} className="flex-shrink-0" />
      <span>You&rsquo;re offline — changes are saved on this device and will sync when you reconnect.</span>
    </div>
  );
};

export default React.memo(OfflineBanner);
