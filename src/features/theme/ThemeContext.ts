import { createContext, useContext } from 'react';
import type { Theme } from './themes.ts';

export type ThemeState = {
  index: number;
  theme: Theme;
  /** Move to the next theme (and the next rain colour with it). */
  cycle: () => void;
};

export const ThemeContext = createContext<ThemeState | null>(null);

export function useTheme(): ThemeState {
  const state = useContext(ThemeContext);
  if (!state) throw new Error('useTheme must be used inside a ThemeProvider');
  return state;
}
