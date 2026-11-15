import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import type { Dir, GameEvent, GameState, World } from './engine/types.ts';
import styles from './Game.module.css';
import { SCREEN_H, SCREEN_W, drawGame } from './render.ts';
import { layout } from './scale.ts';
import { useGameLoop, type Button } from './useGameLoop.ts';
import { useSheets } from './useSheets.ts';

const DIRS: Record<string, Dir> = {
  ArrowUp: 'up',
  w: 'up',
  W: 'up',
  ArrowDown: 'down',
  s: 'down',
  S: 'down',
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
};
const BUTTONS: Record<string, Button> = {
  z: 'a',
  Z: 'a',
  ' ': 'a',
  Enter: 'a',
  x: 'b',
  X: 'b',
  Backspace: 'b',
  p: 'start',
  P: 'start',
  h: 'select',
  H: 'select',
};

/** The keyboard, as the list beside the screen shows it. */
const KEYS = [
  ['Walk', 'Arrows or WASD'],
  ['A: talk, confirm', 'Z, Enter or Space'],
  ['B: back', 'X or Backspace'],
  ['Start: bag, badges', 'P'],
  ['Select: hint', 'H'],
  ['Leave', 'Esc or Q'],
] as const;

type Props = {
  /** The focusable wrapper, so the terminal can put focus on it. */
  focusRef: RefObject<HTMLDivElement | null>;
  world: World;
  storeRef: RefObject<GameState | null>;
  reducedMotion: boolean;
  /** Show the on-screen buttons: touch devices only. */
  touch: boolean;
  /** The lines shown when the game is finished. */
  contact: string[];
  /** The shell's prompt text, kept (invisible) in the button bar so the bar is as tall as the command line was. */
  prompt: string;
  onLeave: () => void;
  onSkip: () => void;
};

/**
 * The adventure: a Game Boy with a canvas for a screen, drawn by the loop, a polite live region that says what
 * happens, and the buttons. The canvas is hidden from assistive technology on purpose; the live region carries
 * the story, and Skip to text and `play skip` print the career as plain text.
 */
