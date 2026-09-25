import React from 'react';
import { Link } from 'react-router-dom';
import { Smartphone, WifiOff, Users, Divide, PiggyBank, Download, ChevronDown } from 'lucide-react';

// Prefetch the app bundle when a link to /app is hovered, focused or pressed,
// so loading starts before navigation commits.
const preloadApp = () => {
  void import('../AppShell');
};

const appLink = {
  to: '/app' as const,
  onMouseEnter: preloadApp,
  onFocus: preloadApp,
  onPointerDown: preloadApp,
};

const FEATURES: Array<{ icon: typeof Smartphone; title: string; text: string }> = [
  {
    icon: Smartphone,
    title: 'Works without an account',
    text: 'Open the app and start tracking. Expenses are saved to your device by default, with no sign-up.',
  },
  {
    icon: WifiOff,
    title: 'Works offline',
    text: 'After your first visit the app is cached and opens without a network connection.',
  },
  {
    icon: Users,
    title: 'Shared wallets',
    text: 'Track together with your household or travel group. Members join with a 6-character invite code.',
  },
  {
    icon: Divide,
    title: 'Split expenses',
    text: 'Split equally, choose who paid, and see exactly who owes whom.',
  },
  {
    icon: PiggyBank,
    title: 'Monthly budget',
    text: 'Set a spending limit for each wallet and watch progress through the month.',
  },
  {
    icon: Download,
    title: 'Your data is portable',
    text: 'Export to CSV anytime, or back up and restore a full JSON copy.',
  },
];

const STEPS = [
  {
    title: 'Open the app',
    text: 'No sign-up. Your first expense is saved to your device right away.',
  },
  {
    title: 'Log expenses in seconds',
    text: 'Tap +, enter the amount, pick a category, and add a note if you want.',
  },
  {
    title: 'Share or export',
    text: 'Invite your household or travel group with a code, or export your data anytime.',
  },
];

const FAQS: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: 'Is Kharcha Bachau free?',
    a: 'Yes. Every feature, including shared wallets and exports, is free.',
  },
  {
    q: 'Do I need an account?',
    a: 'No. Expenses are stored on your device by default. Signing in with Google is optional and keeps everything in sync across your devices.',
  },
  {
    q: 'Does it work offline?',
    a: 'Yes. After your first visit, the app is cached and opens without a network connection.',
  },
  {
    q: 'Who can see my expenses?',
    a: (
      <>
        Only you. Data stays on your device unless you sync or share a wallet, and shared wallets
        are visible only to their members. Details in the{' '}
        <Link
          to="/privacy"
          className="font-semibold text-emerald-600 underline underline-offset-2 hover:text-emerald-700"
        >
          privacy policy
        </Link>
        .
      </>
    ),
  },
];

const Landing: React.FC = () => {
  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link
            to="/"
            className="flex items-center gap-2.5 rounded-lg focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            aria-label="Kharcha Bachau home"
          >
            <img src="/icon-192.png" alt="" width={30} height={30} className="rounded-[9px]" />
            <span className="text-[17px] font-bold tracking-tight">Kharcha Bachau</span>
          </Link>
          <Link
            {...appLink}
            className="inline-flex h-10 items-center rounded-xl bg-emerald-600 px-4 text-[15px] font-bold text-white transition-all hover:bg-emerald-700 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            Open App
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="px-4 pb-16 pt-14 text-center sm:px-6 sm:pb-24 sm:pt-24">
          <p className="mx-auto w-fit rounded-full border border-emerald-100 bg-emerald-50 px-3.5 py-1.5 text-[13px] font-semibold text-emerald-700">
            <span lang="ne">खर्च बचाउ</span> — Nepali for “save expenses”
          </p>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl">
            Know where your money goes.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl">
            Kharcha Bachau is a free daily expense tracker that works offline, keeps your data on
            your device, and needs no account.
          </p>
          <div className="mt-8 flex justify-center">
            <Link {...appLink} className="btn-primary w-full max-w-xs sm:w-auto">
              Start tracking — free
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="border-y border-slate-100 bg-slate-50/60 px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto w-full max-w-5xl">
            <p className="section-title">Features</p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Track spending alone or together
            </h2>
            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Icon size={22} strokeWidth={2} />
                  </div>
                  <h3 className="mt-4 font-bold">{title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto w-full max-w-5xl">
            <p className="section-title">How it works</p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Three steps, no setup</h2>
            <ol className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-4">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex items-start gap-4 sm:flex-col sm:gap-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-bold">{step.title}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-slate-600">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Android */}
        <section className="px-4 pb-16 sm:px-6 sm:pb-24">
          <div className="mx-auto w-full max-w-5xl rounded-3xl bg-slate-900 px-6 py-12 text-center sm:px-12 sm:py-16">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Android app in the works
            </h2>
            <p className="mx-auto mt-4 max-w-xl leading-relaxed text-slate-300">
              Kharcha Bachau for Android is planned. Until then, add the web app to your home
              screen — it installs from the browser and works offline the same way.
            </p>
            <Link
              {...appLink}
              className="mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-white/10 px-5 text-[15px] font-bold text-white transition-colors hover:bg-white/15"
            >
              Open the web app
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-slate-100 px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto w-full max-w-2xl">
            <p className="section-title">FAQ</p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Common questions</h2>
            <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
              {FAQS.map((faq) => (
                <details key={faq.q} className="group">
                  <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 py-4 font-bold [&::-webkit-details-marker]:hidden">
                    {faq.q}
                    <ChevronDown
                      size={20}
                      className="flex-shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <p className="pb-5 pr-8 text-[15px] leading-relaxed text-slate-600">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-100 px-4 py-10 sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <img src="/icon-192.png" alt="" width={22} height={22} className="rounded-md" />
            <span className="text-sm font-bold">Kharcha Bachau</span>
          </div>
          <div className="flex items-center gap-5 text-sm text-slate-500">
            <Link to="/privacy" className="rounded transition-colors hover:text-slate-900">
              Privacy
            </Link>
            <span>Made in Nepal</span>
            <span>v{__APP_VERSION__}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
