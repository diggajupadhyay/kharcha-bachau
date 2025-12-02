import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

// ⚠️ PRODUCTION CONFIGURATION
// Since this is a Client-Side PWA, these keys are publicly visible in the network tab.
// Security is handled by the Firestore Rules.

// Validate required environment variables
const requiredEnvVars = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Helper to convert camelCase to UPPER_SNAKE_CASE
const toEnvVarName = (key: string): string => {
  return `VITE_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
};

// Check for missing environment variables
const missingVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => toEnvVarName(key));

if (missingVars.length > 0) {
  throw new Error(
    `Missing required Firebase environment variables: ${missingVars.join(', ')}\n` +
    `Please create a .env file with these variables. See .env.example for reference.`
  );
}

const firebaseConfig = {
  apiKey: requiredEnvVars.apiKey!,
  authDomain: requiredEnvVars.authDomain!,
  projectId: requiredEnvVars.projectId!,
  storageBucket: requiredEnvVars.storageBucket!,
  messagingSenderId: requiredEnvVars.messagingSenderId!,
  appId: requiredEnvVars.appId!,
  measurementId: requiredEnvVars.measurementId!
};

// Initialize Firebase (Singleton pattern)
const app = !firebase.apps.length ? firebase.initializeApp(firebaseConfig) : firebase.app();

// Export Auth and Firestore services
export const auth = firebase.auth();
export const db = firebase.firestore();

// Enable offline persistence for Firestore
// Wrapped in try/catch to prevent annoying dev console errors
try {
    db.enablePersistence({ synchronizeTabs: true })
      .catch((err) => {
          if (import.meta.env.DEV) {
              if (err.code === 'failed-precondition') {
                  console.warn('Persistence disabled: Multiple tabs open');
              } else if (err.code === 'unimplemented') {
                  console.warn('Persistence not supported by this browser');
              }
          }
      });
} catch (e) {
    if (import.meta.env.DEV) {
        console.warn('Persistence init error', e);
    }
}

export default app;