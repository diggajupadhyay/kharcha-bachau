import React, { Suspense, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import Landing from './pages/Landing';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy so the landing page never downloads Firebase, the contexts or the app
// shell (Landing prefetches this module on hover/press). Must stay dynamic — a
// static import here would pull it back into the main chunk.
const AppShell = React.lazy(() => import('./AppShell'));

const Tracker = React.lazy(() => import('./pages/Tracker'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));
const Privacy = React.lazy(() => import('./pages/Privacy'));

// Set on first entry to the app (see AppShell). Returning visitors are sent
// straight to /app so daily users never sit through the landing page; crawlers
// never have the flag, so search engines still index the landing.
const HAS_OPENED_APP_KEY = 'kharcha_bachau_has_opened_app';
const hasOpenedApp = (): boolean => {
  try {
    return localStorage.getItem(HAS_OPENED_APP_KEY) === '1';
  } catch {
    return false;
  }
};

const App: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onNeedRefresh() {
      setNeedRefresh(true);
    },
    onOfflineReady() {
      if (import.meta.env.DEV) console.log('App ready for offline use');
    },
  });

  const handleDismissUpdate = useCallback(() => setNeedRefresh(false), []);

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Suspense fallback={
          <div className="h-[100dvh] flex items-center justify-center bg-slate-50">
            <Loader2 className="animate-spin text-emerald-600" />
          </div>
        }>
          <Routes>
            {/* Landing page for new visitors. Returning users are redirected to
                the app before anything paints, so there is no landing flash. */}
            <Route path="/" element={hasOpenedApp() ? <Navigate to="/app" replace /> : <Landing />} />

            {/* Privacy is public and standalone — linked from the landing footer
                and app settings, so it renders without the app shell. */}
            <Route path="/privacy" element={<Privacy />} />

            <Route
              path="/app"
              element={
                <AppShell
                  needRefresh={needRefresh}
                  updateServiceWorker={updateServiceWorker}
                  onDismissUpdate={handleDismissUpdate}
                />
              }
            >
              <Route index element={<Tracker />} />
              <Route path="settings" element={<SettingsPage />} />
              {/* Old deep links and PWA shortcuts still point at /history, so
                  redirect rather than 404 into the catch-all. */}
              <Route path="history" element={<Navigate to="/app" replace />} />
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Route>

            {/* /settings and /history moved under /app: keep old bookmarks and
                stale URLs working. */}
            <Route path="/settings" element={<Navigate to="/app/settings" replace />} />
            <Route path="/history" element={<Navigate to="/app" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
};

export default App;
