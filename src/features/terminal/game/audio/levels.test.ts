import { EFFECTS, TRACKS } from '../content/music.ts';
import { BOSS_TICKS, QUICK_TICKS, WILD_TICKS } from '../engine/transition.ts';
import { VOLUME_MAX } from '../settingsStore.ts';
import { gainFor, MAX_GAIN } from '../useGameSound.ts';
import type { Effect, Tone } from './player.ts';
import { createSequencer, flatten, parseVoice, stepSeconds, trackSteps, type Track } from './score.ts';

/**
 * The sound, checked with numbers because nobody listens to a test run. Nothing here plays or renders a sound:
 * these are sums over the data in content/music.ts. They can say that it does not clip, that no note is broken
 * and that the effects are short. They cannot say that it sounds good.
 *
 * Why adding up volumes is enough to rule out clipping: every source is a wave between -1 and 1 (a square, a
 * triangle, the normalised thin pulse, white noise) times its volume, so at any moment the signal is at most the
 * sum of the volumes of what sounds, times the gains after it. Those are the tune's own gain and the music bus
 * (both 1 in audio/player.ts) and the master, which is MAX_GAIN with the volume wheel all the way up.
 */

/** The gain of the tune and of the music and effect buses in audio/player.ts: all 1, nothing is boosted there. */
const BUS = 1;
/** The master with the wheel at 100%. */
const FULL = gainFor(VOLUME_MAX);
const BAR = 16;

/** The summed volume of the voices that sound at each step of a track: a drum counts for as long as it is written. */
function levels(track: Track): number[] {
  const sum = new Array<number>(trackSteps(track)).fill(0);
  for (const voice of track.voices) {
    for (const note of parseVoice(voice.notes).notes) {
      for (let step = note.step; step < note.step + note.steps; step++) sum[step]! += voice.volume;
    }
  }
  return sum;
}

/** The loudest step of a track, and the bar it is in (counted from 1). */
function loudest(track: Track) {
  const sum = levels(track);
  const peak = Math.max(...sum);
  return { peak, bar: Math.floor(sum.indexOf(peak) / BAR) + 1 };
}

const ends = (tone: Tone) => (tone.at ?? 0) + tone.duration;
const lengthOf = (effect: Effect) => Math.max(...effect.tones.map(ends));

/** The most an effect adds up to at one moment: the tones that overlap, checked where each one starts. */
function loudestOf(effect: Effect): number {
  return Math.max(
    ...effect.tones.map((tone) => {
      const at = tone.at ?? 0;
      return effect.tones.filter((other) => (other.at ?? 0) <= at && at < ends(other)).reduce((sum, other) => sum + other.volume, 0);
    }),
  );
}

const round = (value: number) => Math.round(value * 1000) / 1000;

const TRACK_ROWS = Object.entries(TRACKS).map(([name, track]) => {
  const { peak, bar } = loudest(track);
  return { name, track, peak: round(peak), out: round(peak * BUS * FULL), bar };
});
const EFFECT_ROWS = Object.entries(EFFECTS).map(([name, effect]) => ({ name, effect: effect!, peak: round(loudestOf(effect!)), length: round(lengthOf(effect!)) }));

describe('the master volume', () => {
  it('is a quarter of full scale with the wheel all the way up, and never more', () => {
    expect(FULL).toBe(MAX_GAIN);
    expect(MAX_GAIN).toBe(0.25);
    expect(gainFor(VOLUME_MAX + 5)).toBe(MAX_GAIN);
    expect(gainFor(0)).toBe(0);
  });
});

describe('the level of every tune', () => {
  // The worst step per track is in the name of its test, so a run with `--reporter=verbose` prints the table:
  // the voices summed, and what that is at the speakers with the master at 100%.
  it.each(TRACK_ROWS)('$name: its loudest step sums to $peak (bar $bar), which is $out of full scale at 100%: no clipping', ({ track, peak, out }) => {
    expect(peak).toBeGreaterThan(0);
    expect(out).toBeLessThanOrEqual(1);
    // Every step of every bar, not only the worst one.
    for (const level of levels(track)) expect(level * BUS * FULL).toBeLessThanOrEqual(1);
    // The voices alone already fit: four voices never add up to more than two full ones.
    expect(peak).toBeLessThanOrEqual(2);
  });

  it('stays under full scale with the loudest tune and the two loudest effects all at once', () => {
    const tune = Math.max(...TRACK_ROWS.map((row) => row.peak));
    const [first = 0, second = 0] = EFFECT_ROWS.map((row) => row.peak).sort((a, b) => b - a);
    expect(first).toBeGreaterThan(0);
    expect((tune + first + second) * BUS * FULL).toBeLessThanOrEqual(1);
  });
});

