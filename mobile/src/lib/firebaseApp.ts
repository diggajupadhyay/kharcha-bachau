import { getApps, type FirebaseApp } from '@react-native-firebase/app';

/**
 * Firebase app resolution for a phone.
 *
 * The native SDK reads `google-services.json` at startup, so by the time any module
 * runs there is normally nothing to construct. Split into a platform module because a
 * browser has no such file — FirebaseApp.web.ts initialises from JavaScript
 * configuration instead, and this file's "throw if missing" is the native behaviour
 * that check was written for.
 */
const [app] = getApps();

if (!app) {
  throw new Error(
    'Firebase did not initialise. Check that google-services.json exists and that its '
    + 'package_name matches this app\'s android package.'
  );
}

export const firebaseApp: FirebaseApp = app;