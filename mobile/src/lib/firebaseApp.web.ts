import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';

/**
 * Firebase app resolution for a browser.
 *
 * A web build has no `google-services.json` — that file is packaged into the APK — so
 * the native SDK's "already initialised" shortcut does not apply and the config has to
 * come from somewhere else. These variables are inlined at build time, which is the
 * standard way to ship a Firebase web config: every value here is public by design
 * and the security rules, not these keys, are the boundary.
 *
 * This uses the Firebase JS SDK's own `initializeApp` rather than
 * `@react-native-firebase/app`. That is deliberate. RNFB's web shim returns a Promise,
 * and the surrounding code needs a usable app *synchronously* — `cloud.ts` resolves
 * its handles on first use and `AuthContext` probes once and caches the answer. The
 * JS SDK's initialiser is synchronous, so the app genuinely exists by the time this
 * module finishes evaluating. The earlier attempt assigned the app inside a
 * `.then()` and then exported `app` directly, which captured `null` at module
 * evaluation and left the export null forever — cloud sync was silently dead in every
 * browser, with no error anywhere.
 *
 * The handle is interchangeable with the native one: `cloud.ts` passes whatever this
 * returns to RNFB's `getAuth`/`getFirestore`, which on the web shim operate on
 * standard Firebase JS objects.
 *
 * When the config is absent the app still runs — `cloudAvailable()` turns this into
 * guest mode — so a misconfigured web build is a working offline app rather than a
 * blank screen.
 */
const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const missing = Object.entries(config)
  .filter(([, v]) => !v)
  .map(([k]) => k);

let app: FirebaseApp | null = null;

if (missing.length === 0) {
  // Reuse an existing default app if something already created one, so initialising
  // twice is not an error.
  app = getApps()[0] ?? initializeApp({
    apiKey: config.apiKey as string,
    authDomain: config.authDomain as string,
    projectId: config.projectId as string,
    appId: config.appId as string,
  });
} else {
  // Not logged as an error: the app is designed to work with no account at all.
  console.warn(
    `[Kharcha Bachau] Cloud sync is off in this build — missing ${missing.join(', ')}. `
    + 'The app works offline; set these in EXPO_PUBLIC_* variables to enable sync.'
  );
}

/** Null when the EXPO_PUBLIC_* config is absent; cloudAvailable() turns that
 *  into guest mode rather than an error, which is the whole point of the
 *  local-first design. */
export const firebaseApp: FirebaseApp | null = app;