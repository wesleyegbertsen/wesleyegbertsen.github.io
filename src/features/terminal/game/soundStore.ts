/**
 * Whether the game's sound is off. A tiny store that lives in the terminal's session, beside the game's progress:
 * in memory only, so the choice outlasts leaving the game and visiting another page, and a reload starts with
 * the sound on again. Nothing is written to storage.
 */
export type SoundStore = {
  /** True when the sound is off. */
  muted(): boolean;
  setMuted(muted: boolean): void;
  /** Calls `listener` after every change; returns how to stop. */
  subscribe(listener: () => void): () => void;
};

export function createSoundStore(muted = false): SoundStore {
  let off = muted;
  const listeners = new Set<() => void>();
  return {
    muted: () => off,
    setMuted(next) {
      if (next === off) return;
      off = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
