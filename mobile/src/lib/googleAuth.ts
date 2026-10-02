import { GoogleOneTapSignIn } from 'react-native-nitro-google-signin';
import { Platform } from 'react-native';

export interface GoogleCredential {
  idToken: string;
  name?: string;
  email?: string;
  /**
   * Set only by the browser implementation.
   *
   * A popup completes the whole sign-in itself — Firebase has already authenticated
   * the user on the shared auth instance by the time it returns. There is no ID token
   * left to exchange, so the caller must skip `signInWithCredential`. Without this
   * flag the browser path passed a UID where a token was expected and failed.
   */
  alreadySignedIn?: boolean;
}

/**
 * A reason the user did not complete sign-in, mapped to copy a person can act on.
 * Shared with the web implementation so both report failures the same way.
 */
export const googleSignInHint = (type: string): string => {
  switch (type) {
    case 'cancelled':
      return 'Sign-in was cancelled.';
    case 'noSavedCredentialFound':
      // Credential Manager reports a misconfigured OAuth client — an unregistered
      // signing fingerprint, or a package name that does not match — under this same
      // code as "no account on the device". The two are indistinguishable from the
      // client, so name both rather than send the user hunting for the wrong thing.
      return 'Either no Google account is on this device, or the app\'s signing '
        + 'fingerprint is not registered with Firebase yet (that takes a few minutes '
        + 'to take effect).';
    default:
      return 'Please try again in a moment.';
  }
};

let configured = false;

const configure = (): void => {
  if (configured) return;
  // 'autoDetect' reads default_web_client_id out of google-services.json, so the
  // client id does not have to be duplicated in app.json.
  GoogleOneTapSignIn.configure({ webClientId: 'autoDetect' });
  configured = true;
};

/**
 * Obtains a Google ID token using the native Credential Manager flow.
 * Returns null only when the user genuinely backed out; everything else throws.
 *
 * Split out of cloud.ts because `react-native-nitro-google-signin` ships only
 * android/ and ios/ — there is no web build of it, so importing it directly made
 * the web bundle depend on a module that cannot exist in a browser. The web build
 * substitutes googleAuth.web.ts, which uses the browser's own OAuth redirect.
 */
export const requestGoogleIdToken = async (): Promise<GoogleCredential | null> => {
  configure();

  if (Platform.OS === 'android') {
    // Rejects up front with a resolvable Play Services problem, rather than a
    // confusing failure deep inside Credential Manager.
    await GoogleOneTapSignIn.checkPlayServices(true);
  }

  const response = await GoogleOneTapSignIn.signIn();
  if (response.type === 'cancelled') return null;
  if (response.type !== 'success' || !response.data?.idToken) {
    throw new Error(googleSignInHint(response.type));
  }
  return {
    idToken: response.data.idToken,
    name: response.data.user?.name ?? undefined,
    email: response.data.user?.email ?? undefined,
  };
};

/** Clears any native Google session. */
export const clearGoogleSession = async (): Promise<void> => {
  await GoogleOneTapSignIn.signOut();
};