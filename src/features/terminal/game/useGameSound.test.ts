import { act, renderHook } from '@testing-library/react';
import { FakeAudio, type FakeOptions } from './audio/fakeAudio.ts';
import { frequencyOf } from './audio/score.ts';
import { EFFECTS, TRACKS } from './content/music.ts';
import { initialGame } from './engine/engine.ts';
import { play, testWorld } from './engine/testWorld.ts';
import type { World } from './engine/types.ts';
import { createSoundStore } from './soundStore.ts';
import { VOLUME, useGameSound } from './useGameSound.ts';

const world: World = {
  ...testWorld,
  music: { title: 'title', ending: 'ending', wild: 'battle', boss: 'boss', victory: 'victory', indoors: 'indoors', maps: { main: 'town' } },
};

function setup(fake: FakeOptions | null = {}, muted = false) {
  const made: FakeAudio[] = [];
  const store = createSoundStore(muted);
  const context = () => {
    if (!fake) return null;
    made.push(new FakeAudio(fake));
    return made.at(-1)!.as();
  };
  const hook = renderHook(() => useGameSound({ world, store, context }));
  return { made, store, ...hook, audio: () => made.at(-1)! };
}

const title = initialGame(world);
const inTown = play(title, 'a', 'a');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useGameSound', () => {
  it('makes one context when the game opens, at a modest volume, and wakes it', () => {
    const { made, audio, result } = setup({ suspended: true });
    expect(made).toHaveLength(1);
    expect(audio().calls.resume).toBe(1);
    expect(audio().master.gain.value).toBe(VOLUME);
    expect(VOLUME).toBeLessThanOrEqual(0.3);
    expect(result.current.muted).toBe(false);
  });

  it('plays the tune of the moment and changes it when the moment does', () => {
    const { audio, result } = setup();
    expect(audio().oscillators).toEqual([]);
    let named: string | null = null;
    act(() => {
      named = result.current.follow(title);
    });
    expect(named).toBe('title');
    const first = audio().oscillators[0]!;
    // The first note of the title tune, on the pulse voice.
    expect(first.frequency.first).toBeCloseTo(frequencyOf(TRACKS.title!.voices[0]!.notes.split(/[ :]/)[0]!), 6);
    const count = audio().oscillators.length;
    act(() => void result.current.follow(title));
    expect(audio().oscillators.length).toBe(count);

    act(() => {
      named = result.current.follow(inTown);
    });
    expect(named).toBe('town');
    expect(audio().oscillators.length).toBeGreaterThan(count);
    expect(first.stopAt).not.toBeNull();
  });

  it('turns cues into effects, and the badge cue into its jingle over the music', () => {
    const { audio, result } = setup();
    act(() => result.current.play(['cursor']));
    expect(audio().oscillators).toHaveLength(EFFECTS.cursor!.tones.length);
    expect(audio().oscillators[0]!.frequency.first).toBe(EFFECTS.cursor!.tones[0]!.from);
    expect(audio().oscillators[0]!.bus).toBe(audio().buses[1]);

    act(() => result.current.play(['badge']));
    // The jingle: more than one voice, and the music bus steps back.
    expect(audio().oscillators.length).toBeGreaterThan(8);
    expect(audio().buses[0]!.gain.events.length).toBeGreaterThan(0);
  });

  it('switches the sound off and on, keeps the choice in the store, and confirms switching on with a sound', () => {
    const { audio, result, store } = setup();
    act(() => void result.current.follow(title));
    let off = false;
    act(() => {
      off = result.current.toggle();
    });
    expect(off).toBe(true);
    expect(result.current.muted).toBe(true);
    expect(store.muted()).toBe(true);
    expect(audio().master.gain.value).toBe(0);
    const silent = audio().sources.length;
    act(() => result.current.play(['cursor', 'badge']));
    expect(audio().sources.length).toBe(silent);

    act(() => {
      off = result.current.toggle();
    });
    expect(off).toBe(false);
    expect(store.muted()).toBe(false);
    expect(audio().master.gain.value).toBe(VOLUME);
    // The confirm effect, and the tune again.
    expect(audio().sources.length).toBeGreaterThan(silent + EFFECTS.confirm!.tones.length);
  });

  it('starts silent when the session says the sound is off', () => {
    const { audio, result } = setup({}, true);
    expect(result.current.muted).toBe(true);
    act(() => void result.current.follow(title));
    expect(audio().master.gain.value).toBe(0);
    expect(audio().sources).toEqual([]);
  });

  it('freezes while the tab is hidden and carries on when it shows again', () => {
    const { audio, result } = setup();
    act(() => void result.current.follow(title));
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(audio().calls.suspend).toBe(1);
    const count = audio().sources.length;
    act(() => result.current.play(['cursor']));
    expect(audio().sources.length).toBe(count);

    hidden.mockReturnValue(false);
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(audio().calls.resume).toBe(1);
    act(() => result.current.play(['cursor']));
    expect(audio().sources.length).toBe(count + 1);
  });

  it('opens frozen in a tab that is hidden', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const { audio } = setup();
    expect(audio().calls.suspend).toBe(1);
  });

  it('closes the context when the game goes away: none is left behind, and nothing listens any more', () => {
    const first = setup();
    act(() => void first.result.current.follow(title));
    first.unmount();
    expect(first.audio().calls.close).toBe(1);
    expect(first.audio().sounding(first.audio().currentTime + 1)).toEqual([]);
    // Hidden or shown after that: nobody listens any more.
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(first.audio().calls.suspend + first.audio().calls.resume).toBe(0);
    expect(first.made).toHaveLength(1);
  });

  it('asks the browser again on a key or a touch, without making a second context', () => {
    const { made, audio, result } = setup({ suspended: true, refuse: true });
    expect(audio().calls.resume).toBe(1);
    act(() => void result.current.unlock());
    expect(audio().calls.resume).toBe(2);
    expect(made).toHaveLength(1);
  });

  it('is a quiet no-op where there is no AudioContext', () => {
    const { made, result, store } = setup(null);
    expect(made).toEqual([]);
    expect(() =>
      act(() => {
        result.current.unlock();
        result.current.follow(inTown);
        result.current.play(['cursor', 'badge']);
        result.current.toggle();
      }),
    ).not.toThrow();
    // The switch still works, for the next visit and for the picture on the screen.
    expect(store.muted()).toBe(true);
    expect(result.current.muted).toBe(true);
  });

  it('finds the browser AudioContext by itself, also under its old name, and copes with none at all', () => {
    const made: FakeAudio[] = [];
    class Stub extends FakeAudio {
      constructor() {
        super();
        made.push(this);
      }
    }
    vi.stubGlobal('webkitAudioContext', Stub);
    const store = createSoundStore();
    const old = renderHook(() => useGameSound({ world, store }));
    expect(made).toHaveLength(1);
    old.unmount();
    vi.unstubAllGlobals();

    expect(() => renderHook(() => useGameSound({ world, store }))).not.toThrow();
    expect(made).toHaveLength(1);
  });
});
