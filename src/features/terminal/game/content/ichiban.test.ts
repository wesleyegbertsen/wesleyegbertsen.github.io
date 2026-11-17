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
 * Ichiban no Takaramono, from the anime Angel Beats!, converted from a MIDI file (see the credit and the conversion rules above the track in music.ts). The MIDI is not in the
 * repository, so these tests check what the conversion produced: the tempo and grid, the length against the MIDI's,
 * the notes in each voice and those left out, the range, and a few bars.
 */
const SPOTS: { bar: number; melody: string; second: string; bass: string; octave: string; inner: string }[] = [
  { bar: 1, melody: 'C6:4 G5:2 F5:4 C6:6', second: 'F5:4 -:12', bass: '-:16', octave: '-:16', inner: 'D5:4 -:12' },
  { bar: 2, melody: 'C6:4 G5:2 F5:4 C6:6', second: 'G5:4 -:12', bass: '-:16', octave: '-:16', inner: 'E5:4 -:12' },
  { bar: 20, melody: 'F5:2 F5:6 A5:2 A#5:4', second: '-:16', bass: 'A2:8 A3:8', octave: 'F3:8 -:8', inner: 'A3:8 -:8' },
  { bar: 50, melody: 'C#5:6 A4:2 B4:4 A4:4', second: '-:14', bass: 'D2:4 A2:4 D3:8', octave: '-:16', inner: '-:16' },
  { bar: 72, melody: '-:32', second: '-:32', bass: 'A#1:1 A#2:1 D3:1 A#3:21 -:8', octave: 'F2:24 -:8', inner: '-:1 C3:23 -:8' },
];

describe('Ichiban no Takaramono on the player piano, as converted from the MIDI', () => {
  const piece = TRACKS['ichiban-no-takaramono']!;
  const bars = (voice: number) => piece.voices[voice]?.notes.split('|').map((bar) => bar.trim().split(/\s+/).join(' ')) ?? [];
  const notes = (voice: number) => parseVoice(piece.voices[voice]!.notes).notes.length;

  it('keeps the MIDI\'s tempo, 108 a minute, on a grid of sixteenths: a step 240 MIDI ticks', () => {
    expect(piece.bpm).toBe(108);
    expect(stepSeconds(piece)).toBeCloseTo(0.13889, 4);
    expect(piece.loop).toBe(false);
  });

  it('is as long as the MIDI, 72 bars as its time signatures make them: about 2:42', () => {
    expect(trackSteps(piece)).toBe(1168);
    expect(bars(0)).toHaveLength(72);
    // The MIDI's notes run 162.7 s with its closing ritardando; at the one tempo, within a second.
    const { length } = flatten(piece);
    expect(Math.abs(length - 162.7)).toBeLessThan(1);
    for (const voice of piece.voices) expect(parseVoice(voice.notes).steps).toBe(trackSteps(piece));
  });

  it('has five plucked voices with the notes the conversion gave each: 801 of the MIDI\'s 822, 21 left out', () => {
    expect(piece.voices.map((voice) => voice.wave)).toEqual(['pulse', 'thin', 'triangle', 'triangle', 'thin']);
    for (const voice of piece.voices) expect(voice.pluck).toBe(true);
    expect([0, 1, 2, 3, 4].map(notes)).toEqual([319, 132, 245, 60, 45]);
    // Left out: 7 under 40 Hz, 0 struck twice at once by one hand, 14 with no free voice.
    expect([0, 1, 2, 3, 4].map(notes).reduce((a, b) => a + b)).toBe(822 - 7 - 0 - 14);
  });

  it('plays every note on a piano, over the 40 Hz floor (F1 to D6)', () => {
    const frequencies = flatten(piece).notes.map((note) => note.frequency);
    expect(Math.min(...frequencies)).toBeCloseTo(43.65, 1);
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

describe('the selector with seven pieces', () => {
  const world = buildWorld({ profile, skills, experience, education, projects });
  const press = (state: GameState, input: Partial<typeof NO_INPUT>) => step(state, { ...NO_INPUT, ...input }, world, { instant: true }).state;
  const open: GameState = { ...initialGame(world), scene: 'world', map: 'cafe', pick: { cursor: 0 } };
  const down = (state: GameState, times: number): GameState => (times === 0 ? state : down(press(state, { dir: 'down', pressed: 'down' }), times - 1));
  const ids = ['moonlight', 'scarborough-fair', 'always-in-my-heart', 'unravel', 'aliez', 'guren-no-yumiya', 'ichiban-no-takaramono'];

  it('lists the seven pieces, each with the length of its own track', () => {
    expect(PIECES.find((entry) => entry.id === 'ichiban-no-takaramono')).toEqual({ id: 'ichiban-no-takaramono', name: 'ICHIBAN NO TAKARAMONO', artist: 'ANANT-GARDE EYES', track: 'ichiban-no-takaramono' });
    expect(world.pieces!.map((piece) => piece.id)).toEqual(ids);
    expect(world.pieces![6]!.ticks).toBe(Math.round(flatten(TRACKS['ichiban-no-takaramono']!).length * 60));
    expect(new Set(world.pieces!.map((piece) => piece.ticks)).size).toBe(7);
  });

  it('plays the seventh piece with A on its row, and the others still their own', () => {
    ids.forEach((id, i) => expect(press(down(open, i), { a: true }).piano).toMatchObject({ piece: id, ticks: world.pieces![i]!.ticks }));
  });
});
