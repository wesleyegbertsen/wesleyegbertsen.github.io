import { createContext, useContext } from 'react';
import type { Theme } from './themes.ts';

export type ThemeState = {
  index: number;
  theme: Theme;
  /** Move to the next theme (and the next rain colour with it). */
  cycle: () => void;
  /** Move to the theme at `index` and keep it. An index that is not a theme is ignored. */
  select: (index: number) => void;
  /**
   * Show the theme at `index` for now, without keeping it: the stored theme is untouched, so a reload or a
   * closed tab brings back the visitor's own colour. `null` ends the preview. A real choice (`cycle`,
   * `select`) ends it too. An index that is not a theme is ignored.
   */
  preview: (index: number | null) => void;
};

export const ThemeContext = createContext<ThemeState | null>(null);

export function useTheme(): ThemeState {
  const state = useContext(ThemeContext);
  if (!state) throw new Error('useTheme must be used inside a ThemeProvider');
  return state;
}
