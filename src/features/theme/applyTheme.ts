import { readStored } from '../../hooks/useLocalStorage.ts';
import { STORAGE_KEY, parseColorIndex } from '../matrix/matrix.ts';
import { THEMES } from './themes.ts';

/** Puts a theme on an element (the page root by default): its name, and the colour tokens the CSS reads. */
export function applyTheme(index: number, root: HTMLElement = document.documentElement) {
  const theme = THEMES[index] ?? THEMES[0]!;
  root.dataset.theme = theme.name;
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent-hover', theme.accentHover);
  root.style.setProperty('--accent-on-light', theme.accentOnLight);
  root.style.setProperty('--accent-soft', theme.accentSoft);
  root.style.setProperty('--on-accent', theme.onAccent);
}

/** The stored colour index; a missing, invalid or unreadable value gives 0 (green). */
export function readStoredThemeIndex(): number {
  return readStored(STORAGE_KEY, 0, parseColorIndex);
}

/**
 * Turns on the colour fade once the page has painted with its stored theme, so only later changes
 * (a click on the background) animate, not the first colours on load.
 */
export function enableThemeFade(root: HTMLElement = document.documentElement) {
  requestAnimationFrame(() => requestAnimationFrame(() => root.setAttribute('data-theme-fade', '')));
}
