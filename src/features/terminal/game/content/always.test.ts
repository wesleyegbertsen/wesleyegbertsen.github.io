import { education } from '../../../../data/education.ts';
import { experience } from '../../../../data/experience.ts';
import { profile } from '../../../../data/profile.ts';
import { projects } from '../../../../data/projects.ts';
import { skills } from '../../../../data/skills.ts';
import { flatten, loudnessOf, parseVoice, peakOf, stepSeconds, trackSteps } from '../audio/score.ts';
import { initialGame, step } from '../engine/engine.ts';
import { NO_INPUT, type GameState } from '../engine/types.ts';
import { PIANO_LOUDNESS, PIANO_PEAK, TRACKS } from './music.ts';
import { PIECES } from './pieces.ts';
import { buildWorld } from './world.ts';

/**
 * Always in my heart (SukaSuka), composed by Kato Tatsuya, converted from a MIDI file of a piano arrangement (see the
 * credit and the conversion rules above the track in music.ts). The MIDI is not in the repository, so these tests
 * check what the conversion produced: its tempo and grid, its length against the MIDI's, the number of notes in each
 * voice, the range, and a few bars copied from the conversion.
 */
const SPOTS: { bar: number; melody: string; second: string; bass: string; octave: string; inner: string }[] = [
  { bar: 1, melody: 'B6:16 A6:8', second: 'A6:1 -:15 F#6:8', bass: 'D5:16 E5:8', octave: '-:16 E5:8', inner: 'G6:16 -:8' },
  { bar: 2, melody: 'F#6:16 D6:8', second: 'D6:15 -:1 A5:8', bass: 'F#5:8 E5:8 F#4:8', octave: 'F#5:8 -:8 D5:8', inner: '-:24' },
  { bar: 3, melody: 'E6:16 D6:8', second: '-:16 B5:8', bass: 'G4:8 D5:8 B4:4 -:4', octave: 'E5:8 -:16', inner: '-:24' },
  { bar: 50, melody: 'A5:8 F5:1 D6:23', second: 'E5:8 D5:24', bass: 'A3:4 C3:4 F3:4 F2:4 C3:4 F3:4', octave: '-:8 A3:4 -:8 A3:4', inner: 'A4:8 -:16' },
  { bar: 115, melody: '-:9', second: '-:9', bass: '-:8', octave: '-:8', inner: '-:32' },
];

describe('Always in my heart on the player piano, as converted from the MIDI', () => {
  const piece = TRACKS['always-in-my-heart']!;
  const bars = (voice: number) => piece.voices[voice]?.notes.split('|').map((bar) => bar.trim().split(/\s+/).join(' ')) ?? [];
  const notes = (voice: number) => parseVoice(piece.voices[voice]!.notes).notes.length;

  it('keeps the MIDI\'s tempo, 91.9 a minute, on a grid of 32nd notes: bpm 183.8, a step 12 MIDI ticks', () => {
    expect(piece.bpm).toBe(183.8);
    // 652,884 microseconds a quarter in the MIDI; a step is an eighth of that.
    expect(stepSeconds(piece)).toBeCloseTo(0.652884 / 8, 4);
    expect(piece.loop).toBe(false);
  });

  it('is as long as the MIDI from its first note to its last: 115 bars of 3/4, about 3:46', () => {
    // The MIDI's notes run from tick 288 to tick 33,409: 2,760.1 steps of 12 ticks, 225.3 s. The data is 115 bars
    // (2,760 steps), padded by 8 steps to a multiple of 16.
    expect(trackSteps(piece)).toBe(2768);
    expect(bars(0)).toHaveLength(115);
    const { length } = flatten(piece);
    expect(Math.abs(length - 2760.1 * stepSeconds(piece))).toBeLessThan(1);
    for (const voice of piece.voices) expect(parseVoice(voice.notes).steps).toBe(trackSteps(piece));
  });

  it('has five plucked voices with the notes the conversion gave each: 953 of the MIDI\'s 955', () => {
    expect(piece.voices.map((voice) => voice.wave)).toEqual(['pulse', 'thin', 'triangle', 'triangle', 'thin']);
    for (const voice of piece.voices) expect(voice.pluck).toBe(true);
    expect([0, 1, 2, 3, 4].map(notes)).toEqual([307, 113, 376, 116, 41]);
    expect([0, 1, 2, 3, 4].map(notes).reduce((a, b) => a + b)).toBe(953);
  });

  it('plays every note on a piano, inside what the player plays (C#2 to B6)', () => {
    const frequencies = flatten(piece).notes.map((note) => note.frequency);
    expect(Math.min(...frequencies)).toBeCloseTo(69.3, 1);
    expect(Math.max(...frequencies)).toBeCloseTo(1975.5, 1);
    for (const frequency of frequencies) {
      expect(frequency).toBeGreaterThan(40);
      expect(frequency).toBeLessThan(4200);
    }
  });

  it.each(SPOTS)('bar $bar: the five voices as the conversion wrote them', ({ bar, melody, second, bass, octave, inner }) => {
    expect([bars(0), bars(1), bars(2), bars(3), bars(4)].map((voice) => voice[bar - 1])).toEqual([melody, second, bass, octave, inner]);
  });

  it('is as loud as a piece may be: at the cafe tune\'s level or with its peak at the loudest tune\'s', () => {
    const level = loudnessOf(piece);
    const peak = peakOf(piece);
    expect(level).toBeLessThanOrEqual(PIANO_LOUDNESS * 1.001);
    expect(peak).toBeLessThanOrEqual(PIANO_PEAK + 1e-9);
    expect(level >= PIANO_LOUDNESS * 0.999 || peak >= PIANO_PEAK - 1e-6).toBe(true);
  });
});

describe('the selector, its first three pieces', () => {
  const world = buildWorld({ profile, skills, experience, education, projects });
  const press = (state: GameState, input: Partial<typeof NO_INPUT>) => step(state, { ...NO_INPUT, ...input }, world, { instant: true }).state;
  const open: GameState = { ...initialGame(world), scene: 'world', map: 'cafe', pick: { cursor: 0 } };
  const down = (state: GameState) => press(state, { dir: 'down', pressed: 'down' });

  it('lists the three pieces, each with the length of its own track', () => {
    expect(PIECES.find((entry) => entry.id === 'always-in-my-heart')).toEqual({ id: 'always-in-my-heart', name: 'ALWAYS IN MY HEART', artist: 'KATO TATSUYA', track: 'always-in-my-heart' });
    // The first three of the list; what follows is another piece's test.
    expect(world.pieces!.map((piece) => piece.id).slice(0, 3)).toEqual(['moonlight', 'scarborough-fair', 'always-in-my-heart']);
    expect(world.pieces![2]!.ticks).toBe(Math.round(flatten(TRACKS['always-in-my-heart']!).length * 60));
    expect(new Set(world.pieces!.map((piece) => piece.ticks)).size).toBe(world.pieces!.length);
  });

  it('plays the third piece with A on its row, and the first two still their own', () => {
    expect(press(down(down(open)), { a: true }).piano).toMatchObject({ piece: 'always-in-my-heart', ticks: world.pieces![2]!.ticks });
    expect(press(down(open), { a: true }).piano).toMatchObject({ piece: 'scarborough-fair', ticks: world.pieces![1]!.ticks });
    expect(press(open, { a: true }).piano).toMatchObject({ piece: 'moonlight', ticks: world.pieces![0]!.ticks });
  });
});
