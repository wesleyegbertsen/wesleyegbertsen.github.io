import { useLayoutEffect, type ReactNode } from 'react';
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
  const [index, setIndex] = useLocalStorage(STORAGE_KEY, 0, { parse: parseColorIndex });

  // Before paint on every change, so the page never shows the old theme next to the new rain.
  useLayoutEffect(() => {
    applyTheme(index);
  }, [index]);

  const value = {
    index,
    theme: THEMES[index] ?? THEMES[0]!,
    cycle: () => setIndex(nextColorIndex(index)),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
