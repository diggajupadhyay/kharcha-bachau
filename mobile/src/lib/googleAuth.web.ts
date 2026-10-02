import { GoogleAuthProvider, getAuth, signInWithPopup } from 'firebase/auth';

import { firebaseApp } from './firebaseApp';
import { googleSignInHint, type GoogleCredential } from './googleAuth';

/**
 * Browser sign-in.
 *
 * `react-native-nitro-google-signin` is Android/iOS only, so Credential Manager does
 * not exist here. The browser equivalent is a popup against the same OAuth client,
 * which Firebase Auth already knows how to complete.
 *
 * The popup is the only option that survives a refresh-based sign-in: a redirect
 * would unload the page and lose the in-progress app state.
 *
 * Unlike the native flow this does not hand back an ID token. The popup *is* the
 * sign-in — by the time it resolves, Firebase has already signed the user in on the
 * auth instance below, which is the same one `cloud.ts` uses, so the caller reads the
 * signed-in user directly instead of exchanging a credential. See `alreadySignedIn`
 * on GoogleCredential.
 */
export const requestGoogleIdToken = async (): Promise<GoogleCredential | null> => {
  if (!firebaseApp) throw new Error(googleSignInHint('unknown'));

  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    // The app handle is passed explicitly rather than relying on `getAuth()` with no
    // argument, so this cannot silently attach to a different default app than the
    // one the rest of the cloud layer is using.
    const result = await signInWithPopup(getAuth(firebaseApp), provider);

    const profile = result.user;
    if (!profile) throw new Error('Google sign-in did not return an account');

    return {
      idToken: '',
      alreadySignedIn: true,
      name: profile.displayName ?? undefined,
      email: profile.email ?? '',
    };
  } catch (e: any) {
    // Only a dismissed popup is a genuine cancel. Firebase reports it by code, and
    // everything else — popup blocked, wrong origin, network — is a real failure
    // that must surface rather than leaving the button looking inert.
    const code = e?.code ?? '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return null;
    if (code === 'auth/popup-blocked') {
      throw new Error(googleSignInHint('unknown'));
    }
    const detail = e?.message ? String(e.message) : googleSignInHint('unknown');
    throw new Error(`Google sign-in failed. ${detail}`);
  }
};

/** A popup needs no server-side session to clear; `signOut` in cloud.ts is enough. */
export const clearGoogleSession = async (): Promise<void> => {};