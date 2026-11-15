import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import type { Cue, Dir, GameEvent, GameState, World } from './engine/types.ts';
import styles from './Game.module.css';
import { SCREEN_H, SCREEN_W, drawGame } from './render.ts';
import { layout } from './scale.ts';
import { useGameLoop, type Button } from './useGameLoop.ts';
import type { SoundStore } from './soundStore.ts';
import { useGameSound } from './useGameSound.ts';
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

/** The keyboard, as the list beside the screen shows it. The sound line shows whether it is on. */
const keys = (muted: boolean) =>
  [
    ['Walk', 'Arrows or WASD'],
    ['A: talk, confirm', 'Z, Enter or Space'],
    ['B: back', 'X or Backspace'],
    ['Start: bag / Select: hint', 'P / H'],
    [`Sound: ${muted ? 'off' : 'on'}`, 'M'],
    ['Leave', 'Esc or Q'],
  ] as const;

type Props = {
  /** The focusable wrapper, so the terminal can put focus on it. */
  focusRef: RefObject<HTMLDivElement | null>;
  world: World;
  storeRef: RefObject<GameState | null>;
  /** Whether the sound is off: kept by the session, so it outlasts the game. */
  soundStore: SoundStore;
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
export function Game({ focusRef, world, storeRef, soundStore, reducedMotion, touch, contact, prompt, onLeave, onSkip }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const sheets = useSheets();
  const [status, setStatus] = useState({ text: '', again: false });
  const [finished, setFinished] = useState(false);
  const [focused, setFocused] = useState(false);
  const [fit, setFit] = useState({ wide: false, scale: 1 });
  const sound = useGameSound({ world, store: soundStore });
  /** What the data attributes were last set from, so a frame that changes none of them writes nothing. */
  const shown = useRef('');
  const cueCount = useRef(0);

  const paint = (state: GameState, muted = soundStore.muted()) => {
    const ctx = sheets && canvasRef.current?.getContext('2d');
    if (ctx) drawGame(ctx, sheets, state, world, { muted });
  };
  const onFrame = (state: GameState) => {
    paint(state);
    setFinished(state.finished);
    const music = sound.follow(state) ?? '';
    const root = focusRef.current;
    const key = [state.scene, state.map, state.x, state.y, state.dir, !!state.dialogue, state.battle?.enemy, state.menu?.tab, state.badges.length, state.hp, state.finished, music].join('|');
    if (root && key !== shown.current) {
      shown.current = key;
      Object.assign(root.dataset, {
        music,
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
  const onCues = (cues: Cue[]) => {
    sound.play(cues);
    // For the browser tests: which sound was asked for last, and how many so far.
    const root = focusRef.current;
    cueCount.current += cues.length;
    if (root) Object.assign(root.dataset, { cue: cues.at(-1), cues: String(cueCount.current) });
  };

  const loop = useGameLoop({ world, storeRef, reducedMotion, onFrame, onEvents, onCues });

  /** The mute switch: the M key and the Sound button. */
  const toggleSound = () => {
    const off = sound.toggle();
    onEvents([{ kind: 'menu', text: off ? 'Sound off' : 'Sound on' }]);
    if (storeRef.current) paint(storeRef.current, off);
  };

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
    // A browser may only start the sound from a key or a touch: ask again, it costs nothing once it runs.
    sound.unlock();
    // A key pressed on one of the buttons inside belongs to that button.
    if (event.target !== event.currentTarget) return;
    if (event.key === 'm' || event.key === 'M') {
      event.preventDefault();
      if (!event.repeat) toggleSound();
      return;
    }
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
      aria-label="Career Quest, a Game Boy style adventure with music. Arrow keys or W A S D to walk, Z or Enter for A, X for B, P for Start, H for Select, M to switch the sound off or on, Escape or Q to leave."
      tabIndex={0}
      data-sound={sound.muted ? 'off' : 'on'}
      onKeyDown={keyDown}
      onKeyUp={keyUp}
      onPointerDown={sound.unlock}
      // iOS only counts the end of a touch as a gesture that may start sound.
      onPointerUp={sound.unlock}
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
                  <button
                    type="button"
                    aria-pressed={!sound.muted}
                    data-off={sound.muted}
                    onPointerDown={(event) => {
                      // Keep the focus on the game; the toggle waits for the click, so a scroll that starts here is harmless.
                      event.preventDefault();
                      sound.unlock();
                    }}
                    onClick={toggleSound}
                  >
                    Sound
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
                {keys(sound.muted).map(([what, key]) => (
                  <div key={key}>
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