describe('the notes of every tune', () => {
  it.each(Object.entries(TRACKS))('%s: every note starts at a real time, lasts a real while and has a pitch that can be heard', (_name, track) => {
    const { notes, length } = flatten(track);
    expect(Number.isFinite(stepSeconds(track))).toBe(true);
    expect(stepSeconds(track)).toBeGreaterThan(0);
    expect(Number.isFinite(length)).toBe(true);
    expect(length).toBeGreaterThan(0);
    expect(notes.length).toBeGreaterThan(0);
    for (const note of notes) {
      expect(Number.isFinite(note.time)).toBe(true);
      expect(note.time).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(note.duration)).toBe(true);
      expect(note.duration).toBeGreaterThan(0);
      // No note runs past the end of its track (it would sound into the next round).
      expect(note.time + note.duration).toBeLessThanOrEqual(length + 1e-9);
      expect(Number.isFinite(note.volume)).toBe(true);
      expect(note.volume).toBeGreaterThan(0);
      if (note.drum) continue;
      expect(Number.isFinite(note.frequency)).toBe(true);
      // Hearing runs from about 20 Hz to 20 kHz; the tunes stay well inside it.
      expect(note.frequency).toBeGreaterThanOrEqual(20);
      expect(note.frequency).toBeLessThanOrEqual(20000);
    }
  });
});

describe('where a tune starts again', () => {
  it.each(Object.entries(TRACKS))('%s: its loop point is on a bar line inside the track, and only a tune that loops has one', (_name, track) => {
    const steps = trackSteps(track);
    const from = track.loopFrom ?? 0;
    expect(Number.isInteger(from)).toBe(true);
    expect(from).toBeGreaterThanOrEqual(0);
    expect(from % BAR).toBe(0);
    expect(from).toBeLessThan(steps);
    // What is played round and round is whole bars too.
    expect((steps - from) % BAR).toBe(0);
    if (!track.loop) expect(track.loopFrom).toBeUndefined();
    const { length, loopAt } = flatten(track);
    expect(loopAt).toBeCloseTo(from * stepSeconds(track), 9);
    expect(loopAt).toBeLessThan(length);
  });

  it.each(Object.entries(TRACKS).filter(([, track]) => track.loop))('%s: the second round starts with the notes at the loop point, right when the first round ends', (_name, track) => {
    const { notes, length, loopAt } = flatten(track);
    const first = notes.filter((note) => Math.abs(note.time - loopAt) < 1e-9);
    expect(first.length).toBeGreaterThan(0);
    const sequencer = createSequencer(track);
    const again = sequencer.take(length + 1e-6).filter((note) => note.time >= length - 1e-9);
    expect(again.map((note) => [note.voice, note.frequency, note.drum])).toEqual(first.map((note) => [note.voice, note.frequency, note.drum]));
    for (const note of again) expect(note.time).toBeCloseTo(length, 9);
    expect(sequencer.done).toBe(false);
  });
});

describe('the sound effects', () => {
  /** The effects that are allowed a second or more: only the boss's transition, which lasts 1.8 seconds itself. */
  const LONG: Record<string, number> = { showdown: BOSS_TICKS / 60 };

  it.each(EFFECT_ROWS)('$name: $length s long and $peak at its loudest: short, heard, and made of real numbers', ({ name, effect, peak, length }) => {
    expect(effect.tones.length).toBeGreaterThan(0);
    for (const tone of effect.tones) {
      expect(Number.isFinite(tone.duration)).toBe(true);
      expect(tone.duration).toBeGreaterThan(0);
      expect(Number.isFinite(tone.at ?? 0)).toBe(true);
      expect(tone.at ?? 0).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(tone.volume)).toBe(true);
      // Loud enough to be heard at all, and no single tone above half.
      expect(tone.volume).toBeGreaterThanOrEqual(0.05);
      expect(tone.volume).toBeLessThanOrEqual(0.5);
      for (const pitch of tone.to === undefined ? [tone.from] : [tone.from, tone.to]) {
        expect(Number.isFinite(pitch)).toBe(true);
        expect(pitch).toBeGreaterThan(0);
        if (tone.wave === 'noise') {
          // For noise this is how bright it is: 1 is hiss, 0.05 a rumble.
          expect(pitch).toBeLessThanOrEqual(1);
        } else {
          expect(pitch).toBeGreaterThanOrEqual(20);
          expect(pitch).toBeLessThanOrEqual(20000);
        }
      }
    }
    expect(length).toBeGreaterThan(0);
    expect(length).toBeLessThanOrEqual(LONG[name] ?? 0.999);
    expect(peak).toBeGreaterThan(0);
    expect(peak * BUS * FULL).toBeLessThanOrEqual(1);
    if (effect.gap !== undefined) {
      expect(Number.isFinite(effect.gap)).toBe(true);
      expect(effect.gap).toBeGreaterThanOrEqual(0);
      expect(effect.gap).toBeLessThan(1);
    }
  });

  it('has only the one long effect it says it has', () => {
    for (const name of Object.keys(LONG)) expect(EFFECTS).toHaveProperty([name]);
    expect(EFFECT_ROWS.filter((row) => row.length >= 1).map((row) => row.name)).toEqual(Object.keys(LONG));
  });

  it.each([
    ['encounter', WILD_TICKS],
    ['showdown', BOSS_TICKS],
    ['round', QUICK_TICKS],
  ] as const)('%s: fits inside its transition of %i ticks, and fills more than half of it', (name, ticks) => {
    const length = lengthOf(EFFECTS[name]!);
    expect(length).toBeLessThanOrEqual(ticks / 60);
    expect(length).toBeGreaterThan(ticks / 60 / 2);
  });
});
