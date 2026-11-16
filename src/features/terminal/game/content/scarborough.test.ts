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
 * Scarborough Fair, a traditional English song, as the arrangement on IMSLP (PMLP514655, file IMSLP318388; CC BY-NC
 * 4.0) has it: its 23 bars in 3/4, a step a sixteenth. Five voices: the melody (the vocal line), the right hand's
 * upper and lower chord notes, the left hand (one note at a time, so all of it is the bass), and the octave voice,
 * which plays only the D3 of the last chord. Ties are written in the bar where the note starts (an empty bar after).
 */
const SCORE: { bar: number; melody: string; upper: string; bass: string; octave: string; lower: string }[] = [
  { bar: 1, melody: '-:12', upper: 'A4:12', bass: 'D2:2 A2:2 D3:2 F3:2 A3:2 D3:2', octave: '-:12', lower: 'D4:12' },
  { bar: 2, melody: '-:12', upper: 'A4:12', bass: 'D2:2 A2:2 D3:2 F3:2 A3:2 D3:2', octave: '-:12', lower: 'D4:12' },
  { bar: 3, melody: '-:12', upper: 'A4:12', bass: 'D2:2 A2:2 D3:2 F3:2 A3:2 D3:2', octave: '-:12', lower: 'D4:12' },
  { bar: 4, melody: '-:12', upper: 'A4:12', bass: 'D2:2 A2:2 D3:2 F3:2 A3:2 D3:2', octave: '-:12', lower: 'D4:12' },
  { bar: 5, melody: 'D4:8 D4:4', upper: 'A4:12', bass: 'D2:2 A2:2 D3:8', octave: '-:12', lower: 'D4:12' },
  { bar: 6, melody: 'A4:8 A4:4', upper: 'A4:12', bass: 'D2:2 A2:2 D3:8', octave: '-:12', lower: 'D4:12' },
  { bar: 7, melody: 'E4:6 F4:2 E4:4', upper: 'G4:12', bass: 'C2:2 G2:2 C3:8', octave: '-:12', lower: 'C4:12' },
  { bar: 8, melody: 'D4:12', upper: 'D4:12', bass: 'D2:2 A2:2 D3:4 D2:2 E2:2', octave: '-:12', lower: 'A3:12' },
  { bar: 9, melody: '-:4 A4:4 C5:4', upper: 'F4:12', bass: 'F2:2 C3:2 F3:8', octave: '-:12', lower: 'C4:12' },
  { bar: 10, melody: 'D5:8 C5:4', upper: 'A4:12', bass: 'D2:2 A2:2 D3:8', octave: '-:12', lower: 'D4:12' },
  { bar: 11, melody: 'A4:4 B4:4 G4:4', upper: 'A4:4 B4:8', bass: 'F2:2 D3:2 G3:8', octave: '-:12', lower: 'F4:4 G4:8' },
  { bar: 12, melody: 'A4:20', upper: 'A4:24', bass: 'D2:2 A2:2 D3:2 F3:2 A3:4', octave: '-:12', lower: 'D4:24' },
  { bar: 13, melody: 'D5:4', upper: '', bass: 'D2:2 A2:2 D3:2 F3:2 A3:4', octave: '-:12', lower: '' },
  { bar: 14, melody: 'D5:8 D5:4', upper: 'A4:12', bass: 'D2:2 A2:2 D3:4 D2:2 E2:2', octave: '-:12', lower: 'D4:12' },
  { bar: 15, melody: 'C5:8 A4:4', upper: 'A4:12', bass: 'F2:2 C3:2 F3:8', octave: '-:12', lower: 'F4:12' },
  { bar: 16, melody: 'A4:4 G4:4 F4:4', upper: 'A4:4 G4:4 F4:4', bass: 'F2:2 C3:2 E2:4 D2:4', octave: '-:12', lower: 'F4:4 E4:4 D4:4' },
  { bar: 17, melody: 'E4:12', upper: 'E4:12', bass: 'C2:2 G2:2 C3:2 E3:2 G3:4', octave: '-:12', lower: 'C4:12' },
  { bar: 18, melody: 'D4:8 A4:4', upper: 'A4:12', bass: 'D2:2 A2:2 D3:8', octave: '-:12', lower: 'D4:12' },
  { bar: 19, melody: 'G4:8 F4:4', upper: 'G4:12', bass: 'C2:2 G2:2 C3:8', octave: '-:12', lower: 'C4:12' },
  { bar: 20, melody: 'E4:4 D4:4 C4:4', upper: 'G4:12', bass: 'C2:2 G2:2 C3:8', octave: '-:12', lower: 'C4:12' },
  { bar: 21, melody: 'D4:24', upper: 'A4:24', bass: 'D2:2 A2:2 D3:2 F3:2 A3:2 D3:2', octave: '-:12', lower: 'D4:24' },
  { bar: 22, melody: '', upper: '', bass: 'D2:2 A2:2 D3:2 F3:2 A3:2 D3:2', octave: '-:12', lower: '' },
  { bar: 23, melody: '-:24', upper: 'A4:24', bass: 'A2:24', octave: 'D3:24', lower: 'D4:24' },
];

