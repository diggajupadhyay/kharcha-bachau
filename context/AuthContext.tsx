import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, AuthContextType } from '../types';
import { auth } from '../services/firebase';
import { onAuthStateChanged, signOut, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const GUEST_STORAGE_KEY = 'kharcha_bachau_guest_v1';
const OLD_GUEST_STORAGE_KEY = 'veggie_nepal_guest_v1';

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
    const oldGuestData = localStorage.getItem(OLD_GUEST_STORAGE_KEY);
    if (oldGuestData) {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, oldGuestData);
        localStorage.removeItem(OLD_GUEST_STORAGE_KEY);
        if (import.meta.env.DEV) {
          console.log('Migrated guest data from old storage key');
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error migrating guest data:', error);
        }
      }
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        localStorage.removeItem(GUEST_STORAGE_KEY);
        localStorage.removeItem(OLD_GUEST_STORAGE_KEY);
        setUser({
          id: firebaseUser.uid,
          name: firebaseUser.displayName || (firebaseUser.email ? firebaseUser.email.split('@')[0] : 'User'),
          email: firebaseUser.email || '',
          type: 'user',
          createdAt: firebaseUser.metadata.creationTime ? new Date(firebaseUser.metadata.creationTime).getTime() : Date.now()
        });
        setIsLoading(false);
      } else {
        let guestData = localStorage.getItem(GUEST_STORAGE_KEY);
        
        if (!guestData) {
          guestData = localStorage.getItem(OLD_GUEST_STORAGE_KEY);
          if (guestData) {
            localStorage.setItem(GUEST_STORAGE_KEY, guestData);
            localStorage.removeItem(OLD_GUEST_STORAGE_KEY);
          }
        }
        
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
      setIsLoading(false);
      if (error.code !== 'auth/popup-closed-by-user') {
        if (import.meta.env.DEV) {
          console.error('Google sign-in error:', error.code, error.message);
        }
        throw error;
      }
    }
  };

  const continueAsGuest = () => {
    const newGuest = createGuestUser();
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(newGuest));
    setUser(newGuest);
  };

  const logout = async () => {
    try {
        await signOut(auth);
        localStorage.removeItem(GUEST_STORAGE_KEY);
        localStorage.removeItem(OLD_GUEST_STORAGE_KEY);
        continueAsGuest();
    } catch (error) {
        if (import.meta.env.DEV) {
            console.error("Logout failed", error);
        }
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signInWithGoogle, logout, continueAsGuest }}>
      {children}
    </AuthContext.Provider>
  );
};
