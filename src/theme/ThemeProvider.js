import React, { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import * as SystemUI from 'expo-system-ui';
import { Colors, getScheme, subscribeScheme } from './runtime';

const ThemeContext = createContext({ scheme: 'light', isDark: false, colors: Colors });

/** Current device scheme ('light' | 'dark'); re-renders when it changes. */
export const useColorSchemeLive = () => useSyncExternalStore(subscribeScheme, getScheme, getScheme);

/**
 * Provides { scheme, isDark, colors } and keeps the native root background in
 * sync so there is no white flash behind screens/keyboard in dark mode.
 */
export const ThemeProvider = ({ children }) => {
  const scheme = useColorSchemeLive();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(Colors.background).catch(() => {});
  }, [scheme]);

  const value = useMemo(
    () => ({ scheme, isDark: scheme === 'dark', colors: Colors }),
    [scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