/**
 * The bars as the piano plays them, as the song is performed: the intro (1 and 2), the repeated section (3 to 22)
 * four times (one for each verse), the last chord (23).
 */
const SECTION = Array.from({ length: 20 }, (_, i) => i + 3);
const PLAYED = [1, 2, ...SECTION, ...SECTION, ...SECTION, ...SECTION, 23];

describe('Scarborough Fair on the player piano, against the score', () => {
  const piece = TRACKS['scarborough-fair']!;
  /** A voice's bars, as written between the bar lines, each one's tokens joined by a space. */
  const bars = (voice: number) => piece.voices[voice]?.notes.split('|').map((bar) => bar.trim().split(/\s+/).join(' ')) ?? [];

  it('is the intro, the repeated section four times and the last chord: 83 bars of 3/4 at 100 a minute, about 2:31, played once', () => {
    expect(piece.bpm).toBe(100);
    expect(piece.loop).toBe(false);
    // A step is a sixteenth: a bar of three quarters is 12; the chord under the fermata is held 24.
    expect(trackSteps(piece)).toBe(82 * 12 + 24);
    const { length } = flatten(piece);
    expect(length).toBeCloseTo((82 * 12 + 24) * stepSeconds(piece), 6);
    expect(length).toBeGreaterThanOrEqual(145);
    expect(length).toBeLessThanOrEqual(157);
    for (const voice of piece.voices) expect(parseVoice(voice.notes).steps).toBe(trackSteps(piece));
  });

  it('has five plucked voices, every note on a piano and over the 40 Hz floor', () => {
    expect(piece.voices.map((voice) => voice.wave)).toEqual(['pulse', 'thin', 'triangle', 'triangle', 'thin']);
    for (const voice of piece.voices) expect(voice.pluck).toBe(true);
    for (const note of flatten(piece).notes) {
      expect(note.frequency).toBeGreaterThan(40);
      expect(note.frequency).toBeLessThan(4200);
    }
  });

  it.each(PLAYED.map((bar, i) => ({ ...SCORE[bar - 1]!, played: i + 1 })))(
    'played bar $played (score bar $bar): the five voices as the score has them',
    ({ played, melody, upper, bass, octave, lower }) => {
      expect(bars(0)[played - 1]).toBe(melody);
      expect(bars(1)[played - 1]).toBe(upper);
      expect(bars(2)[played - 1]).toBe(bass);
      expect(bars(3)[played - 1]).toBe(octave);
      expect(bars(4)[played - 1]).toBe(lower);
    },
  );

  it('has nothing after the last chord', () => {
    expect([0, 1, 2, 3, 4].map((voice) => bars(voice).length)).toEqual([83, 83, 83, 83, 83]);
  });

  it('is as loud as a piece may be: at the cafe tune\'s level or with its peak at the loudest tune\'s', () => {
    const level = loudnessOf(piece);
    const peak = peakOf(piece);
    expect(level).toBeLessThanOrEqual(PIANO_LOUDNESS * 1.001);
    expect(peak).toBeLessThanOrEqual(PIANO_PEAK + 1e-9);
    expect(level >= PIANO_LOUDNESS * 0.999 || peak >= PIANO_PEAK - 1e-6).toBe(true);
  });
});

describe('the selector with two pieces', () => {
  const world = buildWorld({ profile, skills, experience, education, projects });
  const press = (state: GameState, input: Partial<typeof NO_INPUT>) => step(state, { ...NO_INPUT, ...input }, world, { instant: true }).state;
  const open: GameState = { ...initialGame(world), scene: 'world', map: 'cafe', pick: { cursor: 0 } };

  it('lists the Moonlight Sonata and Scarborough Fair, with the length of each from its own track', () => {
    expect(PIECES.find((entry) => entry.id === 'scarborough-fair')).toEqual({ id: 'scarborough-fair', name: 'SCARBOROUGH FAIR', artist: 'TRADITIONAL ENGLISH', track: 'scarborough-fair' });
    expect(world.pieces!.map((piece) => piece.id)).toEqual(['moonlight', 'scarborough-fair']);
    const fair = world.pieces![1]!;
    expect(fair.ticks).toBe(Math.round(flatten(TRACKS['scarborough-fair']!).length * 60));
    expect(fair.ticks).not.toBe(world.pieces![0]!.ticks);
  });

  it('plays the second piece with A on its row, and the first piece still on the first row', () => {
    const second = press(press(open, { dir: 'down', pressed: 'down' }), { a: true });
    expect(second.piano).toMatchObject({ map: 'cafe', piece: 'scarborough-fair', ticks: world.pieces![1]!.ticks });
    const first = press(open, { a: true });
    expect(first.piano).toMatchObject({ map: 'cafe', piece: 'moonlight', ticks: world.pieces![0]!.ticks });
  });
});
