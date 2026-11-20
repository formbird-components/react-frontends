// Light, dark or the system's setting: the .dark class on <html> (the styles key off it), the
// choice remembered in this browser.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';

const ThemeContext = createContext<{ choice: ThemeChoice; setChoice: (c: ThemeChoice) => void; dark: boolean }>({ choice: 'system', setChoice: () => {}, dark: false });

const stored = (key: string): ThemeChoice => {
  try {
    const v = localStorage.getItem(key);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
};

/**
 * @param storageKey - Where the choice is kept (localStorage), one per app: e.g. "fleet-theme"
 */
export function ThemeProvider({ storageKey, children }: { storageKey: string; children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => stored(storageKey));
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  const dark = choice === 'dark' || (choice === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  const setChoice = (c: ThemeChoice) => {
    setChoiceState(c);
    try {
      localStorage.setItem(storageKey, c);
    } catch {
      // private mode: the choice lasts for this visit
    }
  };
  return <ThemeContext.Provider value={{ choice, setChoice, dark }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
