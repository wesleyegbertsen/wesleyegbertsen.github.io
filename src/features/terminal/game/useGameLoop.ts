import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { initialGame, step } from './engine/engine.ts';
import { NO_INPUT, type Dir, type GameEvent, type GameState, type Input, type World } from './engine/types.ts';

export type Button = 'a' | 'b' | 'start' | 'select';

/** The engine runs 60 ticks a second, whatever the display does. */
export const STEP_MS = 1000 / 60;
/** A stalled frame (a busy tab) counts for this much at most, so the game does not jump. */
export const MAX_FRAME_MS = 100;

type Options = {
  world: World;
  /** Where the live state is kept: above the routes, so it outlasts a visit to another page. */
  storeRef: RefObject<GameState | null>;
  reducedMotion: boolean;
  /** Called when the state changed, not on every frame. */
  onFrame: (state: GameState) => void;
  onEvents: (events: GameEvent[]) => void;
};

/**
 * Runs the game: a fixed-step loop on requestAnimationFrame that calls the pure `step`, keeps the direction that
 * is held, pauses while the tab is hidden and stops on unmount. With reduced motion there is no loop at all:
 * each press advances the game by one whole move and redraws once.
 */
export function useGameLoop({ world, storeRef, reducedMotion, onFrame, onEvents }: Options) {
  /** The directions held down, the newest last. */
  const held = useRef<Dir[]>([]);
  /** What was pressed since the last tick. */
  const pending = useRef<Omit<Input, 'dir'>>({ ...NO_INPUT });
  const drawn = useRef<GameState | null>(null);
  const callbacks = useRef({ onFrame, onEvents });
  useEffect(() => {
    callbacks.current = { onFrame, onEvents };
  });

  const current = useCallback(() => (storeRef.current ??= initialGame(world)), [storeRef, world]);

  const emit = useCallback(
    (events: GameEvent[]) => {
      const state = current();
      if (state !== drawn.current) {
        drawn.current = state;
        callbacks.current.onFrame(state);
      }
      if (events.length > 0) callbacks.current.onEvents(events);
    },
    [current],
  );

  /**
   * One tick with what is held and what was pressed; the presses are used up. A button pressed in the middle of
   * a step is kept until the step is done, so it is not lost.
   */
  const advance = useCallback(
    (instant: boolean): GameEvent[] => {
      const state = current();
      const input: Input = { ...pending.current, dir: held.current.at(-1) ?? null };
      pending.current = state.walk ? { ...pending.current, pressed: null } : { ...NO_INPUT };
      const result = step(state, input, world, { instant });
      storeRef.current = result.state;
      return result.events;
    },
    [current, storeRef, world],
  );

  const release = useCallback(() => {
    held.current = [];
    pending.current = { ...NO_INPUT };
  }, []);

  /** A direction went down or up. */
  const dir = useCallback(
    (which: Dir, down: boolean) => {
      held.current = held.current.filter((other) => other !== which);
      if (!down) return;
      pending.current = { ...pending.current, pressed: which };
      if (reducedMotion) emit(advance(true));
      else held.current.push(which);
    },
    [advance, emit, reducedMotion],
  );

  /** A, B, Start or Select was pressed. */
  const button = useCallback(
    (which: Button) => {
      pending.current = { ...pending.current, [which]: true };
      if (reducedMotion) emit(advance(true));
    },
    [advance, emit, reducedMotion],
  );

  useEffect(() => {
    emit([]);
    if (reducedMotion) return;

    let raf = 0;
    let previous = 0;
    let accumulated = 0;

    const frame = (time: number) => {
      if (previous === 0) previous = time;
      accumulated += Math.min(time - previous, MAX_FRAME_MS);
      previous = time;

      const events: GameEvent[] = [];
      while (accumulated >= STEP_MS - 1e-6) {
        events.push(...advance(false));
        accumulated -= STEP_MS;
      }
      emit(events);
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      previous = 0;
      accumulated = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    // A hidden tab stops the loop, and a key that went up while it was hidden must not stay down.
    const visibility = () => {
      release();
      if (document.hidden) stop();
      else if (raf === 0) start();
    };

    document.addEventListener('visibilitychange', visibility);
    if (!document.hidden) start();
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      stop();
    };
  }, [advance, emit, reducedMotion, release]);

  return useMemo(() => ({ dir, button, release }), [dir, button, release]);
}
