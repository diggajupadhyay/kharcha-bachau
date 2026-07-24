import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const Privacy: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-full bg-slate-50 overflow-x-hidden"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
        paddingBottom: 'calc(9rem + env(safe-area-inset-bottom, 0px))'
      }}
    >
      <div className="pt-3 px-3 md:px-5 lg:px-6 max-w-2xl mx-auto">
        <div className="mb-5 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white border border-slate-200 active:scale-95 hover:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900">Privacy Policy</h1>
        </div>

        <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 space-y-4 text-sm text-slate-700 leading-relaxed">
          <p className="text-xs text-slate-500">Last updated: July 2026</p>

          <section>
            <h2 className="font-semibold text-slate-900 mb-1">1. Overview</h2>
            <p>
              Kharcha Bachau (खर्च बचाउ) is a free expense tracker. This policy explains what data we
              collect, how it is stored, and your rights. By using the app you agree to this policy.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-slate-900 mb-1">2. Guest Mode (No Account)</h2>
            <p>
              If you use Guest Mode, all your expenses, wallets, and categories are stored only in your
              browser's local storage on this device. This data never leaves your device and is not
              transmitted to us. Clearing your browser data or using a different device will remove it.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-slate-900 mb-1">3. Cloud Sync (Signed In)</h2>
            <p>
              When you sign in with Google, your wallets, expenses, categories, and budget are stored in
              Firebase Firestore under your user ID. Your email and display name are stored to identify
              your account. Shared wallets also store the user IDs of members you invite.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-slate-900 mb-1">4. Security</h2>
            <p>
              Access to your cloud data is protected by Firebase Security Rules so that only you (and
              people you invite to a shared wallet) can read or write it. Firebase configuration keys
              embedded in the app are public by design and are not secrets.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-slate-900 mb-1">5. Your Rights & Data Deletion</h2>
            <p>
              You can delete your account and all associated cloud data at any time from Settings →
              Delete Account. Guest data can be cleared from the same screen. After deletion we retain
              no copy of your expense data.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-slate-900 mb-1">6. Contact</h2>
            <p>
              For privacy questions, contact the developer through the project repository.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default React.memo(Privacy);