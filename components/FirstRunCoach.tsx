import React, { useState, useEffect, useCallback } from 'react';
import { Plus, LayoutGrid, Check } from 'lucide-react';

/**
 * First-run coach: three friendly cards that teach the core loop
 * (+ button -> pick a category -> type amount -> Save).
 *
 * Shown automatically the first time the home screen mounts. The dismissal is
 * stored in localStorage so it never nags twice; `replayFirstRunCoach()` opens
 * it on demand (used by the Settings footer).
 */

const COACH_KEY = 'kharcha_bachau_coach_seen';
const REPLAY_EVENT = 'kharcha-bachau:replay-tour';

export const replayFirstRunCoach = () => {
  window.dispatchEvent(new Event(REPLAY_EVENT));
};

const STEPS = [
  {
    Icon: Plus,
    title: 'Spent money? Tap +',
    body: 'Tap the big green + button at the bottom whenever you pay for something.',
  },
  {
    Icon: LayoutGrid,
    title: 'Pick what it was',
    body: 'Choose Food, Bus, School — whatever matches. No typing needed.',
  },
  {
    Icon: Check,
    title: 'Type the amount, press Save',
    body: "That's it. Your spending shows up here by itself.",
  },
];

const FirstRunCoach: React.FC = () => {
  const [visible, setVisible] = useState<boolean>(() => {
    try {
      return !localStorage.getItem(COACH_KEY);
    } catch {
      // Storage disabled — still show it; worst case it shows again next visit.
      return true;
    }
  });
  const [step, setStep] = useState(0);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(COACH_KEY, 'v1');
    } catch {
      // Dismissal cannot be remembered; just close for this session.
    }
    setVisible(false);
    setStep(0);
  }, []);

  useEffect(() => {
    const replay = () => {
      setStep(0);
      setVisible(true);
    };
    window.addEventListener(REPLAY_EVENT, replay);
    return () => window.removeEventListener(REPLAY_EVENT, replay);
  }, []);

  if (!visible) return null;

  const { Icon, title, body } = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/70" role="dialog" aria-modal="true" aria-labelledby="coach-title">
      <div className="bg-white rounded-3xl p-6 max-w-xs w-full text-center shadow-2xl animate-scale-in">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Icon size={32} className="text-emerald-700" strokeWidth={2.5} />
        </div>
        <h2 id="coach-title" className="text-xl font-extrabold text-slate-900 mb-2">{title}</h2>
        <p className="text-base text-slate-600 mb-5 leading-relaxed">{body}</p>
        <div className="flex items-center justify-center gap-2 mb-5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-2.5 rounded-full transition-all ${i === step ? 'w-7 bg-emerald-600' : 'w-2.5 bg-slate-200'}`} />
          ))}
        </div>
        <div className="flex gap-2">
          {step > 0 ? (
            <button onClick={() => setStep(s => s - 1)} className="btn-secondary flex-1">
              Back
            </button>
          ) : (
            <button onClick={dismiss} className="btn-secondary flex-1">
              Skip
            </button>
          )}
          {isLast ? (
            <button onClick={dismiss} className="btn-primary flex-1">
              Start
            </button>
          ) : (
            <button onClick={() => setStep(s => s + 1)} className="btn-primary flex-1">
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(FirstRunCoach);
