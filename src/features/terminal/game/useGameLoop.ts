import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { initialGame, NO_INPUT, step, type GameEvent, type GameState, type Input } from './engine.ts';
import type { Level } from './level.ts';
import { MAX_FRAME_MS, RUN_SPEED, STEP_MS } from './physics.ts';

export type Key = keyof Input;

type Options = {
  level: Level;
  /** Where the live state is kept: above the routes, so it outlasts a visit to another page. */
  storeRef: RefObject<GameState | null>;
  reducedMotion: boolean;
  /** Called when the picture changes (the player moved, an item went), not on every frame. */
  onFrame: (state: GameState) => void;
  onEvents: (events: GameEvent[]) => void;
};

const DT = STEP_MS / 1000;

/**
 * Runs the game: a fixed-step loop on requestAnimationFrame that calls the pure `step`, keeps the keys that are held,
 * pauses while the tab is hidden and stops on unmount. With reduced motion there is no loop at all: each press
 * advances the game by one discrete move and redraws once.
 */
export function useGameLoop({ level, storeRef, reducedMotion, onFrame, onEvents }: Options) {
  const keys = useRef<Input>({ ...NO_INPUT });
  const drawn = useRef('');
  const callbacks = useRef({ onFrame, onEvents });
  useEffect(() => {
    callbacks.current = { onFrame, onEvents };
  });

  const emit = useCallback(
    (events: GameEvent[]) => {
      const state = (storeRef.current ??= initialGame(level));
      // Quantised, so a player standing still does not redraw.
      const signature = [state.x.toFixed(3), state.y.toFixed(3), state.collected.length, state.finished].join('|');
      if (signature !== drawn.current) {
        drawn.current = signature;
        callbacks.current.onFrame(state);
      }
      if (events.length > 0) callbacks.current.onEvents(events);
    },
    [level, storeRef],
  );

  const release = useCallback(() => {
    keys.current = { ...NO_INPUT };
  }, []);

  const setKey = useCallback((key: Key, down: boolean) => {
    keys.current = { ...keys.current, [key]: down };
  }, []);

  /** Reduced motion: one move per press. Left and right run one tile; jump plays the whole arc, in place. */
  const press = useCallback(
    (key: Key) => {
      let state = (storeRef.current ??= initialGame(level));
      const events: GameEvent[] = [];
      const run = (input: Input, until: (s: GameState, i: number) => boolean, max: number) => {
        for (let i = 0; i < max && !state.finished; i++) {
          const result = step(state, input, DT, level);
          state = result.state;
          events.push(...result.events);
          if (until(state, i)) break;
        }
      };
      const settle = () => run(NO_INPUT, (s) => s.grounded, 60);
      if (key === 'jump') {
        if (state.grounded) run({ ...NO_INPUT, jump: true }, () => false, 1);
        settle();
      } else {
        const from = state.x;
        const ticks = Math.ceil(30 / RUN_SPEED);
        run({ ...NO_INPUT, [key]: true }, (s) => Math.abs(s.x - from) >= 1, ticks * 2);
        settle();
      }
      storeRef.current = state;
      emit(events);
    },
    [emit, level, storeRef],
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
      let state = (storeRef.current ??= initialGame(level));
      let stepped = false;
      while (accumulated >= STEP_MS - 1e-6) {
        const result = step(state, keys.current, DT, level);
        state = result.state;
        events.push(...result.events);
        accumulated -= STEP_MS;
        stepped = true;
      }
      if (stepped) {
        storeRef.current = state;
        emit(events);
      }
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
  }, [emit, level, reducedMotion, release, storeRef]);

  return useMemo(() => ({ setKey, press, release }), [setKey, press, release]);
}
