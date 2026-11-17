import { act, renderHook } from '@testing-library/react';
import { FakeAudio, type FakeOptions } from './audio/fakeAudio.ts';
import { LOOKAHEAD } from './audio/player.ts';
import { flatten, frequencyOf } from './audio/score.ts';
import { CRIES, EFFECTS, TRACKS } from './content/music.ts';
import { ENTER_TICKS } from './engine/battle.ts';
import { initialGame, step } from './engine/engine.ts';
import { play, testWorld } from './engine/testWorld.ts';
import { NO_INPUT, type GameState, type World } from './engine/types.ts';
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

describe('the way a battle opens, heard', () => {
  it('has the battle tune playing while the enemy comes in, pauses it for the cry once it is in place, and goes on after', () => {
    vi.useFakeTimers();
    try {
      const { audio, result } = setup();
      const tune = (time: number) => audio().sounding(time).filter((source) => (source.bus as { to: unknown[] }).to.includes(audio().buses[0]));
      // Into the tall grass with motion, the game's ticks driving the sound as the page does (60 a second).
      let state = step(play(inTown, 'down'), { ...NO_INPUT, dir: 'right', pressed: 'right' }, world).state;
      let cried: number | null = null;
      let slide: number | null = null;
      for (let i = 0; i < 400 && cried === null; i++) {
        const next = step(state, NO_INPUT, world);
        state = next.state;
        audio().currentTime += 1 / 60;
        act(() => {
          result.current.follow(state);
          // (The test world's rat has no cry of its own; the BUG's, from the game's CRIES, stands in.)
          result.current.play(next.cues.map((cue) => (cue === 'cry:rat' ? 'cry:bug' : cue)));
          vi.advanceTimersByTime(1000 / 60);
        });
        if (slide === null && state.battle?.enter) slide = audio().currentTime;
        if (next.cues.includes('cry:rat')) cried = audio().currentTime;
      }
      expect(slide).not.toBeNull();
      expect(cried).not.toBeNull();
      // The cry comes when the enemy is in place: ENTER_TICKS after the battle screen came up.
      expect(cried! - slide!).toBeCloseTo(ENTER_TICKS / 60, 6);
      // While it came in, the tune was already playing.
      expect(tune((slide! + cried!) / 2).length).toBeGreaterThan(0);
      // Silent for the length of the cry, then on again.
      const length = CRIES.bug!.duration;
      for (let at = cried! + 0.001; at < cried! + length - 0.005; at += 0.02) expect(tune(at), `${at}`).toHaveLength(0);
      expect(tune(cried! + length + 0.01).length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the player piano, heard', () => {
  it('replaces the tune of its room with the piece, and the tune comes back from its start when it stops', () => {
    const pianoWorld: World = { ...world, pieces: [{ id: 'moon', name: 'MOONLIGHT SONATA', artist: 'BEETHOVEN', track: 'moonlight', ticks: 100 }] };
    const made: FakeAudio[] = [];
    const store = createSettingsStore(false);
    const context = () => {
      made.push(new FakeAudio({}));
      return made.at(-1)!.as();
    };
    const { result } = renderHook(() => useGameSound({ world: pianoWorld, store, context }));
    const audio = made.at(-1)!;
    const pitches = (from: number) => audio.oscillators.slice(from).map((oscillator) => Math.round(oscillator.frequency.first ?? 0));
    // The notes each voice starts with (a voice that starts with a rest has none at the start).
    const firstOf = (track: string) =>
      TRACKS[track]!.voices.map((voice) => voice.notes.trim().split(/\s+/)[0]!.split(':')[0]!).filter((token) => /^[A-G]/.test(token)).map((name) => Math.round(frequencyOf(name)));

    act(() => void result.current.follow(inTown));
    expect(pitches(0)).toEqual(expect.arrayContaining(firstOf('town')));
    const town = audio.oscillators.slice();
    // On: the piece, from its first notes; the town's tune is let go.
    let from = audio.oscillators.length;
    act(() => void expect(result.current.follow({ ...inTown, piano: { map: inTown.map, piece: 'moon', ticks: 100 } })).toBe('moonlight'));
    expect(pitches(from)).toEqual(expect.arrayContaining(firstOf('moonlight')));
    for (const oscillator of town) expect(oscillator.stopAt, 'the town tune stops').not.toBeNull();
    // Off: the town's tune again, from its start.
    from = audio.oscillators.length;
    act(() => void expect(result.current.follow(inTown)).toBe('town'));
    expect(pitches(from).slice(0, firstOf('town').length)).toEqual(expect.arrayContaining(firstOf('town')));
  });

  // The piece as the game has it: its length in ticks (60 a second), as content/world.ts works it out.
  const moonlight = flatten(TRACKS.moonlight!);
  const pieceWorld: World = { ...world, pieces: [{ id: 'moon', name: 'MOONLIGHT SONATA', artist: 'BEETHOVEN', track: 'moonlight', ticks: Math.round(moonlight.length * 60) }] };
  const playing = (ticks: number): GameState => ({ ...inTown, piano: { map: inTown.map, piece: 'moon', ticks } });
  /** The pitches of the piece's notes that start from `at` seconds into it, within the player's lookahead. */
  const due = (at: number) =>
    moonlight.notes
      .filter((note) => note.time >= at - 1e-6 && note.time < at + LOOKAHEAD - 0.06)
      .map((note) => Math.round(note.frequency))
      .sort((a, b) => a - b);
  const heard = (audio: FakeAudio, from: number) =>
    audio.oscillators
      .slice(from)
      .filter((oscillator) => oscillator.bus !== audio.buses[1])
      .map((oscillator) => Math.round(oscillator.frequency.first ?? 0))
      .sort((a, b) => a - b);

  it('carries the piece on where the game has it after the sound was off and on again, instead of starting it over', () => {
    const made: FakeAudio[] = [];
    const store = createSettingsStore(false);
    const context = () => (made.push(new FakeAudio({})), made.at(-1)!.as());
    const { result } = renderHook(() => useGameSound({ world: pieceWorld, store, context }));
    const audio = made.at(-1)!;
    const length = pieceWorld.pieces![0]!.ticks;
    act(() => void result.current.follow(playing(length)));
    act(() => void result.current.toggle());
    // A minute later (the engine has counted 3,600 ticks of it meanwhile): the sound on again.
    audio.currentTime += 60;
    act(() => void result.current.follow(playing(length - 3600)));
    const from = audio.oscillators.length;
    act(() => void result.current.toggle());
    expect(due(60)).not.toEqual(due(0));
    expect(heard(audio, from)).toEqual(due(60));
  });

  it('starts the piece where the game has it on coming back to the game, not from its first note', () => {
    const made: FakeAudio[] = [];
    const store = createSettingsStore(false);
    const context = () => (made.push(new FakeAudio({})), made.at(-1)!.as());
    const { result } = renderHook(() => useGameSound({ world: pieceWorld, store, context }));
    // The session kept the piano playing, a minute into its piece.
    act(() => void result.current.follow(playing(pieceWorld.pieces![0]!.ticks - 3600)));
    expect(heard(made.at(-1)!, 0)).toEqual(due(60));
  });
});
