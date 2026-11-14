import { useCallback, useEffect, useRef } from 'react';
import { THEMES } from '../theme/themes.ts';
import { matrixLine } from './art.ts';

const LINE_COUNT = 12;
const LINE_MS = 100;
const THEME_MS = 400;
const WIDTH = 30;

type Options = {
  /** The theme the visitor has chosen (the stored one), which the run starts from. */
  index: number;
  /** Shows a theme for now without keeping it; `null` ends the preview. */
  preview: (index: number | null) => void;
  /** Prints one line of rain into the terminal. */
  print: (line: string) => void;
  reducedMotion: boolean;
};

/**
 * The `matrix` command: prints a short burst of rain, one line at a time, and previews the other themes in turn
 * before the visitor's own comes back. The themes are only previewed, never stored, so a reload or a closed tab
 * mid-run leaves the visitor's colour alone. With reduced motion the rain prints at once and the colours stay.
 * `cancel` drops a pending run; leaving the page does the same.
 */
export function useMatrixRun(options: Options) {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const timers = useRef<number[]>([]);
  // The theme the run started from, while a run is going; null otherwise.
  const base = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  const cancel = useCallback(() => {
    clearTimers();
    if (base.current !== null) latest.current.preview(null);
    base.current = null;
  }, [clearTimers]);

  useEffect(() => cancel, [cancel]);

  const start = useCallback(() => {
    const { index, print, reducedMotion } = latest.current;
    const from = base.current ?? index;

    if (reducedMotion) {
      cancel();
      for (let i = 0; i < LINE_COUNT; i += 1) print(matrixLine(Math.random, WIDTH));
      return;
    }

    // A run already going is dropped without ending its preview: the new one carries straight on.
    clearTimers();
    base.current = from;
    const at = (ms: number, run: () => void) => timers.current.push(window.setTimeout(run, ms));
    for (let i = 0; i < LINE_COUNT; i += 1) {
      at(i * LINE_MS, () => latest.current.print(matrixLine(Math.random, WIDTH)));
    }
    // Every other theme in turn, then the visitor's own is back.
    for (let step = 1; step < THEMES.length; step += 1) {
      at(step * THEME_MS, () => latest.current.preview((from + step) % THEMES.length));
    }
    at(THEMES.length * THEME_MS, () => {
      latest.current.preview(null);
      base.current = null;
    });
  }, [cancel, clearTimers]);

  return { start, cancel };
}
