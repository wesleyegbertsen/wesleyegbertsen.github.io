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
 * Scarborough Fair in the version from the soundtrack of the anime SukaSuka, converted from a MIDI file (see the
 * credit and the conversion rules above the track in music.ts). The MIDI changes tempo six times; its tempo map is
 * written into a fixed grid of 75 ms. The MIDI is not in the repository, so these tests check what the conversion
 * produced: the grid, the length against the MIDI's, the notes in each voice and those left out, the range and a few
 * lines of the data.
 */
const SPOTS: { bar: number; melody: string; second: string; bass: string; octave: string; inner: string }[] = [
  { bar: 1, melody: '-:16', second: '-:16', bass: 'C3:2 F3:2 G3:2 A3:2 C4:1 -:1 F4:1 G4:2 A4:2 C5:2', octave: '-:16', inner: '-:16' },
  { bar: 2, melody: '-:1 F5:2 G5:2 C6:2 F6:2 G6:2 A6:1 -:1 C7:19', second: '-:13 A6:19', bass: '-:15', octave: '-:16', inner: '-:13 F6:19' },
  { bar: 40, melody: '-:8 C6:6 C6:6', second: '-:8 C5:6 C5:6', bass: 'D4:3 A#3:3 C2:18', octave: '-:8 G2:18', inner: '-:8 C3:18' },
  { bar: 80, melody: 'A5:6 G#5:3 E5:3', second: 'E5:6 E5:3 G#4:3', bass: 'E2:6 G#2:6', octave: 'A2:6 B2:6', inner: 'C#5:6 G#4:3 E4:3' },
  { bar: 122, melody: '-:13', second: '-:16', bass: '-:16', octave: '-:16', inner: '-:16' },
];

describe('Scarborough Fair (SukaSuka) on the player piano, as converted from the MIDI', () => {
  const piece = TRACKS['scarborough-fair']!;
  const bars = (voice: number) => piece.voices[voice]?.notes.split('|').map((bar) => bar.trim().split(/\s+/).join(' ')) ?? [];
  const notes = (voice: number) => parseVoice(piece.voices[voice]!.notes).notes.length;

  it('puts the MIDI\'s tempo changes on a fixed grid of 75 ms: bpm 200, a step a sixteenth of it', () => {
    expect(piece.bpm).toBe(200);
    expect(stepSeconds(piece)).toBeCloseTo(0.075, 9);
    expect(piece.loop).toBe(false);
  });

  it('is as long as the MIDI from its first note to its last, to the next line of 16 steps: about 2:26', () => {
    // The MIDI's notes run 145.45 s from the first (at 1.29 s, after an empty bar) to the end of the last.
    expect(trackSteps(piece)).toBe(1952);
    expect(bars(0)).toHaveLength(122);
    const { length } = flatten(piece);
    expect(length - 145.45).toBeGreaterThanOrEqual(0);
    expect(length - 145.45).toBeLessThan(16 * stepSeconds(piece));
    for (const voice of piece.voices) expect(parseVoice(voice.notes).steps).toBe(trackSteps(piece));
  });

  it('has five plucked voices with the notes the conversion gave each: 1046 of the MIDI\'s 1120, 3 under 40 Hz and 71 with no free voice left out', () => {
    expect(piece.voices.map((voice) => voice.wave)).toEqual(['pulse', 'thin', 'triangle', 'triangle', 'thin']);
    for (const voice of piece.voices) expect(voice.pluck).toBe(true);
    expect([0, 1, 2, 3, 4].map(notes)).toEqual([261, 176, 386, 118, 105]);
    expect([0, 1, 2, 3, 4].map(notes).reduce((a, b) => a + b)).toBe(1120 - 3 - 71);
  });

  it('plays every note on a piano, over the 40 Hz floor (F#1 to D#7)', () => {
    const frequencies = flatten(piece).notes.map((note) => note.frequency);
    expect(Math.min(...frequencies)).toBeCloseTo(46.25, 1);
    expect(Math.max(...frequencies)).toBeCloseTo(2489.02, 1);
    for (const frequency of frequencies) {
      expect(frequency).toBeGreaterThan(40);
      expect(frequency).toBeLessThan(4200);
    }
  });

  it.each(SPOTS)('line $bar: the five voices as the conversion wrote them', ({ bar, melody, second, bass, octave, inner }) => {
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

describe('the selector, its second piece', () => {
  const world = buildWorld({ profile, skills, experience, education, projects });
  const press = (state: GameState, input: Partial<typeof NO_INPUT>) => step(state, { ...NO_INPUT, ...input }, world, { instant: true }).state;
  const open: GameState = { ...initialGame(world), scene: 'world', map: 'cafe', pick: { cursor: 0 } };

  it('is the SukaSuka Scarborough Fair, by Kato Tatsuya, with the length of its own track', () => {
    expect(PIECES[1]).toEqual({ id: 'scarborough-fair', name: 'SCARBOROUGH FAIR', artist: 'KATO TATSUYA', track: 'scarborough-fair' });
    expect(world.pieces![1]!.ticks).toBe(Math.round(flatten(TRACKS['scarborough-fair']!).length * 60));
  });

  it('plays with A on the second row, and the first piece still its own', () => {
    expect(press(press(open, { dir: 'down', pressed: 'down' }), { a: true }).piano).toMatchObject({ piece: 'scarborough-fair', ticks: world.pieces![1]!.ticks });
    expect(press(open, { a: true }).piano).toMatchObject({ piece: 'moonlight', ticks: world.pieces![0]!.ticks });
  });
});
