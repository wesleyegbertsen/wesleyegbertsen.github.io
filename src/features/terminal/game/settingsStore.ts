/**
 * The settings of the game: whether its sound is off, how loud it is, whether the screen has its LCD look, whether
 * it is a Game Boy or a Game Boy Color, and whether the screen is dim (the LIGHT row). A tiny store that lives in the terminal's session, beside
 * the game's progress: in memory only, so the choices outlast leaving the game and visiting another page, and a
 * reload starts with the sound on at half volume, in colour and dim, again. Nothing is written to storage.
 */
export type SettingsStore = {
  /** True when the sound is off. */
  muted(): boolean;
  setMuted(muted: boolean): void;
  /** The volume wheel: a step from 0 (silent) to VOLUME_MAX (loudest). It keeps its place while the sound is off. */
  volume(): number;
  /** Sets the wheel, kept within its range. */
  setVolume(step: number): void;
  /** Whether the screen has its LCD look (a pixel grid over the picture). On at the start. */
  lcd(): boolean;
  setLcd(on: boolean): void;
  /** Whether the game runs as a Game Boy Color: in colour, in a coloured console. COLOUR_START at the start. */
  colour(): boolean;
  setColour(on: boolean): void;
  /** Whether the screen is dim, like a Game Boy Color without a frontlight (palettes.ts `dim`). DIM_START at the start. */
  dim(): boolean;
  setDim(on: boolean): void;
  /** Calls `listener` after every change; returns how to stop. */
  subscribe(listener: () => void): () => void;
};

/** The wheel has ten steps of 10%; it starts in the middle. */
export const VOLUME_MAX = 10;
export const VOLUME_START = 5;
/** Whether the game starts as a Game Boy Color. On: the title and the world in colour, switched on the title or in the settings. */
export const COLOUR_START = true;
/** Whether the screen starts dim. On: the dim LCD of a Game Boy Color without a frontlight; BRIGHT is a switch away. */
export const DIM_START = true;

export function createSettingsStore(muted = false, volume = VOLUME_START): SettingsStore {
  let off = muted;
  let step = volume;
  let grid = true;
  let colours = COLOUR_START;
  let dark = DIM_START;
  const listeners = new Set<() => void>();
  const tell = () => listeners.forEach((listener) => listener());
  return {
    muted: () => off,
    setMuted(next) {
      if (next === off) return;
      off = next;
      tell();
    },
    volume: () => step,
    setVolume(next) {
      const within = Math.max(0, Math.min(VOLUME_MAX, Math.round(next)));
      if (within === step) return;
      step = within;
      tell();
    },
    lcd: () => grid,
    setLcd(next) {
      if (next === grid) return;
      grid = next;
      tell();
    },
    colour: () => colours,
    setColour(next) {
      if (next === colours) return;
      colours = next;
      tell();
    },
    dim: () => dark,
    setDim(next) {
      if (next === dark) return;
      dark = next;
      tell();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
