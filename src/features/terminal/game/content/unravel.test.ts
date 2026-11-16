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
 * Unravel, the Tokyo Ghoul opening, by TK of Ling tosite sigure, converted from the MIDI file of a piano cover by
 * Cosmic PIANO (see the credit and the conversion rules above the track in music.ts; the rules are round 39's). The
 * MIDI is not in the repository, so these tests check what the conversion produced: its tempo and grid, its length
 * against the MIDI's, the number of notes in each voice and those left out, the range, and a few bars.
 */
const SPOTS: { bar: number; melody: string; second: string; bass: string; octave: string; inner: string }[] = [
  { bar: 1, melody: '-:2 A#5:2 C6:4 A#5:4 A5:2 G5:4', second: '-:16', bass: '-:4 G4:11 -:1', octave: '-:16', inner: '-:16' },
  { bar: 2, melody: 'C6:4 A#5:4 A5:4 G5:4', second: '-:16', bass: 'A#4:4 D#4:11 -:1', octave: '-:16', inner: '-:16' },
  { bar: 10, melody: 'C6:4 A#5:4 A5:4 G5:4', second: '-:16', bass: 'D#2:2 A#2:2 G2:2 D3:2 G3:2 G2:2 D3:2 G3:2', octave: '-:16', inner: '-:16' },
  { bar: 30, melody: '-:2 F4:2 F4:2 D4:1 D4:1 -:2 D4:2 C4:3 C4:3', second: '-:16', bass: 'G2:2 D3:2 G2:2 D3:2 G2:2 D3:2 G2:2 D3:2', octave: '-:2 G3:2 -:2 G3:2 -:2 G3:2 -:2 G3:2', inner: '-:16' },
  { bar: 49, melody: '-:2', second: '-:16', bass: '-:1', octave: '-:1', inner: '-:16' },
];

describe('Unravel on the player piano, as converted from the MIDI', () => {
  const piece = TRACKS.unravel!;
  const bars = (voice: number) => piece.voices[voice]?.notes.split('|').map((bar) => bar.trim().split(/\s+/).join(' ')) ?? [];
  const notes = (voice: number) => parseVoice(piece.voices[voice]!.notes).notes.length;

  it('keeps the MIDI\'s tempo, 134.5 a minute, on a grid of sixteenths: a step 24 MIDI ticks', () => {
    expect(piece.bpm).toBe(134.5);
    // 446,097 microseconds a quarter in the MIDI; a step is a quarter of that.
    expect(stepSeconds(piece)).toBeCloseTo(0.446097 / 4, 4);
    expect(piece.loop).toBe(false);
  });

  it('is as long as the MIDI from its start to its last note: 49 bars of 4/4, about 1:27', () => {
    // The MIDI's notes end at tick 18,780: 782.5 steps of 24 ticks from its start; the data is a whole number of bars.
    expect(trackSteps(piece)).toBe(784);
    expect(bars(0)).toHaveLength(49);
    const { length } = flatten(piece);
    expect(Math.abs(length - 782.5 * stepSeconds(piece))).toBeLessThan(1);
    for (const voice of piece.voices) expect(parseVoice(voice.notes).steps).toBe(trackSteps(piece));
  });

  it('has five plucked voices with the notes the conversion gave each: 794 of the MIDI\'s 810, 16 under the 40 Hz floor left out, 0 dropped', () => {
    expect(piece.voices.map((voice) => voice.wave)).toEqual(['pulse', 'thin', 'triangle', 'triangle', 'thin']);
    for (const voice of piece.voices) expect(voice.pluck).toBe(true);
    expect([0, 1, 2, 3, 4].map(notes)).toEqual([273, 71, 296, 110, 44]);
    expect([0, 1, 2, 3, 4].map(notes).reduce((a, b) => a + b)).toBe(810 - 16 - 0);
  });

  it('plays every note on a piano, over the 40 Hz floor (F1 to G6)', () => {
    const frequencies = flatten(piece).notes.map((note) => note.frequency);
    expect(Math.min(...frequencies)).toBeCloseTo(43.65, 1);
    expect(Math.max(...frequencies)).toBeCloseTo(1567.98, 1);
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

describe('the selector with four pieces', () => {
  const world = buildWorld({ profile, skills, experience, education, projects });
  const press = (state: GameState, input: Partial<typeof NO_INPUT>) => step(state, { ...NO_INPUT, ...input }, world, { instant: true }).state;
  const open: GameState = { ...initialGame(world), scene: 'world', map: 'cafe', pick: { cursor: 0 } };
  const down = (state: GameState, times: number): GameState => (times === 0 ? state : down(press(state, { dir: 'down', pressed: 'down' }), times - 1));

  it('lists the four pieces, each with the length of its own track', () => {
    expect(PIECES.find((entry) => entry.id === 'unravel')).toEqual({ id: 'unravel', name: 'UNRAVEL', artist: 'TK, LING TOSITE SIGURE', track: 'unravel' });
    expect(world.pieces!.map((piece) => piece.id)).toEqual(['moonlight', 'scarborough-fair', 'always-in-my-heart', 'unravel']);
    expect(world.pieces![3]!.ticks).toBe(Math.round(flatten(TRACKS.unravel!).length * 60));
    expect(new Set(world.pieces!.map((piece) => piece.ticks)).size).toBe(4);
  });

  it('plays the fourth piece with A on its row, and the first three still their own', () => {
    const ids = ['moonlight', 'scarborough-fair', 'always-in-my-heart', 'unravel'];
    ids.forEach((id, i) => expect(press(down(open, i), { a: true }).piano).toMatchObject({ piece: id, ticks: world.pieces![i]!.ticks }));
  });
});
