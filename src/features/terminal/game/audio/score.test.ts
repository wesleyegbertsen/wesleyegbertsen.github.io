import { EFFECTS, JINGLES, MUSIC, TRACKS } from '../content/music.ts';
import type { Cue } from '../engine/types.ts';
import { createSequencer, flatten, frequencyOf, parseVoice, stepSeconds, trackSteps, type Track } from './score.ts';

const CUES: Cue[] = ['cursor', 'confirm', 'cancel', 'blip', 'door', 'item', 'star', 'badge', 'bump', 'heal', 'hit', 'hurt', 'miss', 'faint', 'low', 'run', 'encounter'];

const tune = (notes: string, extra: Partial<Track> = {}): Track => ({ bpm: 150, loop: false, voices: [{ wave: 'pulse', volume: 0.5, notes }], ...extra });

describe('note names', () => {
  it('turns a name into its frequency', () => {
    expect(frequencyOf('A4')).toBe(440);
    expect(frequencyOf('A5')).toBe(880);
    expect(frequencyOf('C4')).toBeCloseTo(261.63, 2);
    expect(frequencyOf('F#3')).toBeCloseTo(185, 1);
    expect(frequencyOf('Bb3')).toBeCloseTo(frequencyOf('A#3'), 6);
  });

  it('refuses what is not a note', () => {
    for (const bad of ['H4', 'C', '4', 'c4', 'C#', 'C10', '']) expect(() => frequencyOf(bad)).toThrow(/Not a note/);
  });
});

describe('a voice', () => {
  it('places notes on steps: a length after the colon, one step without, rests leave a gap, bar lines are skipped', () => {
    const { notes, steps } = parseVoice('C4 D4:2 | -:3 E4:4');
    expect(steps).toBe(10);
    expect(notes.map((note) => [note.step, note.steps])).toEqual([
      [0, 1],
      [1, 2],
      [6, 4],
    ]);
    expect(notes[2]!.frequency).toBeCloseTo(329.63, 2);
  });

  it('reads the drums of a noise voice', () => {
    expect(parseVoice('k:2 h s:4').notes).toEqual([
      { step: 0, steps: 2, frequency: 0, drum: 'k' },
      { step: 2, steps: 1, frequency: 0, drum: 'h' },
      { step: 3, steps: 4, frequency: 0, drum: 's' },
    ]);
  });

  it('names the token that is wrong', () => {
    expect(() => parseVoice('C4 X9')).toThrow(/'X9'/);
    expect(() => parseVoice('C4:0')).toThrow(/Bad length in 'C4:0'/);
    expect(() => parseVoice('C4:1.5')).toThrow(/Bad length/);
    expect(() => parseVoice('C4:2:2')).toThrow(/Bad length/);
    expect(parseVoice('   ')).toEqual({ notes: [], steps: 0 });
  });
});

describe('a track', () => {
  it('gives every note a time in seconds from the tempo: four steps to the beat', () => {
    const track: Track = {
      bpm: 150,
      loop: false,
      voices: [
        { wave: 'pulse', volume: 0.5, notes: 'A4:2 -:2 A5:4' },
        { wave: 'triangle', volume: 0.6, notes: 'A2:8' },
      ],
    };
    expect(stepSeconds(track)).toBeCloseTo(0.1, 9);
    expect(trackSteps(track)).toBe(8);
    const { notes, length, loopAt } = flatten(track);
    expect(length).toBeCloseTo(0.8, 9);
    expect(loopAt).toBe(0);
    expect(notes.map((note) => [note.voice, note.wave, +note.time.toFixed(3), +note.duration.toFixed(3), Math.round(note.frequency)])).toEqual([
      [0, 'pulse', 0, 0.2, 440],
      [1, 'triangle', 0, 0.8, 110],
      [0, 'pulse', 0.4, 0.4, 880],
    ]);
    expect(notes[0]!.volume).toBe(0.5);
  });

  it('hands its notes out as time passes, each one once', () => {
    const sequencer = createSequencer(tune('A4 B4 C5 D5'));
    expect(sequencer.take(0)).toEqual([]);
    expect(sequencer.take(0.15).map((note) => Math.round(note.frequency))).toEqual([440, 494]);
    expect(sequencer.take(0.15)).toEqual([]);
    expect(sequencer.done).toBe(false);
    expect(sequencer.take(10).map((note) => Math.round(note.frequency))).toEqual([523, 587]);
    expect(sequencer.take(20)).toEqual([]);
    expect(sequencer.done).toBe(true);
  });

  it('goes round and round when it loops, later each time', () => {
    const sequencer = createSequencer(tune('A4:2 B4:2', { loop: true }));
    const times = sequencer.take(1.3).map((note) => [Math.round(note.frequency), +note.time.toFixed(2)]);
    expect(times).toEqual([
      [440, 0],
      [494, 0.2],
      [440, 0.4],
      [494, 0.6],
      [440, 0.8],
      [494, 1],
      [440, 1.2],
    ]);
    expect(sequencer.done).toBe(false);
    expect(sequencer.take(1.5).map((note) => +note.time.toFixed(2))).toEqual([1.4]);
  });

  it('plays an intro once and loops from the loop point', () => {
    const sequencer = createSequencer(tune('C4:2 A4:2 B4:2', { loop: true, loopFrom: 2 }));
    expect(flatten(tune('C4:2 A4:2 B4:2', { loop: true, loopFrom: 2 })).loopAt).toBeCloseTo(0.2, 9);
    const heard = sequencer.take(1.19).map((note) => [Math.round(note.frequency), +note.time.toFixed(2)]);
    expect(heard).toEqual([
      [262, 0],
      [440, 0.2],
      [494, 0.4],
      [440, 0.6],
      [494, 0.8],
      [440, 1],
    ]);
  });

  it('gives one round when asked for everything, and does not hang on an empty loop', () => {
    expect(createSequencer(tune('A4 B4', { loop: true })).take(Infinity)).toHaveLength(2);
    const empty = createSequencer(tune('-:4', { loop: true }));
    expect(empty.take(100)).toEqual([]);
    expect(empty.done).toBe(true);
    const tail = createSequencer(tune('A4:2 -:2', { loop: true, loopFrom: 2 }));
    expect(tail.take(100)).toHaveLength(1);
    expect(tail.done).toBe(true);
  });
});

