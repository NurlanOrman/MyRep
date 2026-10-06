import { useEffect, useState } from 'react';

export type ThemePref = 'system' | 'dark' | 'light';
const KEY = 'load-profit:theme';

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(t: ThemePref) {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemePref>(read);
  useEffect(() => applyTheme(theme), [theme]);
  const setTheme = (t: ThemePref) => {
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
    setThemeState(t);
  };
  return { theme, setTheme };
}

applyTheme(typeof window !== 'undefined' ? read() : 'system');