export function Game({ focusRef, world, storeRef, reducedMotion, touch, contact, prompt, onLeave, onSkip }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const sheets = useSheets();
  const [status, setStatus] = useState({ text: '', again: false });
  const [finished, setFinished] = useState(false);
  const [focused, setFocused] = useState(false);
  const [fit, setFit] = useState({ wide: false, scale: 1 });

  const paint = (state: GameState) => {
    const ctx = sheets && canvasRef.current?.getContext('2d');
    if (ctx) drawGame(ctx, sheets, state, world);
  };
  const onFrame = (state: GameState) => {
    paint(state);
    setFinished(state.finished);
    const root = focusRef.current;
    if (root) {
      Object.assign(root.dataset, {
        scene: state.scene,
        map: state.map,
        x: String(state.x),
        y: String(state.y),
        dir: state.dir,
        dialogue: String(!!state.dialogue),
        battle: state.battle?.enemy ?? '',
        menu: state.menu?.tab ?? '',
        badges: String(state.badges.length),
        hp: String(state.hp),
        finished: String(state.finished),
      });
    }
  };
  const onEvents = (events: GameEvent[]) => {
    const text = events.map((event) => event.text).join(' ');
    // The same line twice in a row (the same sign, read again) would not be announced again without a change:
    // a trailing no-break space makes it one.
    setStatus((old) => ({ text, again: old.text === text && !old.again }));
  };

  const loop = useGameLoop({ world, storeRef, reducedMotion, onFrame, onEvents });

  // The sheets arrive after the first frame, and a still game does not draw again by itself.
  useEffect(() => {
    if (storeRef.current) paint(storeRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheets]);

  // The screen is as big as fits the area, on whole device pixels.
  useEffect(() => {
    const area = areaRef.current;
    if (!area || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const next = layout(area.clientWidth, area.clientHeight, touch, window.devicePixelRatio || 1);
      setFit((old) => (old.wide === next.wide && old.scale === next.scale ? old : next));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    measure();
    return () => observer.disconnect();
  }, [touch]);

  const keyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape' || ((event.key === 'q' || event.key === 'Q') && event.target === event.currentTarget)) {
      event.preventDefault();
      onLeave();
      return;
    }
    // A key pressed on one of the buttons inside belongs to that button.
    if (event.target !== event.currentTarget) return;
    const dir = DIRS[event.key];
    const button = BUTTONS[event.key];
    if (!dir && !button) return;
    // The page must not scroll or go back under the game. Tab is never taken.
    event.preventDefault();
    if (event.repeat && !(reducedMotion && dir)) return;
    if (dir) loop.dir(dir, true);
    else if (button) loop.button(button);
  };
  const keyUp = (event: KeyboardEvent) => {
    const dir = DIRS[event.key];
    if (dir) loop.dir(dir, false);
  };

  /** A D-pad button: held while it is pressed. A keyboard "click" on it is one step. */
  const pad = (dir: Dir) => ({
    onPointerDown: (event: PointerEvent) => {
      event.preventDefault();
      loop.dir(dir, true);
    },
    onPointerUp: () => loop.dir(dir, false),
    onPointerCancel: () => loop.dir(dir, false),
    onPointerLeave: () => loop.dir(dir, false),
    onClick: (event: MouseEvent) => {
      if (event.detail !== 0) return;
      loop.dir(dir, true);
      loop.dir(dir, false);
    },
  });
  const tap = (button: Button) => ({
    onPointerDown: (event: PointerEvent) => {
      event.preventDefault();
      loop.button(button);
    },
    onClick: (event: MouseEvent) => {
      if (event.detail === 0) loop.button(button);
    },
  });

  return (
    // A game surface has to take the keyboard: role="application" is the honest role for it, and it stays out of the
    // Tab trap because Tab is never swallowed.
    /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
    <div
      ref={focusRef}
      className={styles.game}
      role="application"
      aria-label="Career Quest, a Game Boy style adventure. Arrow keys or W A S D to walk, Z or Enter for A, X for B, P for Start, H for Select, Escape or Q to leave."
      tabIndex={0}
      onKeyDown={keyDown}
      onKeyUp={keyUp}
      onFocus={(event) => setFocused(event.target === event.currentTarget)}
      onBlur={() => {
        setFocused(false);
        loop.release();
      }}
    >
      <div ref={areaRef} className={styles.area}>
        <div className={styles.console} data-wide={fit.wide} data-touch={touch}>
          <div className={styles.bezel}>
            <canvas
              ref={canvasRef}
              className={styles.screen}
              width={SCREEN_W}
              height={SCREEN_H}
              style={{ width: SCREEN_W * fit.scale, height: SCREEN_H * fit.scale }}
              aria-hidden="true"
            />
            {!focused && !finished && (
              <div className={styles.hint} aria-hidden="true">
                {touch ? 'Tap to play' : 'Click to play'}
              </div>
            )}
          </div>
          <div className={styles.side}>
            <div className={styles.brand} aria-hidden="true">
              <span className={styles.led} />
              CAREER QUEST
            </div>
            {finished ? (
              <div className={styles.contact}>
                {contact.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            ) : touch ? (
              <div className={styles.controls}>
                <div className={styles.dpad}>
                  <button type="button" className={styles.up} aria-label="Up" {...pad('up')} />
                  <button type="button" className={styles.left} aria-label="Left" {...pad('left')} />
                  <button type="button" className={styles.right} aria-label="Right" {...pad('right')} />
                  <button type="button" className={styles.down} aria-label="Down" {...pad('down')} />
                </div>
                <div className={styles.small}>
                  <button type="button" {...tap('select')}>
                    Select
                  </button>
                  <button type="button" {...tap('start')}>
                    Start
                  </button>
                </div>
                <div className={styles.ab}>
                  <button type="button" className={styles.b} {...tap('b')}>
                    B
                  </button>
                  <button type="button" className={styles.a} {...tap('a')}>
                    A
                  </button>
                </div>
              </div>
            ) : (
              <dl className={styles.keys}>
                {KEYS.map(([what, key]) => (
                  <div key={what}>
                    <dt>{what}</dt>
                    <dd>{key}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
        <div className={styles.status} role="status" aria-live="polite">
          {status.text}
          {status.again ? ' ' : ''}
        </div>
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
