import { FakeAudio, fakeTimer, type FakeOptions } from './fakeAudio.ts';
import { FADE, LOOKAHEAD, createSound, type Effect, type SoundOptions } from './player.ts';
import type { Track } from './score.ts';

// At 150 beats a minute a step is 0.1 s, which keeps the numbers readable.
const TRACKS: Record<string, Track> = {
  // Two bars of 0.8 s: 440 Hz and 659 Hz on the pulse voice, 110 Hz under them.
  walk: {
    bpm: 150,
    loop: true,
    voices: [
      { wave: 'pulse', volume: 0.5, notes: 'A4:4 -:4 E5:4 -:4' },
      { wave: 'triangle', volume: 0.6, notes: 'A2:16' },
    ],
  },
  fight: {
    bpm: 150,
    loop: true,
    voices: [
      { wave: 'thin', volume: 0.3, notes: 'C5:2 C5:2' },
      { wave: 'noise', volume: 0.2, notes: 'k:2 h:2' },
    ],
  },
  fanfare: { bpm: 150, loop: false, voices: [{ wave: 'pulse', volume: 0.5, notes: 'C5:2 E5:2 G5:4' }] },
};

const EFFECTS: Record<string, Effect> = {
  beep: { tones: [{ wave: 'pulse', from: 880, duration: 0.05, volume: 0.2 }] },
  slide: { tones: [{ wave: 'triangle', from: 400, to: 100, duration: 0.2, volume: 0.3, at: 0.1 }] },
  thud: { tones: [{ wave: 'noise', from: 0.5, to: 0.1, duration: 0.1, volume: 0.4 }], gap: 0.3 },
};

function setup(fake: FakeOptions = {}, options: Partial<SoundOptions> = {}) {
  const audio = new FakeAudio(fake);
  const clock = fakeTimer();
  const made = { count: 0 };
  const sound = createSound({
    context: () => {
      made.count++;
      return audio.as();
    },
    tracks: TRACKS,
    effects: EFFECTS,
    timer: clock.timer,
    ...options,
  });
  /** Lets `seconds` pass: the context's clock moves on and the player's timer ticks. */
  const pass = (seconds: number) => {
    audio.currentTime += seconds;
    clock.tick();
  };
  const pitches = (from = 0) => audio.oscillators.slice(from).map((oscillator) => Math.round(oscillator.frequency.first ?? 0));
  return { audio, clock, made, sound, pass, pitches };
}

