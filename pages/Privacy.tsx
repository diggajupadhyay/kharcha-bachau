import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const Privacy: React.FC = () => {
  const navigate = useNavigate();

  // navigate(-1) walks the browser history, which leaves the app entirely when
  // /privacy is the entry point — someone opening the policy link from outside had
  // their only "back" button take them off the site.
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/', { replace: true });
  };

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
            onClick={goBack}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white border border-slate-200 active:scale-95 hover:bg-slate-100 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900">Privacy Policy</h1>
        </div>

        <div className="bg-white p-4 md:p-6 rounded-xl border border-slate-200 space-y-4 text-sm text-slate-700 leading-relaxed">
          <p className="text-xs text-slate-500">Last updated: October 2026</p>

          <section>
            <h2 className="font-semibold text-slate-900 mb-1">1. Overview</h2>
            <p>
              Kharcha Bachau (खर्च बचाउ) is a free expense tracker for Android. This policy explains what
              data we collect, how it is stored, and your rights. By using the app you agree to this
              policy.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-slate-900 mb-1">2. Guest Mode (No Account)</h2>
            <p>
              The app works with no account and asks for none. If you use Guest Mode, your expenses,
              wallets, people and budget are stored only in the app's private storage on this device.
              That data is never transmitted to us or anyone else. Clearing the app's data, uninstalling
              it, or using a different device will remove it — so export a backup if you want to keep
              it.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-slate-900 mb-1">3. Cloud Sync (Signed In)</h2>
            <p>
              Signing in with Google is optional. If you do, your wallets, expenses, custom categories
              and budgets are stored in Google Firebase (Firestore) under your Google user ID, so they
              sync across your own devices. We store your email address and display name solely to
              identify your account and to show who owes whom in a shared wallet. Signing out returns
              the app to Guest Mode; it does not delete your cloud data.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-slate-900 mb-1">4. What We Do Not Collect</h2>
            <p>
              The app has no advertisements, no analytics, no crash reporting service and no
              tracking of any kind. We do not ask for your contacts, location, photos, files or
              usage history, and we never sell or share your data for anyone else's benefit. The
              only network requests the app makes are to Google Firebase for sign-in and, if you
              use it, cloud sync — plus the app's own update check.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-slate-900 mb-1">5. Data We Hold</h2>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2">Data</th>
                    <th className="text-left font-semibold px-3 py-2">When</th>
                    <th className="text-left font-semibold px-3 py-2">Where</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-3 py-2">Expenses — amount, category, note, date</td>
                    <td className="px-3 py-2">Always, on device</td>
                    <td className="px-3 py-2">Device; also Firebase if signed in</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Wallets, budgets, people you split with</td>
                    <td className="px-3 py-2">Always, on device</td>
                    <td className="px-3 py-2">Device; also Firebase if signed in</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Your custom categories</td>
                    <td className="px-3 py-2">Always, on device</td>
                    <td className="px-3 py-2">Device; also Firebase if signed in</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Google account ID, email and display name</td>
                    <td className="px-3 py-2">Only if you sign in</td>
                    <td className="px-3 py-2">Firebase and Google sign-in</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Google account IDs of people you invite</td>
                    <td className="px-3 py-2">Only for a shared wallet</td>
                    <td className="px-3 py-2">Firebase</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="font-semibold text-slate-900 mb-1">6. Signing In on Another Device</h2>
            <p>
              If you logged expenses on a device while signed out and then sign in there, those
              unsynced expenses are added to your account so they are not lost. This is a one-time
              merge, not a continuous transfer. To avoid the surprise, sign in before logging
              anything on a new device, or clear the device's data after signing in.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-slate-900 mb-1">7. Shared Wallets</h2>
            <p>
              A shared wallet stores the Google user IDs of the people you invite, along with the
              display names they choose to publish, so balances and splits can be attributed. People
              you add by name only, for splitting on one device, never leave your device.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-slate-900 mb-1">8. Security</h2>
            <p>
              Access to cloud data is enforced by Firebase Security Rules, so only you — and people you
              explicitly invite to a shared wallet — can read or write it. The Firebase configuration
              keys bundled in the app are public by design and are not secrets; the rules, not the
              keys, are the security boundary. All data is encrypted in transit.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-slate-900 mb-1">9. Your Rights & Data Deletion</h2>
            <p>
              Guest data can be erased at any time from Settings → Clear all data. To remove a signed-in
              account and everything synced to it, use Settings → Delete my account, which deletes the
              cloud data and signs you out. This is permanent and we keep no backup copy. You can also
              delete your data by removing the app and, if you had signed in, by deleting the account
              first. Signing out alone does not delete cloud data — use Delete my account for that.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-slate-900 mb-1">10. Children</h2>
            <p>
              The app is intended for users aged 13 and over and is not directed at children. It
              collects no information from anyone, signed in or not, beyond the account details
              described above from an adult who chooses to sign in.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-slate-900 mb-1">11. Contact</h2>
            <p>
              For privacy questions, or to request deletion of your data, email{' '}
              <a
                href="mailto:me@diggajupadhyay.com.np"
                className="font-medium text-emerald-700 underline break-all"
              >
                me@diggajupadhyay.com.np
              </a>
              . We respond within 30 days.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default React.memo(Privacy);