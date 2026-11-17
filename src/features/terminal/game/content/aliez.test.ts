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
 * aLIEz, the second ending of the anime Aldnoah.Zero, converted from a MIDI file (see the credit and the conversion
 * rules above the track in music.ts; the rules are those of always-in-my-heart and unravel). The MIDI is not in the
 * repository, so these tests check what the conversion produced: its tempo and grid, its length against the MIDI's,
 * the number of notes in each voice and those left out, the range, and a few bars.
 */
const SPOTS: { bar: number; melody: string; second: string; bass: string; octave: string; inner: string }[] = [
  { bar: 1, melody: 'E4:2 E5:2 G5:1 E4:1 E5:2 G5:2 F#5:1 B4:2 B4:1 F#4:2', second: '-:16', bass: '-:2 E2:3 E2:1 E2:2 E2:1 E2:2 E2:3 E2:4', octave: '-:2 E3:3 -:1 E3:2 -:1 E3:2 E3:3 E3:4', inner: '-:16' },
  { bar: 2, melody: 'E4:2 E5:2 G5:1 E4:1 E5:2 G5:2 F#5:1 B4:2 B4:1 F#4:2', second: '-:16', bass: 'C2:3 C2:1 C2:2 C2:1 C2:2 C2:3 C2:4', octave: 'C3:3 -:1 C3:2 -:1 C3:2 C3:3 C3:4', inner: '-:16' },
  { bar: 12, melody: 'E5:2 F#5:2 G5:2 F#5:2 G5:2 F#5:2 D5:2 D5:3', second: '-:16', bass: 'E3:2 B1:3 F#3:3 B3:3 E3:3 F#3:2', octave: '-:2 B2:3 -:11', inner: '-:16' },
  { bar: 30, melody: 'B5:4 D6:2 B5:3 -:1 B5:3 E5:3', second: 'E5:4 D5:2 E5:3 -:1 B4:3 E4:3', bass: 'C2:3 C2:1 C2:2 C2:1 C2:2 C2:3 C2:4', octave: 'C3:3 -:1 G2:2 -:1 C3:2 C3:3 G2:4', inner: 'B4:4 C3:2 B4:3 -:3 C3:4' },
  { bar: 41, melody: '-:15', second: '-:15', bass: 'B1:1 B1:1 -:14', octave: 'B2:1 B2:1 -:14', inner: '-:15' },
];

describe('aLIEz on the player piano, as converted from the MIDI', () => {
  const piece = TRACKS.aliez!;
  const bars = (voice: number) => piece.voices[voice]?.notes.split('|').map((bar) => bar.trim().split(/\s+/).join(' ')) ?? [];
  const notes = (voice: number) => parseVoice(piece.voices[voice]!.notes).notes.length;

  it('keeps the MIDI\'s tempo, 99 a minute, on a grid of sixteenths: a step 24 MIDI ticks, every note on it', () => {
    expect(piece.bpm).toBe(99);
    // 606,061 microseconds a quarter in the MIDI; a step is a quarter of that.
    expect(stepSeconds(piece)).toBeCloseTo(0.606061 / 4, 4);
    expect(piece.loop).toBe(false);
  });

  it('is as long as the MIDI from its start to its last note, to the end of that bar: 41 bars of 4/4, about 1:39', () => {
    // The MIDI's notes end at tick 15,408: 642 steps of 24 ticks; the data ends on the whole bar after it.
    expect(trackSteps(piece)).toBe(656);
    expect(bars(0)).toHaveLength(41);
    const { length } = flatten(piece);
    expect(length - 642 * stepSeconds(piece)).toBeGreaterThanOrEqual(0);
    expect(length - 642 * stepSeconds(piece)).toBeLessThan(16 * stepSeconds(piece));
    for (const voice of piece.voices) expect(parseVoice(voice.notes).steps).toBe(trackSteps(piece));
  });

  it('has five plucked voices with the notes the conversion gave each: 913 of the MIDI\'s 922, 9 with no free voice left out', () => {
    expect(piece.voices.map((voice) => voice.wave)).toEqual(['pulse', 'thin', 'triangle', 'triangle', 'thin']);
    for (const voice of piece.voices) expect(voice.pluck).toBe(true);
    expect([0, 1, 2, 3, 4].map(notes)).toEqual([268, 117, 288, 187, 53]);
    expect([0, 1, 2, 3, 4].map(notes).reduce((a, b) => a + b)).toBe(922 - 9);
  });

  it('plays every note on a piano, over the 40 Hz floor (G1 to D6)', () => {
    const frequencies = flatten(piece).notes.map((note) => note.frequency);
    expect(Math.min(...frequencies)).toBeCloseTo(49.0, 1);
    expect(Math.max(...frequencies)).toBeCloseTo(1174.66, 1);
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

describe('the selector, its first five pieces', () => {
  const world = buildWorld({ profile, skills, experience, education, projects });
  const press = (state: GameState, input: Partial<typeof NO_INPUT>) => step(state, { ...NO_INPUT, ...input }, world, { instant: true }).state;
  const open: GameState = { ...initialGame(world), scene: 'world', map: 'cafe', pick: { cursor: 0 } };
  const down = (state: GameState, times: number): GameState => (times === 0 ? state : down(press(state, { dir: 'down', pressed: 'down' }), times - 1));
  const ids = ['moonlight', 'scarborough-fair', 'always-in-my-heart', 'unravel', 'aliez'];

  it('lists the five pieces, each with the length of its own track', () => {
    expect(PIECES.find((entry) => entry.id === 'aliez')).toEqual({ id: 'aliez', name: 'ALIEZ', artist: 'ALDNOAH.ZERO ED 2', track: 'aliez' });
    // The first five of the list; what follows is another piece's test.
    expect(world.pieces!.map((piece) => piece.id).slice(0, 5)).toEqual(ids);
    expect(world.pieces![4]!.ticks).toBe(Math.round(flatten(TRACKS.aliez!).length * 60));
    expect(new Set(world.pieces!.map((piece) => piece.ticks)).size).toBe(world.pieces!.length);
  });

  it('plays the fifth piece with A on its row, and the first four still their own', () => {
    ids.forEach((id, i) => expect(press(down(open, i), { a: true }).piano).toMatchObject({ piece: id, ticks: world.pieces![i]!.ticks }));
  });
});
