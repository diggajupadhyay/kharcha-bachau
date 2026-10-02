import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Theme, ThemeName, lightTheme, darkTheme } from './tokens';

const STORAGE_KEY = 'kb_theme_v1';

interface ThemeContextValue {
  theme: Theme;
  /** What the user chose: an explicit light/dark, or follow the system. */
  preference: ThemeName | 'system';
  setPreference: (p: ThemeName | 'system') => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
};

/** Shorthand for the common case — screens almost always want the tokens. */
export const useTokens = (): Theme => useTheme().theme;

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemeName | 'system'>('system');

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then(stored => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreferenceState(stored);
      }
    });
  }, []);

  const setPreference = useCallback((p: ThemeName | 'system') => {
    setPreferenceState(p);
    void AsyncStorage.setItem(STORAGE_KEY, p);
  }, []);

  const theme = useMemo(() => {
    const resolved = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
    return resolved === 'dark' ? darkTheme : lightTheme;
  }, [preference, system]);

  const value = useMemo(() => ({ theme, preference, setPreference }), [theme, preference, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
