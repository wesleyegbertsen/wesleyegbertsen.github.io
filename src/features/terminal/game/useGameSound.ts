import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { trackFor } from './audio/director.ts';
import { createSound, type AudioLike, type Sound } from './audio/player.ts';
import { EFFECTS, JINGLES, TRACKS } from './content/music.ts';
import type { Cue, GameState, World } from './engine/types.ts';
import { VOLUME_MAX, VOLUME_START, type SoundStore } from './soundStore.ts';

/** The master gain with the wheel all the way up: modest, the game is a guest on the page. It starts half way. */
export const MAX_GAIN = 0.25;
/** The master gain for a step of the volume wheel: 0 is silent, the middle is 0.125, the top is 0.25. */
export const gainFor = (step: number) => (Math.max(0, Math.min(VOLUME_MAX, step)) / VOLUME_MAX) * MAX_GAIN;
/** The master volume the game starts at. */
export const VOLUME = gainFor(VOLUME_START);

/** The browser's AudioContext, or null where there is none (an old browser, a test). */
function browserContext(): AudioLike | null {
  const scope = window as unknown as { AudioContext?: new () => unknown; webkitAudioContext?: new () => unknown };
  const Context = scope.AudioContext ?? scope.webkitAudioContext;
  return Context ? (new Context() as AudioLike) : null;
}

type Options = {
  world: World;
  /** Whether the sound is off: the session's store, which outlasts the game. */
  store: SoundStore;
  /** For tests: where the context comes from. */
  context?: () => AudioLike | null;
};

/**
 * The game's sound, for as long as the game is on the page: one player (and at most one AudioContext) per visit,
 * closed when the game goes away, frozen while the tab is hidden. The component tells it what happens (`follow`
 * a state for the music, `play` the engine's cues); `toggle` is the mute switch and `turn` the volume wheel.
 */
export function useGameSound({ world, store, context = browserContext }: Options) {
  const player = useRef<Sound | null>(null);
  const wanted = useRef<string | null>(null);
  const muted = useSyncExternalStore(store.subscribe, store.muted);
  const volume = useSyncExternalStore(store.subscribe, store.volume);

  useEffect(() => {
    const sound = createSound({ context, tracks: TRACKS, effects: EFFECTS, volume: gainFor(store.volume()), muted: store.muted() });
    player.current = sound;
    sound.music(wanted.current);
    // `play` and Enter were a gesture, so the browser lets the sound start; a key or a touch in the game asks again.
    sound.unlock();
    if (document.hidden) sound.pause();
    const visibility = () => (document.hidden ? sound.pause() : sound.resume());
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      sound.close();
      player.current = null;
    };
  }, [context, store]);

  /** The music follows the game: the title, the town, a room, a battle, the ending. */
  const follow = useCallback(
    (state: GameState) => {
      wanted.current = trackFor(state, world);
      player.current?.music(wanted.current);
      return wanted.current;
    },
    [world],
  );

  const play = useCallback((cues: readonly Cue[]) => {
    for (const cue of cues) {
      const jingle = JINGLES[cue];
      if (jingle) player.current?.jingle(jingle);
      else player.current?.effect(cue);
    }
  }, []);

  const unlock = useCallback(() => player.current?.unlock(), []);

  /** Switches the sound off or on, and returns whether it is off now. */
  const toggle = useCallback(() => {
    const off = !store.muted();
    store.setMuted(off);
    player.current?.setMuted(off);
    // Switching on is itself a sound, so the switch can be heard.
    if (!off) player.current?.effect('confirm');
    return off;
  }, [store]);

  /** Turns the volume wheel by so many steps, and returns where it is now (0 to VOLUME_MAX). */
  const turn = useCallback(
    (steps: number) => {
      store.setVolume(store.volume() + steps);
      player.current?.setVolume(gainFor(store.volume()));
      return store.volume();
    },
    [store],
  );

  return useMemo(() => ({ muted, volume, follow, play, unlock, toggle, turn }), [muted, volume, follow, play, unlock, toggle, turn]);
}
