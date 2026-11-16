import { act, renderHook } from '@testing-library/react';
import { FakeAudio, type FakeOptions } from './audio/fakeAudio.ts';
import { frequencyOf } from './audio/score.ts';
import { CRIES, EFFECTS, TRACKS } from './content/music.ts';
import { initialGame } from './engine/engine.ts';
import { play, testWorld } from './engine/testWorld.ts';
import type { World } from './engine/types.ts';
import { createSettingsStore } from './settingsStore.ts';
import { MAX_GAIN, VOLUME, gainFor, useGameSound } from './useGameSound.ts';

const world: World = {
  ...testWorld,
  music: { title: 'title', ending: 'ending', wild: 'battle', boss: 'boss', victory: 'victory', indoors: 'indoors', maps: { main: 'town' } },
};

function setup(fake: FakeOptions | null = {}, muted = false) {
  const made: FakeAudio[] = [];
  const store = createSettingsStore(muted);
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
    const store = createSettingsStore();
    const old = renderHook(() => useGameSound({ world, store }));
    expect(made).toHaveLength(1);
    old.unmount();
    vi.unstubAllGlobals();

    expect(() => renderHook(() => useGameSound({ world, store }))).not.toThrow();
    expect(made).toHaveLength(1);
  });

  it('maps the volume wheel to the master: the top is a modest 0.25, half way (the start) is half of that, the bottom is silence', () => {
    expect(gainFor(5)).toBe(0.125);
    expect(gainFor(10)).toBe(0.25);
    expect(gainFor(0)).toBe(0);
    expect(gainFor(99)).toBe(MAX_GAIN);
    expect(VOLUME).toBe(0.125);
    for (let step = 1; step <= 10; step++) expect(gainFor(step)).toBeGreaterThan(gainFor(step - 1));
  });

  it('turns the wheel a step at a time, keeps it in the store, and stops at both ends', () => {
    const { audio, result, store } = setup();
    expect(result.current.volume).toBe(5);
    let now = 0;
    act(() => {
      now = result.current.turn(1);
    });
    expect(now).toBe(6);
    expect(result.current.volume).toBe(6);
    expect(store.volume()).toBe(6);
    expect(audio().master.gain.value).toBeCloseTo(0.15, 6);
    act(() => {
      for (let i = 0; i < 9; i++) now = result.current.turn(1);
    });
    expect(now).toBe(10);
    expect(audio().master.gain.value).toBe(0.25);
    act(() => {
      for (let i = 0; i < 14; i++) now = result.current.turn(-1);
    });
    expect(now).toBe(0);
    expect(audio().master.gain.value).toBe(0);
  });

  it('keeps the wheel and the mute switch apart, and starts a new visit at the level the session remembers', () => {
    const { audio, result, store } = setup();
    act(() => void result.current.toggle());
    act(() => void result.current.turn(3));
    expect(store.volume()).toBe(8);
    expect(store.muted()).toBe(true);
    expect(audio().master.gain.value).toBe(0);
    act(() => void result.current.toggle());
    expect(audio().master.gain.value).toBeCloseTo(0.2, 6);

    const made: FakeAudio[] = [];
    const remembered = createSettingsStore(false, 2);
    renderHook(() =>
      useGameSound({
        world,
        store: remembered,
        context: () => {
          made.push(new FakeAudio({}));
          return made.at(-1)!.as();
        },
      }),
    );
    expect(made[0]!.master.gain.value).toBeCloseTo(0.05, 6);
  });

  it('plays the level-up jingle and a blip for a turn of the wheel', () => {
    const { audio, result } = setup();
    const before = audio().sources.length;
    act(() => result.current.play(['louder']));
    expect(audio().sources.length).toBe(before + EFFECTS.louder!.tones.length);
    const then = audio().sources.length;
    act(() => result.current.play(['levelup']));
    expect(audio().sources.length).toBeGreaterThan(then + 5);
  });
});

describe('a cry in a battle', () => {
  it('pauses the battle tune for the length of the cry (from its data), then the tune carries on', () => {
    const { audio, result } = setup();
    // In the tall grass: the battle tune starts with the battle, as it always did.
    const battle = play(inTown, 'down', 'right');
    expect(battle.battle).not.toBeNull();
    act(() => void result.current.follow(battle));
    const tune = (time: number) => audio().sounding(time).filter((source) => (source.bus as { to: unknown[] }).to.includes(audio().buses[0]));
    expect(tune(0.1).length).toBeGreaterThan(0);
    // A cry: as long as its entry in CRIES says, the tune is silent; then it sounds again.
    audio().currentTime = 0.1;
    // (The test world's rat has no cry of its own; the BUG's, from the game's CRIES, stands in.)
    const length = CRIES.bug!.duration;
    act(() => result.current.play(['cry:bug']));
    for (let at = 0.1; at < 0.1 + length - 0.005; at += 0.02) expect(tune(at), `${at}`).toHaveLength(0);
    expect(tune(0.1 + length + 0.01).length).toBeGreaterThan(0);
    // And it is the same tune: nothing new was asked of the player.
    expect(result.current.follow(battle)).toBe('battle');
  });
});
