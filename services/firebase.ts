import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, enableMultiTabIndexedDbPersistence, connectFirestoreEmulator } from 'firebase/firestore';

const requiredEnvVars = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const optionalKeys = ['measurementId'] as const;

const toEnvVarName = (key: string): string => {
  return `VITE_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
};

const missingVars = Object.entries(requiredEnvVars)
  .filter(([key, value]) => !value && !(optionalKeys as readonly string[]).includes(key))
  .map(([key]) => toEnvVarName(key));

if (missingVars.length > 0) {
  throw new Error(
    `Missing required Firebase environment variables: ${missingVars.join(', ')}\n` +
    `Please create a .env file with these variables.`
  );
}

const firebaseConfig: Record<string, string> = {
  apiKey: requiredEnvVars.apiKey!,
  authDomain: requiredEnvVars.authDomain!,
  projectId: requiredEnvVars.projectId!,
  storageBucket: requiredEnvVars.storageBucket!,
  messagingSenderId: requiredEnvVars.messagingSenderId!,
  appId: requiredEnvVars.appId!,
};
if (requiredEnvVars.measurementId) {
  firebaseConfig.measurementId = requiredEnvVars.measurementId;
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

enableMultiTabIndexedDbPersistence(db).catch((err) => {
  if (import.meta.env.DEV) {
    if (err.code === 'failed-precondition') {
      console.warn('Persistence disabled: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Persistence not supported by this browser');
    }
  }
});

export default app;
