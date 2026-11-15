/**
 * The settings of the game: whether its sound is off, how loud it is, and whether the screen has its LCD look. A tiny store that lives in the terminal's session, beside
 * the game's progress: in memory only, so the choices outlast leaving the game and visiting another page, and a
 * reload starts with the sound on at half volume again. Nothing is written to storage.
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
  /** Calls `listener` after every change; returns how to stop. */
  subscribe(listener: () => void): () => void;
};

/** The wheel has ten steps of 10%; it starts in the middle. */
export const VOLUME_MAX = 10;
export const VOLUME_START = 5;

export function createSettingsStore(muted = false, volume = VOLUME_START): SettingsStore {
  let off = muted;
  let step = volume;
  let grid = true;
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
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
