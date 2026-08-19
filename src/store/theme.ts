import { useEffect, useState } from 'react';
import type { ThemePref } from '../types';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function resolveDark(pref: ThemePref): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return window.matchMedia(DARK_QUERY).matches;
}

/**
 * Applies the theme to the document and reports back whether dark is active,
 * so charts can pick their colour set. Follows the OS when the preference is
 * "system", including live changes while the app is open.
 */
export function useTheme(pref: ThemePref): boolean {
  const [dark, setDark] = useState(() => resolveDark(pref));

  useEffect(() => {
    const apply = () => {
      const next = resolveDark(pref);
      setDark(next);
      document.documentElement.classList.toggle('dark', next);
    };

    apply();
    if (pref !== 'system') return;

    const mq = window.matchMedia(DARK_QUERY);
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [pref]);

  return dark;
}

/** Whether the user has asked the OS to reduce motion. Re-reads on change. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