describe('the sound player', () => {
  it('makes no context until it is unlocked, and only one however often that is', () => {
    const { made, sound, audio } = setup();
    sound.music('walk');
    sound.effect('beep');
    expect(made.count).toBe(0);
    expect(sound.track).toBe('walk');

    sound.unlock();
    sound.unlock();
    expect(made.count).toBe(1);
    expect(audio.calls.resume).toBe(0);
    expect(audio.master.gain.value).toBe(0.25);
    expect(audio.buses).toHaveLength(2);
  });

  it('wakes a context that the browser started asleep, every time it is asked', () => {
    const { sound, audio } = setup({ suspended: true });
    sound.unlock();
    expect(audio.calls.resume).toBe(1);
    expect(audio.state).toBe('running');
  });

  it('wakes a context that the browser left interrupted, as iOS does after a call', () => {
    const { sound, audio } = setup({ interrupted: true });
    sound.unlock();
    expect(audio.calls.resume).toBe(1);
    expect(audio.state).toBe('running');
  });

  it('closes a context it could not finish setting up, instead of leaking one per key press', () => {
    const audios: FakeAudio[] = [];
    const sound = createSound({
      context: () => {
        const audio = new FakeAudio({ failGainAt: 2 });
        audios.push(audio);
        return audio.as();
      },
      tracks: TRACKS,
      effects: EFFECTS,
      timer: fakeTimer().timer,
    });
    sound.unlock();
    expect(audios[0]!.calls.close).toBe(1);
    sound.unlock();
    expect(audios).toHaveLength(2);
    expect(audios[1]!.calls.close).toBe(1);
  });

  it('starts the wanted tune as soon as there is a context: the notes within the lookahead, at their times', () => {
    const { sound, audio, pitches } = setup();
    sound.music('walk');
    sound.unlock();
    // Within 0.4 s: the first A and the bass under it. The E at 0.8 s is not due yet.
    expect(pitches()).toEqual([440, 110]);
    const [lead, bass] = audio.oscillators;
    expect(lead!.type).toBe('square');
    expect(bass!.type).toBe('triangle');
    expect(lead!.startAt).toBeCloseTo(0.06, 6);
    expect(lead!.stopAt).toBeGreaterThan(lead!.startAt!);
    expect(lead!.out.gain.first).toBe(0.5);
    expect(lead!.out.gain.last).toBe(0);
    // The tune plays through its own gain, on the music bus, which goes to the master.
    expect(lead!.bus).toBe(bass!.bus);
    expect((lead!.bus as { to: unknown[] }).to).toEqual([audio.buses[0]]);
  });

  it('schedules on as time passes, each note once, and round the loop', () => {
    const { audio, sound, pass, pitches } = setup();
    sound.music('walk');
    sound.unlock();
    pass(0.1);
    expect(pitches()).toEqual([440, 110]);
    pass(0.4);
    expect(pitches()).toEqual([440, 110, 659]);
    expect(audio.oscillators[2]!.startAt).toBeCloseTo(0.06 + 0.8, 6);
    for (let i = 0; i < 40; i++) pass(0.1);
    // 4.5 s on: the loop of 1.6 s has come round three times.
    const starts = audio.oscillators.map((oscillator) => +oscillator.startAt!.toFixed(2));
    expect(new Set(starts.filter((_, i) => pitches()[i] === 440)).size).toBe(starts.filter((_, i) => pitches()[i] === 440).length);
    expect(pitches().filter((pitch) => pitch === 440)).toHaveLength(4);
    expect(starts.at(-1)).toBeLessThanOrEqual(+(audio.currentTime + LOOKAHEAD + 0.06).toFixed(2));
  });

  it('does not start the same tune again, and fades into another one', () => {
    const { audio, sound, pitches } = setup();
    sound.music('walk');
    sound.unlock();
    const before = audio.oscillators.length;
    sound.music('walk');
    expect(audio.oscillators.length).toBe(before);

    audio.currentTime = 0.2;
    const old = audio.oscillators.slice();
    const oldGain = old[0]!.bus as { gain: { last: number; events: { kind: string; time: number }[] } };
    sound.music('fight');
    expect(sound.track).toBe('fight');
    expect(oldGain.gain.last).toBe(0);
    expect(oldGain.gain.events.at(-1)).toMatchObject({ kind: 'linear', time: 0.2 + FADE });
    for (const oscillator of old) expect(oscillator.stopAt).toBeCloseTo(0.2 + FADE + 0.01, 6);
    // The new tune: a thin pulse (a wave of its own) and noise for the drums.
    expect(pitches(before)).toEqual([523, 523]);
    expect(audio.oscillators[before]!.type).toBe('custom');
    expect(audio.noises).toHaveLength(2);
    expect(audio.noises[0]!.playbackRate.first).toBe(0.1);
    expect(audio.noises[1]!.playbackRate.first).toBe(1);
    expect(audio.noises[0]!.bus).not.toBe(oldGain);
  });

  it('plays a tune that does not loop once, and goes silent for no tune', () => {
    const { audio, sound, pass, clock } = setup();
    sound.unlock();
    sound.music('fanfare');
    for (let i = 0; i < 30; i++) pass(0.1);
    expect(audio.oscillators).toHaveLength(3);

    sound.music(null);
    expect(sound.track).toBeNull();
    expect(clock.count).toBe(0);
    for (let i = 0; i < 10; i++) pass(0.1);
    expect(audio.oscillators).toHaveLength(3);
    expect(audio.sounding(audio.currentTime + 1)).toEqual([]);
    sound.music('nothing by that name');
    expect(audio.oscillators).toHaveLength(3);
  });

  it('plays an effect at once: a tone, a slide, a burst of noise, on the effect bus', () => {
    const { audio, sound } = setup();
    sound.unlock();
    audio.currentTime = 2;
    sound.effect('beep');
    sound.effect('slide');
    sound.effect('thud');
    sound.effect('no such effect');
    const [beep, slide] = audio.oscillators;
    expect(beep!.frequency.first).toBe(880);
    expect(beep!.startAt).toBe(2);
    expect(beep!.out.gain.first).toBe(0.2);
    expect(slide!.startAt).toBeCloseTo(2.1, 6);
    expect(slide!.type).toBe('triangle');
    expect(slide!.frequency.events.at(-1)).toMatchObject({ kind: 'exponential', value: 100 });
    expect(audio.noises).toHaveLength(1);
    expect(audio.noises[0]!.playbackRate.events.at(-1)).toMatchObject({ kind: 'linear', value: 0.1 });
    expect(beep!.bus).toBe(audio.buses[1]);
    expect(audio.oscillators).toHaveLength(2);
  });

  it('leaves a gap between two of the same effect when the effect asks for one', () => {
    const { audio, sound } = setup();
    sound.unlock();
    sound.effect('thud');
    audio.currentTime = 0.2;
    sound.effect('thud');
    expect(audio.noises).toHaveLength(1);
    audio.currentTime = 0.31;
    sound.effect('thud');
    expect(audio.noises).toHaveLength(2);
    sound.effect('beep');
    sound.effect('beep');
    expect(audio.oscillators).toHaveLength(2);
  });

  it('plays a jingle over the tune, which steps back for it and returns', () => {
    const { audio, sound } = setup();
    sound.music('walk');
    sound.unlock();
    const before = audio.oscillators.length;
    audio.currentTime = 1;
    sound.jingle('fanfare');
    const jingle = audio.oscillators.slice(before);
    expect(jingle.map((oscillator) => Math.round(oscillator.frequency.first!))).toEqual([523, 659, 784]);
    expect(jingle.every((oscillator) => oscillator.bus === audio.buses[1])).toBe(true);
    const duck = audio.buses[0]!.gain.events;
    expect(duck.find((event) => event.kind === 'set')!.value).toBeLessThan(0.01);
    expect(duck.at(-1)).toMatchObject({ kind: 'linear', value: 1 });
    expect(duck.at(-1)!.time).toBeGreaterThan(1 + 0.8);
    sound.jingle('no such jingle');
    expect(audio.oscillators).toHaveLength(before + 3);
  });

  it('mutes: the master goes to zero, what sounds is stopped, nothing new is made, and the tune starts afresh after', () => {
    const { audio, sound, pass, pitches } = setup();
    sound.music('walk');
    sound.unlock();
    pass(0.1);
    sound.setMuted(true);
    expect(sound.muted).toBe(true);
    expect(audio.master.gain.value).toBe(0);
    expect(audio.master.gain.last).toBe(0);
    expect(audio.sounding(audio.currentTime + FADE + 0.05)).toEqual([]);
    const made = audio.sources.length;
    for (let i = 0; i < 20; i++) pass(0.1);
    sound.effect('beep');
    sound.jingle('fanfare');
    sound.music('fight');
    expect(audio.sources.length).toBe(made);

    sound.setMuted(false);
    expect(audio.master.gain.value).toBe(0.25);
    expect(audio.master.gain.last).toBe(0.25);
    expect(pitches(audio.oscillators.length - 2)).toEqual([523, 523]);
    expect(audio.oscillators.at(-2)!.startAt).toBeGreaterThan(audio.currentTime);
    sound.setMuted(false);
    expect(sound.muted).toBe(false);
  });

  it('can start muted: a silent master and no notes, until the sound is switched on', () => {
    const { audio, sound, pitches } = setup({}, { muted: true });
    sound.music('walk');
    sound.unlock();
    expect(audio.master.gain.value).toBe(0);
    expect(audio.sources).toEqual([]);
    sound.setMuted(false);
    expect(pitches()).toEqual([440, 110]);
  });

  it('freezes when the tab is hidden and carries on when it shows again', () => {
    const { audio, sound, clock, pass, pitches } = setup();
    sound.music('walk');
    sound.unlock();
    expect(clock.count).toBe(1);
    sound.pause();
    sound.pause();
    expect(audio.calls.suspend).toBe(1);
    expect(clock.count).toBe(0);
    sound.effect('beep');
    sound.unlock();
    expect(audio.calls.resume).toBe(0);
    expect(pitches()).toEqual([440, 110]);

    sound.resume();
    expect(audio.calls.resume).toBe(1);
    expect(clock.count).toBe(1);
    pass(0.5);
    expect(pitches()).toEqual([440, 110, 659]);
  });

  it('starts the tune that was asked for while it was paused once it resumes', () => {
    const { sound, pitches } = setup();
    sound.unlock();
    sound.pause();
    sound.music('walk');
    expect(pitches()).toEqual([]);
    sound.resume();
    expect(pitches()).toEqual([440, 110]);
  });

  it('closes: everything stops, the context is given back, and it stays silent after', () => {
    const { audio, sound, clock, made } = setup();
    sound.music('walk');
    sound.unlock();
    const count = audio.sources.length;
    sound.close();
    sound.close();
    expect(audio.calls.close).toBe(1);
    expect(clock.count).toBe(0);
    expect(audio.sounding(audio.currentTime + 0.05)).toEqual([]);

    sound.unlock();
    sound.music('fight');
    sound.effect('beep');
    sound.jingle('fanfare');
    sound.setMuted(true);
    sound.resume();
    expect(made.count).toBe(1);
    expect(audio.sources.length).toBe(count);
  });

  it('works without an AudioContext: every call is a quiet no-op', () => {
    const clock = fakeTimer();
    for (const context of [
      () => null,
      () => {
        throw new Error('no audio here');
      },
    ]) {
      const sound = createSound({ context, tracks: TRACKS, effects: EFFECTS, timer: clock.timer });
      expect(() => {
        sound.unlock();
        sound.music('walk');
        sound.effect('beep');
        sound.jingle('fanfare');
        sound.setMuted(true);
        sound.setMuted(false);
        sound.pause();
        sound.resume();
        sound.unlock();
        sound.close();
      }).not.toThrow();
      expect(sound.track).toBe('walk');
    }
    expect(clock.count).toBe(0);
  });

  it('survives a browser that refuses to start the context', async () => {
    const { audio, sound, pitches } = setup({ suspended: true, refuse: true });
    sound.music('walk');
    sound.unlock();
    sound.pause();
    sound.resume();
    // A rejection nobody handles would fail the test run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(audio.calls.resume).toBe(2);
    expect(audio.state).toBe('suspended');
    expect(pitches()).toEqual([440, 110]);
  });

  it('leaves out what an old browser cannot do: no noise, a plain square for the thin pulse', () => {
    const { audio, sound, pitches } = setup({ without: ['createBuffer', 'createPeriodicWave'] });
    sound.music('fight');
    sound.unlock();
    sound.effect('thud');
    expect(audio.noises).toEqual([]);
    expect(pitches()).toEqual([523, 523]);
    expect(audio.oscillators[0]!.type).toBe('square');
  });

  it('keeps going when the context throws in the middle of a note', () => {
    const { audio, sound } = setup();
    sound.unlock();
    audio.createOscillator = () => {
      throw new Error('out of voices');
    };
    expect(() => {
      sound.music('walk');
      sound.effect('beep');
      sound.jingle('fanfare');
    }).not.toThrow();
  });
});
