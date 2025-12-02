import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, AuthContextType } from '../types';
import { auth } from '../services/firebase';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const GUEST_STORAGE_KEY = 'kharcha_bachau_guest_v1';
const OLD_GUEST_STORAGE_KEY = 'veggie_nepal_guest_v1'; // For migration

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Helper to create guest
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
    // Migrate old storage key if it exists
    const oldGuestData = localStorage.getItem(OLD_GUEST_STORAGE_KEY);
    if (oldGuestData) {
      try {
        // Migrate to new key
        localStorage.setItem(GUEST_STORAGE_KEY, oldGuestData);
        // Remove old key
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

    // Subscribe to Firebase Auth state
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      if (firebaseUser) {
        // Logged in via Firebase
        localStorage.removeItem(GUEST_STORAGE_KEY); // Clear guest session
        localStorage.removeItem(OLD_GUEST_STORAGE_KEY); // Also clear old key
        setUser({
          id: firebaseUser.uid,
          name: firebaseUser.email ? firebaseUser.email.split('@')[0] : 'User',
          email: firebaseUser.email || '',
          type: 'user',
          createdAt: 0 // Fetch from metadata if needed, usually managed by DB
        });
        setIsLoading(false);
      } else {
        // Not logged in via Firebase
        // Check local storage (new key first, then old for migration)
        let guestData = localStorage.getItem(GUEST_STORAGE_KEY);
        
        if (!guestData) {
          // Try old key for migration
          guestData = localStorage.getItem(OLD_GUEST_STORAGE_KEY);
          if (guestData) {
            // Migrate to new key
            localStorage.setItem(GUEST_STORAGE_KEY, guestData);
            localStorage.removeItem(OLD_GUEST_STORAGE_KEY);
          }
        }
        
        if (guestData) {
            try {
              setUser(JSON.parse(guestData));
            } catch (error) {
              // Invalid data, create new guest
              if (import.meta.env.DEV) {
                console.error('Error parsing guest data:', error);
              }
              const newGuest = createGuestUser();
              localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(newGuest));
              setUser(newGuest);
            }
        } else {
            // AUTO GUEST: If no user at all, create guest immediately
            const newGuest = createGuestUser();
            localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(newGuest));
            setUser(newGuest);
        }
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
        await auth.signInWithEmailAndPassword(email, password);
        // Auth state change will be handled by onAuthStateChanged listener
    } catch (error: any) {
        setIsLoading(false);
        // Log error in development
        if (import.meta.env.DEV) {
            console.error('Login error:', error.code, error.message);
        }
        // Re-throw with user-friendly error
        throw error;
    }
  };

  const signup = async (email: string, password: string) => {
    setIsLoading(true);
    try {
        await auth.createUserWithEmailAndPassword(email, password);
        // Auth state change will be handled by onAuthStateChanged listener
        if (import.meta.env.DEV) {
            console.log('User signed up successfully');
        }
    } catch (error: any) {
        setIsLoading(false);
        // Log error in development
        if (import.meta.env.DEV) {
            console.error('Signup error:', error.code, error.message);
        }
        // Re-throw with user-friendly error
        throw error;
    }
  };

  const continueAsGuest = () => {
    const newGuest = createGuestUser();
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(newGuest));
    setUser(newGuest);
  };

  const resetPassword = async (email: string) => {
    try {
      await auth.sendPasswordResetEmail(email);
      if (import.meta.env.DEV) {
        console.log('Password reset email sent');
      }
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error('Password reset error:', error.code, error.message);
      }
      throw error;
    }
  };

  const logout = async () => {
    try {
        await auth.signOut();
        localStorage.removeItem(GUEST_STORAGE_KEY);
        localStorage.removeItem(OLD_GUEST_STORAGE_KEY); // Also clear old key
        // On logout, fallback to auto-guest
        continueAsGuest();
    } catch (error) {
        if (import.meta.env.DEV) {
            console.error("Logout failed", error);
        }
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout, continueAsGuest, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
};