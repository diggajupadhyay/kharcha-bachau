import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { CloudUser } from './lib/cloud';

/**
 * Firebase is optional. `lib/cloud.ts` is required lazily rather than imported at
 * the top so that a missing or mismatched google-services.json cannot take down
 * the local-only app — a guest must still be able to track expenses with no
 * account, no network and no cloud config.
 */
type CloudModule = typeof import('./lib/cloud');
let cloudModule: CloudModule | null = null;
let cloudLoadError: string | null = null;

export const getCloud = (): CloudModule => {
  if (cloudModule) return cloudModule;
  if (cloudLoadError) throw new Error(cloudLoadError as string);
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cloudModule = require('./lib/cloud') as CloudModule;
    return cloudModule;
  } catch (e: any) {
    const message = e?.message ?? 'Cloud features are unavailable.';
    cloudLoadError = message;
    throw new Error(message);
  }
};

/** True when Firebase is present and usable, without throwing. */
export const cloudAvailable = (): boolean => {
  try { getCloud(); return true; } catch { return false; }
};

export type SessionUser =
  | { type: 'guest' }
  | { type: 'cloud'; uid: string; displayName: string; email: string };

interface AuthContextValue {
  user: SessionUser;
  isLoading: boolean;
  signIn: () => Promise<SessionUser | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

const toSession = (user: CloudUser | null): SessionUser =>
  user ? { type: 'cloud', uid: user.uid, displayName: user.displayName, email: user.email } : { type: 'guest' };

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SessionUser>({ type: 'guest' });
  // Starts true so a signed-in user never sees a flash of empty guest state.
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // No Firebase config means no session to restore — stay a guest and move on.
    if (!cloudAvailable()) {
      setUser({ type: 'guest' });
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const unsubscribe = getCloud().subscribeToAuth(cloudUser => {
      if (cancelled) return;
      if (cloudUser) {
        void getCloud().ensureUserDoc(cloudUser).catch(() => undefined);
      }
      setUser(toSession(cloudUser));
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      try { unsubscribe(); } catch { /* already detached */ }
    };
  }, []);

  const signIn = useCallback(async (): Promise<SessionUser | null> => {
    const cloud = getCloud();
    const cloudUser = await cloud.signInWithGoogle();
    if (!cloudUser) return null;                 // user cancelled — not an error
    await cloud.ensureUserDoc(cloudUser);
    const session = toSession(cloudUser);
    setUser(session);
    return session;
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    if (cloudAvailable()) await getCloud().signOutCloud();
    setUser({ type: 'guest' });
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, signIn, signOut }),
    [user, isLoading, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
