import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { announce, type GameEvent, type GameState } from './engine.ts';
import type { Level } from './level.ts';
import styles from './Game.module.css';
import { useMediaQuery } from '../../../hooks/useMediaQuery.ts';
import { VIEW_COLS, VIEW_COLS_NARROW, VIEW_ROWS } from './physics.ts';
import { CANVAS_H, canvasWidth, drawGame } from './render.ts';
import { useGameLoop, type Key } from './useGameLoop.ts';

const KEYS: Record<string, Key> = {
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
  ArrowUp: 'jump',
  w: 'jump',
  W: 'jump',
  ' ': 'jump',
};
/** The keys the game takes for itself, so the page does not scroll under it. Tab is not one of them. */
const SWALLOWED = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ']);

type Props = {
  /** The focusable wrapper, so the terminal can put focus on it. */
  focusRef: RefObject<HTMLDivElement | null>;
  level: Level;
  storeRef: RefObject<GameState | null>;
  reducedMotion: boolean;
  /** Show the on-screen buttons: touch devices only. */
  touch: boolean;
  /** The lines shown when the run is finished. */
  contact: string[];
  /** The shell's prompt text, kept (invisible) in the button bar so the bar is as tall as the command line was. */
  prompt: string;
  onLeave: () => void;
  onSkip: () => void;
};

/**
 * The platformer: a canvas drawn by the loop, a polite live region that only says what happened, and the buttons.
 * The canvas is hidden from assistive technology on purpose; a screen reader user has Skip and `play skip`.
 */
export function Game({ focusRef, level, storeRef, reducedMotion, touch, contact, prompt, onLeave, onSkip }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('');
  const [finished, setFinished] = useState(false);
  const [focused, setFocused] = useState(false);

  const cols = useMediaQuery('(max-width: 600px)') ? VIEW_COLS_NARROW : VIEW_COLS;

  const paint = (state: GameState) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      // The panel's colours, read at draw time so a theme change shows up on the next frame.
      const style = getComputedStyle(canvas);
      const accent = style.getPropertyValue('--accent').trim() || '#00ff41';
      drawGame(ctx, state, level, { accent, ink: '#05140a' }, cols);
    }
  };
  const onFrame = (state: GameState) => {
    paint(state);
    setFinished(state.finished);
    const root = focusRef.current;
    if (root) {
      root.dataset.playerX = String(Math.floor(state.x));
      root.dataset.collected = String(state.collected.length);
      root.dataset.finished = String(state.finished);
    }
  };
  const onEvents = (events: GameEvent[]) => {
    setStatus(events.map(announce).join('. '));
    if (events.some((event) => event.type === 'finished')) setFinished(true);
  };
  // Resizing a canvas clears it, and a player standing still would not trigger another frame.
  useEffect(() => {
    if (storeRef.current) paint(storeRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols]);

  const loop = useGameLoop({ level, storeRef, reducedMotion, onFrame, onEvents });

  const keyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' || event.key === 'q' || event.key === 'Q') {
      event.preventDefault();
      onLeave();
      return;
    }
    const key = KEYS[event.key];
    if (SWALLOWED.has(event.key)) event.preventDefault();
    if (!key || event.ctrlKey || event.metaKey || event.altKey) return;
    if (reducedMotion) loop.press(key);
    else loop.setKey(key, true);
  };
  const keyUp = (event: KeyboardEvent) => {
    const key = KEYS[event.key];
    if (key) loop.setKey(key, false);
  };

  const hold = (key: Key) => ({
    onPointerDown: (event: PointerEvent) => {
      event.preventDefault();
      if (reducedMotion) loop.press(key);
      else loop.setKey(key, true);
    },
    onPointerUp: () => loop.setKey(key, false),
    onPointerCancel: () => loop.setKey(key, false),
    onPointerLeave: () => loop.setKey(key, false),
  });

  return (
    // A game surface has to take the keyboard: role="application" is the honest role for it, and it stays out of the
    // Tab trap because Tab is never swallowed.
    /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
    <div
      ref={focusRef}
      className={styles.game}
      role="application"
      aria-label="Career platformer. Arrow keys or A and D to move, space to jump, Escape or Q to leave."
      tabIndex={0}
      onKeyDown={keyDown}
      onKeyUp={keyUp}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        loop.release();
      }}
    >
      <div className={styles.area}>
      <canvas ref={canvasRef} className={styles.canvas} width={canvasWidth(cols)}
        height={CANVAS_H}
        style={{ aspectRatio: `${cols} / ${VIEW_ROWS}` }}
        aria-hidden="true"
      />
      <div className={styles.status} role="status" aria-live="polite">
        {status}
      </div>
      {finished && (
        <div className={styles.contact}>
          {contact.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}
      {!focused && !finished && (
        <div className={styles.hint} aria-hidden="true">
          Click to play
        </div>
      )}
      {touch && (
        <div className={styles.pad}>
          <button type="button" className={styles.padButton} {...hold('left')}>
            Left
          </button>
          <button type="button" className={styles.padButton} {...hold('jump')}>
            Jump
          </button>
          <button type="button" className={styles.padButton} {...hold('right')}>
            Right
          </button>
        </div>
      )}
      </div>
      <div className={styles.bar}>
        <span className={styles.ghost} aria-hidden="true">
          {prompt}
        </span>
        <span className={styles.buttons}>
          <button type="button" className={styles.barButton} onClick={onSkip}>
            Skip to text
          </button>
          <button type="button" className={styles.barButton} onClick={onLeave}>
            Leave
          </button>
        </span>
      </div>
    </div>
  );
}
