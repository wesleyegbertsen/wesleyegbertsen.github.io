import { useCallback, useEffect, useRef } from 'react';
import { matrixLine } from './art.ts';

const LINE_COUNT = 12;
const LINE_MS = 100;
const THEME_MS = 400;
const WIDTH = 30;
const THEME_COUNT = 4;

type Options = {
  /** The theme the visitor is on now. */
  index: number;
  select: (index: number) => void;
  /** Prints one line of rain into the terminal. */
  print: (line: string) => void;
  reducedMotion: boolean;
};

/**
 * The `matrix` command: prints a short burst of rain, one line at a time, and steps the site through the other
 * themes before putting the visitor's own back. With reduced motion the rain prints at once and the colours stay.
 * `cancel` drops a pending run (a `theme` command takes over); leaving the page puts the visitor's theme back.
 */
export function useMatrixRun(options: Options) {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const timers = useRef<number[]>([]);
  const restore = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  const cancel = useCallback(() => {
    clearTimers();
    restore.current = null;
  }, [clearTimers]);

  useEffect(
    () => () => {
      clearTimers();
      if (restore.current !== null) latest.current.select(restore.current);
      restore.current = null;
    },
    [clearTimers],
  );

  const start = useCallback(() => {
    const { index, print, reducedMotion } = latest.current;
    const base = restore.current ?? index;
    clearTimers();

    if (reducedMotion) {
      for (let i = 0; i < LINE_COUNT; i += 1) print(matrixLine(Math.random, WIDTH));
      restore.current = null;
      return;
    }

    restore.current = base;
    const at = (ms: number, run: () => void) => timers.current.push(window.setTimeout(run, ms));
    for (let i = 0; i < LINE_COUNT; i += 1) {
      at(i * LINE_MS, () => latest.current.print(matrixLine(Math.random, WIDTH)));
    }
    // Every other theme in turn, then back to the one the visitor had.
    for (let step = 1; step <= THEME_COUNT; step += 1) {
      const target = (base + step) % THEME_COUNT;
      at(step * THEME_MS, () => {
        latest.current.select(target);
        if (step === THEME_COUNT) restore.current = null;
      });
    }
  }, [clearTimers]);

  return { start, cancel };
}
