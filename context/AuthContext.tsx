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
            try {
              setUser(JSON.parse(guestData));
            } catch (error) {
              if (import.meta.env.DEV) {
                console.error('Error parsing guest data:', error);
              }
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

  const signInWithGoogle = async () => {
    setIsLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      if (error.code === 'auth/popup-blocked') {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectError: any) {
          setIsLoading(false);
          if (redirectError.code !== 'auth/popup-closed-by-user') {
            throw redirectError;
          }
          return;
        }
      }
      setIsLoading(false);
      if (error.code !== 'auth/popup-closed-by-user') {
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
      // Delete all Firestore data first (needs an authenticated session).
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
      throw new Error('Failed to delete account. Please try again.');
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signInWithGoogle, logout, continueAsGuest, deleteAccount }}>
      {children}
    </AuthContext.Provider>
  );
};