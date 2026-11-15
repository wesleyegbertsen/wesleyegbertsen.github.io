import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import { bannerText } from './engine/banner.ts';
import { SETTINGS, type Cue, type Dir, type GameEvent, type GameState, type World } from './engine/types.ts';
import { placeOf } from './engine/wander.ts';
import styles from './Game.module.css';
import { SCREEN_H, SCREEN_W, drawGame } from './render.ts';
import { layout } from './scale.ts';
import { useGameLoop, type Button } from './useGameLoop.ts';
import type { SettingsStore } from './settingsStore.ts';
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

/** The keyboard, as the list beside the screen shows it. The sound line shows whether it is on and how loud. */
const keys = (muted: boolean, volume: number) =>
  [
    ['Walk', 'Arrows or WASD'],
    ['A: talk, confirm', 'Z, Enter or Space'],
    ['B: back', 'X or Backspace'],
    ['Start: bag / Select: hint', 'P / H'],
    [`Sound: ${muted ? 'off' : 'on'}, ${volume * 10}%`, 'M'],
    ['Leave', 'Esc or Q'],
  ] as const;

type Props = {
  /** The focusable wrapper, so the terminal can put focus on it. */
  focusRef: RefObject<HTMLDivElement | null>;
  world: World;
  storeRef: RefObject<GameState | null>;
  /** Whether the sound is off: kept by the session, so it outlasts the game. */
  settingsStore: SettingsStore;
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
export function Game({ focusRef, world, storeRef, settingsStore, reducedMotion, touch, contact, prompt, onLeave, onSkip }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const sheets = useSheets();
  const [status, setStatus] = useState({ text: '', again: false });
  const [finished, setFinished] = useState(false);
  const [focused, setFocused] = useState(false);
  const [fit, setFit] = useState({ wide: false, scale: 1 });
  const sound = useGameSound({ world, store: settingsStore });
  const lcd = useSyncExternalStore(settingsStore.subscribe, settingsStore.lcd);
  /** What the data attributes were last set from, so a frame that changes none of them writes nothing. */
  const shown = useRef('');
  const cueCount = useRef(0);

  const paint = (state: GameState, muted = settingsStore.muted(), volume = settingsStore.volume()) => {
    const ctx = sheets && canvasRef.current?.getContext('2d');
    if (ctx) drawGame(ctx, sheets, state, world, { muted, volume, lcd: settingsStore.lcd() });
  };
  const onFrame = (state: GameState) => {
    paint(state);
    setFinished(state.finished);
    const music = sound.follow(state) ?? '';
    const banner = bannerText(state);
    const transition = state.battle && state.battle.intro > 0 ? (state.battle.wild ? 'wild' : state.battle.quick ? 'quick' : 'boss') : '';
    // Where the things that can be pushed on this map are now (boulders), as "x,y x,y", in the order of the map.
    const pushed = (world.maps[state.map]?.objects ?? []).filter((object) => object.push).map((object) => placeOf(object, state)).map((at) => `${at.x},${at.y}`).join(' ');
    const root = focusRef.current;
    const key = [pushed, state.scene, state.map, state.x, state.y, state.dir, !!state.dialogue, state.battle?.enemy, state.battle?.level, state.menu?.tab, state.menu?.cursor, state.learn?.move, state.shop?.id, state.shop?.cursor, state.shop?.amount, state.coins, state.badges.length, state.hp, state.level, state.xp, state.finished, music, banner, transition, !!state.walk?.jump].join('|');
    if (root && key !== shown.current) {
      shown.current = key;
      Object.assign(root.dataset, {
        music,
        banner,
        transition,
        pushed,
        // A hop over a ledge is under way. Only seen when motion is allowed: with reduced motion it is over at once.
        jump: String(!!state.walk?.jump),
        scene: state.scene,
        map: state.map,
        x: String(state.x),
        y: String(state.y),
        dir: state.dir,
        dialogue: String(!!state.dialogue),
        battle: state.battle?.enemy ?? '',
        foeLevel: state.battle ? String(state.battle.level) : '',
        menu: state.menu?.tab ?? '',
        row: state.menu?.tab === 'settings' ? (SETTINGS[state.menu.cursor] ?? '') : '',
        learn: state.learn?.move ?? '',
        // The money, and the shop while one is open: its name in `world.shops` and the item under the cursor (`leave` on the last entry).
        coins: String(state.coins),
        shop: state.shop?.id ?? '',
        shopRow: state.shop ? (world.shops[state.shop.id]?.stock[state.shop.cursor]?.item ?? 'leave') : '',
        // How many of that item A buys (left and right change it).
        shopAmount: state.shop ? String(state.shop.amount) : '',
        level: String(state.level),
        xp: String(state.xp),
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
  /** The mute switch: the M key, the Sound button and SOUND in the settings. */
  const toggleSound = () => {
    const off = sound.toggle();
    onEvents([{ kind: 'menu', text: off ? 'Sound off' : 'Sound on' }]);
    if (storeRef.current) paint(storeRef.current, off);
  };
  const onCues = (cues: Cue[]) => {
    // The settings of the Start menu: the game only says what was asked for; it is done here.
    for (const cue of cues) {
      if (cue === 'quieter' || cue === 'louder') {
        const volume = sound.turn(cue === 'louder' ? 1 : -1);
        onEvents([{ kind: 'menu', text: `Volume ${volume * 10}%` }]);
        if (storeRef.current) paint(storeRef.current, settingsStore.muted(), volume);
      } else if (cue === 'sound') toggleSound();
      else if (cue === 'screen') {
        settingsStore.setLcd(!settingsStore.lcd());
        onEvents([{ kind: 'menu', text: settingsStore.lcd() ? 'LCD look on' : 'LCD look off' }]);
        if (storeRef.current) paint(storeRef.current);
      }
    }
    sound.play(cues.filter((cue) => cue !== 'sound'));
    // For the browser tests: which sound was asked for last, and how many so far.
    const root = focusRef.current;
    cueCount.current += cues.length;
    if (root) Object.assign(root.dataset, { cue: cues.at(-1), cues: String(cueCount.current) });
  };

  const loop = useGameLoop({ world, storeRef, reducedMotion, onFrame, onEvents, onCues });

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
      aria-label="Career Quest, a Game Boy style adventure with music. Arrow keys or W A S D to walk, Z or Enter for A, X for B, P for Start, H for Select, M to switch the sound off or on, Escape or Q to leave. The Start menu has a Settings tab for the sound, the volume and the look of the screen."
      tabIndex={0}
      data-sound={sound.muted ? 'off' : 'on'}
      data-volume={sound.volume * 10}
      data-lcd={lcd ? 'on' : 'off'}
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
            <div className={styles.glass}>
              <canvas
                ref={canvasRef}
                className={styles.screen}
                width={SCREEN_W}
                height={SCREEN_H}
                style={{ width: SCREEN_W * fit.scale, height: SCREEN_H * fit.scale }}
                aria-hidden="true"
              />
              {/* The LCD look: a grid of one cell per game pixel and darker corners, laid over the picture, never drawn into it. */}
              {lcd && <div className={styles.lcd} data-testid="lcd" aria-hidden="true" style={{ backgroundSize: `${fit.scale}px ${fit.scale}px, ${fit.scale}px ${fit.scale}px, 100% 100%` }} />}
            </div>
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
                {keys(sound.muted, sound.volume).map(([what, key]) => (
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
