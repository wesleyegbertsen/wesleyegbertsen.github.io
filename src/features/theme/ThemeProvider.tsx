import { useLayoutEffect, useState, type ReactNode } from 'react';
import { useLocalStorage } from '../../hooks/useLocalStorage.ts';
import { STORAGE_KEY, nextColorIndex, parseColorIndex } from '../matrix/matrix.ts';
import { applyTheme } from './applyTheme.ts';
import { ThemeContext } from './ThemeContext.ts';
import { THEMES } from './themes.ts';

/**
 * Owns the one colour the site is showing: the matrix colour and the theme are the same index,
 * stored under the matrix's key so a returning visitor gets the colour they left.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useLocalStorage(STORAGE_KEY, 0, { parse: parseColorIndex });
  // A theme shown for now and never stored (the terminal's `matrix`). It wins over the stored one while set.
  const [previewed, setPreviewed] = useState<number | null>(null);
  const index = previewed ?? stored;

  // Before paint on every change, so the page never shows the old theme next to the new rain.
  useLayoutEffect(() => {
    applyTheme(index);
  }, [index]);

  const isTheme = (next: number) => Number.isInteger(next) && next >= 0 && next < THEMES.length;

  const value = {
    index,
    theme: THEMES[index] ?? THEMES[0]!,
    cycle: () => {
      setPreviewed(null);
      setStored(nextColorIndex(stored));
    },
    select: (next: number) => {
      if (!isTheme(next)) return;
      setPreviewed(null);
      setStored(next);
    },
    preview: (next: number | null) => {
      if (next === null || isTheme(next)) setPreviewed(next);
    },
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
