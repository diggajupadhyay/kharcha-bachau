import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import ErrorBoundary from './components/ErrorBoundary';

const Privacy = React.lazy(() => import('./pages/Privacy'));

const App: React.FC = () => (
  <BrowserRouter>
    <ErrorBoundary>
      <Suspense fallback={
        <div className="h-[100dvh] flex items-center justify-center bg-slate-50">
          <div className="h-10 w-10 rounded-full border-[3px] border-slate-200 border-t-emerald-600 animate-spin" />
        </div>
      }>
        <Routes>
          <Route path="/" element={<Landing />} />
          {/* /release is a static download page (public/release/index.html) — it is
              served before these rewrites ever apply. */}
          <Route path="/privacy" element={<Privacy />} />
          {/* Old deep links from the app era: the webapp was replaced by the Android
              app, so stale URLs land on the landing page. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  </BrowserRouter>
);

export default App;