describe('the scores of the game', () => {
  it.each(Object.entries(TRACKS))('%s: every voice is equally long, in whole bars, and it loops from a bar line', (_name, track) => {
    const lengths = track.voices.map((voice) => parseVoice(voice.notes).steps);
    expect(new Set(lengths).size).toBe(1);
    expect(lengths[0]! % 16).toBe(0);
    expect(lengths[0]).toBeGreaterThan(0);
    expect((track.loopFrom ?? 0) % 16).toBe(0);
    expect(track.loopFrom ?? 0).toBeLessThan(lengths[0]!);
    expect(track.bpm).toBeGreaterThanOrEqual(60);
    expect(track.bpm).toBeLessThanOrEqual(200);
  });

  it.each(Object.entries(TRACKS))('%s: uses the four voices of a Game Boy, within hearing and at a sane level', (_name, track) => {
    expect(track.voices.length).toBeLessThanOrEqual(4);
    expect(track.voices.filter((voice) => voice.wave === 'noise').length).toBeLessThanOrEqual(1);
    expect(track.voices.filter((voice) => voice.wave === 'triangle').length).toBeLessThanOrEqual(1);
    for (const note of flatten(track).notes) {
      expect(note.volume).toBeGreaterThan(0);
      expect(note.volume).toBeLessThanOrEqual(1);
      if (note.wave === 'noise') expect(note.drum).toBeDefined();
      else {
        expect(note.frequency).toBeGreaterThan(40);
        expect(note.frequency).toBeLessThan(4200);
      }
    }
  });

  it('has a track for every place, and they are different tunes', () => {
    const names = [MUSIC.title, MUSIC.ending, MUSIC.wild, MUSIC.boss, MUSIC.victory, MUSIC.indoors, ...Object.values(MUSIC.maps)];
    for (const name of names) expect(TRACKS).toHaveProperty([name]);
    expect(new Set(names).size).toBe(names.length);
    expect(MUSIC.maps.town).toBeDefined();
    const melodies = names.map((name) => TRACKS[name]!.voices[0]!.notes);
    expect(new Set(melodies).size).toBe(names.length);
    for (const name of [MUSIC.title, MUSIC.ending, MUSIC.wild, MUSIC.boss, MUSIC.indoors, MUSIC.maps.town!]) expect(TRACKS[name]!.loop).toBe(true);
    expect(TRACKS[MUSIC.victory]!.loop).toBe(false);
  });

  it('has a sound for every cue of the engine: an effect or a jingle', () => {
    for (const cue of CUES) {
      const jingle = JINGLES[cue];
      if (jingle) {
        expect(TRACKS[jingle]?.loop).toBe(false);
        continue;
      }
      const effect = EFFECTS[cue];
      expect(effect, cue).toBeDefined();
      expect(effect!.tones.length).toBeGreaterThan(0);
      for (const tone of effect!.tones) {
        expect(tone.duration).toBeGreaterThan(0);
        expect((tone.at ?? 0) + tone.duration).toBeLessThan(1);
        expect(tone.volume).toBeGreaterThan(0);
        expect(tone.volume).toBeLessThanOrEqual(0.5);
        expect(tone.from).toBeGreaterThan(0);
      }
    }
    expect(JINGLES.badge).toBe('badge');
    // The quiet ones stay quiet: the bump and the typewriter must not nag.
    expect(EFFECTS.blip!.tones[0]!.volume).toBeLessThanOrEqual(0.1);
    expect(EFFECTS.bump!.gap).toBeGreaterThanOrEqual(0.2);
  });
});
