import { useEffect, useState } from 'react';

/**
 * Reads a media query and keeps up with it.
 *
 * Used to pick a navigation shape rather than to hide things: the desktop
 * sidebar and the mobile drawer are genuinely different components, not one
 * component with things switched off.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** True from 1024px up, where the sidebar layout takes over. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}
