import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, AuthContextType } from '../types';
import { auth } from '../services/firebase';
import * as storage from '../services/storageService';
import { onAuthStateChanged, signOut, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, deleteUser } from 'firebase/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const GUEST_STORAGE_KEY = 'kharcha_bachau_guest_v1';

const googleProvider = new GoogleAuthProvider();

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const createGuestUser = (): User => {
    return {
      id: 'guest_' + crypto.randomUUID(),
      name: 'Guest',
      type: 'guest',
      email: '',
      createdAt: Date.now()
    };
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        localStorage.removeItem(GUEST_STORAGE_KEY);
        setUser({
          id: firebaseUser.uid,
          name: firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'User'),
          email: firebaseUser.email || '',
          type: 'user',
          createdAt: firebaseUser.metadata.creationTime ? new Date(firebaseUser.metadata.creationTime).getTime() : Date.now()
        });
        setIsLoading(false);
      } else {
        const guestData = localStorage.getItem(GUEST_STORAGE_KEY);

        if (guestData) {
            // Valid JSON is not enough. "null", a number, or an object missing `type`
            // all parsed cleanly and were installed as the current user; the rest of
            // the app then read `user.type !== 'guest'` as true and tried to write to
            // Firestore under a `guest_…` id, where every request is denied.
            let restored: User | null = null;
            try {
              const parsed = JSON.parse(guestData);
              if (parsed && typeof parsed === 'object' && parsed.type === 'guest' && typeof parsed.id === 'string' && parsed.id.length > 0) {
                restored = { ...parsed, name: parsed.name || 'Guest', email: parsed.email || '' } as User;
              }
            } catch (error) {
              if (import.meta.env.DEV) {
                console.error('Error parsing guest data:', error);
              }
            }
            if (restored) {
              setUser(restored);
            } else {
              const newGuest = createGuestUser();
              localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(newGuest));
              setUser(newGuest);
            }
        } else {
            const newGuest = createGuestUser();
            localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(newGuest));
            setUser(newGuest);
        }
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Both of these mean "the user backed out", not "sign-in failed". Only the first was
  // filtered before, so opening the Google sheet twice (or tapping away from it)
  // raised a red "Could not sign in" toast on a perfectly normal cancellation.
  const USER_CANCELLED = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'];

  const signInWithGoogle = async () => {
    setIsLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error.code === 'auth/popup-blocked') {
        try {
          await signInWithRedirect(auth, googleProvider);
          // The browser is navigating away, so the spinner is about to be discarded.
          // Left as-is it would strand the UI on a spinner if the navigation is
          // blocked (embedded webviews, strict extensions).
          setIsLoading(false);
          return;
        } catch (redirectError: any) {
          setIsLoading(false);
          if (!USER_CANCELLED.includes(redirectError.code)) {
            throw redirectError;
          }
          return;
        }
      }
      setIsLoading(false);
      if (!USER_CANCELLED.includes(error.code)) {
        if (import.meta.env.DEV) {
          console.error('Google sign-in error:', error.code, error.message);
        }
        throw error;
      }
    }
  };

  useEffect(() => {
    getRedirectResult(auth).then((result) => {
      if (result) {
        setIsLoading(false);
      }
    }).catch((error) => {
      setIsLoading(false);
      if (import.meta.env.DEV) {
        console.error('Redirect sign-in error:', error.code, error.message);
      }
    });
  }, []);

  const continueAsGuest = () => {
    const newGuest = createGuestUser();
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(newGuest));
    setUser(newGuest);
  };

  const logout = async () => {
    try {
        await signOut(auth);
        localStorage.removeItem(GUEST_STORAGE_KEY);
        continueAsGuest();
    } catch (error) {
        if (import.meta.env.DEV) {
            console.error("Logout failed", error);
        }
    }
  };

  const deleteAccount = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      // No Firebase account (guest): just clear local data.
      await storage.deleteAccount({
        id: 'guest',
        name: 'Guest',
        type: 'guest',
        email: '',
        createdAt: Date.now()
      });
      continueAsGuest();
      return;
    }

    try {
      // Delete all Firestore data first (needs an authenticated session). This throws
      // if any of it could not be removed, which deliberately prevents the auth user
      // below from being deleted — otherwise the data would be stranded with no
      // account left that is allowed to delete it.
      await storage.deleteAccount({
        id: currentUser.uid,
        name: currentUser.displayName || 'User',
        email: currentUser.email || '',
        type: 'user',
        createdAt: Date.now()
      });
      // Then delete the auth user itself.
      await deleteUser(currentUser);
      localStorage.removeItem(GUEST_STORAGE_KEY);
      continueAsGuest();
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error('Account deletion failed:', error);
      }
      if (error.code === 'auth/requires-recent-login') {
        throw new Error('Please sign out and sign in again before deleting your account.');
      }
      // Keep the specific reason from the data layer — it names which wallets could
      // not be cleared, which a flat "please try again" would throw away.
      if (error instanceof Error && error.message) {
        throw error;
      }
      throw new Error('Failed to delete account. Please try again.');
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signInWithGoogle, logout, continueAsGuest, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
};