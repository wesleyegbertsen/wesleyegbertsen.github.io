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
 * Clannad Medley, from the anime Clannad, converted from a MIDI file; its many tempos and meters are written into a fixed grid in seconds (see the credit and the conversion rules above the track in music.ts). The MIDI is not in the
 * repository, so these tests check what the conversion produced: the tempo and grid, the length against the MIDI's,
 * the notes in each voice and those left out, the range, and a few bars.
 */
const SPOTS: { bar: number; melody: string; second: string; bass: string; octave: string; inner: string }[] = [
  { bar: 1, melody: 'A4:6 B4:6 C#5:12', second: '-:12 A4:12', bass: '-:12 A2:36', octave: '-:16', inner: '-:12 E4:12' },
  { bar: 2, melody: 'E5:12', second: '-:8', bass: '', octave: '-:16', inner: '-:8' },
  { bar: 200, melody: '-:5 A4:4 E4:5 F#4:5', second: '-:5 C#4:5 -:4 D4:5', bass: 'B3:5 C#3:9 D3:5', octave: '-:16', inner: '-:16' },
  { bar: 500, melody: 'A4:5 B4:4 C#5:5 E5:1 B4:3', second: '-:14 E4:4', bass: '-:5 A3:9 C#2:4', octave: '-:16', inner: '-:16' },
  { bar: 688, melody: '-:12', second: '-:16', bass: '-:12', octave: '-:16', inner: '-:16' },
];

describe('Clannad Medley on the player piano, as converted from the MIDI', () => {
  const piece = TRACKS['clannad-medley']!;
  const bars = (voice: number) => piece.voices[voice]?.notes.split('|').map((bar) => bar.trim().split(/\s+/).join(' ')) ?? [];
  const notes = (voice: number) => parseVoice(piece.voices[voice]!.notes).notes.length;

  it('writes the MIDI\'s tempo map into a fixed grid: bpm 200, a step of 75 ms', () => {
    expect(piece.bpm).toBe(200);
    expect(stepSeconds(piece)).toBeCloseTo(0.075, 4);
    expect(piece.loop).toBe(false);
  });

  it('is as long as the MIDI, 688 bars as its time signatures make them: about 13:46', () => {
    expect(trackSteps(piece)).toBe(11008);
    expect(bars(0)).toHaveLength(688);
    // The MIDI's notes run 824.7 s after 1.8 s of silence; the data ends on the next line of 16 steps.
    const { length } = flatten(piece);
    expect(Math.abs(length - 824.7)).toBeLessThan(1.3);
    for (const voice of piece.voices) expect(parseVoice(voice.notes).steps).toBe(trackSteps(piece));
  });

  it('has five plucked voices with the notes the conversion gave each: 3836 of the MIDI\'s 3927, 91 left out', () => {
    expect(piece.voices.map((voice) => voice.wave)).toEqual(['pulse', 'thin', 'triangle', 'triangle', 'thin']);
    for (const voice of piece.voices) expect(voice.pluck).toBe(true);
    expect([0, 1, 2, 3, 4].map(notes)).toEqual([1621, 572, 1156, 185, 302]);
    // Left out: 6 under 40 Hz, 5 struck twice at once by one hand, 80 with no free voice.
    expect([0, 1, 2, 3, 4].map(notes).reduce((a, b) => a + b)).toBe(3927 - 6 - 5 - 80);
  });

  it('plays every note on a piano, over the 40 Hz floor (E1 to F#7)', () => {
    const frequencies = flatten(piece).notes.map((note) => note.frequency);
    expect(Math.min(...frequencies)).toBeCloseTo(41.20, 1);
    expect(Math.max(...frequencies)).toBeCloseTo(2959.96, 1);
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

describe('the selector, its first nine pieces', () => {
  const world = buildWorld({ profile, skills, experience, education, projects });
  const press = (state: GameState, input: Partial<typeof NO_INPUT>) => step(state, { ...NO_INPUT, ...input }, world, { instant: true }).state;
  const open: GameState = { ...initialGame(world), scene: 'world', map: 'cafe', pick: { cursor: 0 } };
  const down = (state: GameState, times: number): GameState => (times === 0 ? state : down(press(state, { dir: 'down', pressed: 'down' }), times - 1));
  const ids = ['moonlight', 'scarborough-fair', 'always-in-my-heart', 'unravel', 'aliez', 'guren-no-yumiya', 'ichiban-no-takaramono', 'bauklotze', 'clannad-medley'];

  it('lists the nine pieces, each with the length of its own track', () => {
    expect(PIECES.find((entry) => entry.id === 'clannad-medley')).toEqual({ id: 'clannad-medley', name: 'CLANNAD MEDLEY', artist: 'CLANNAD', track: 'clannad-medley' });
    // The first nine of the list; what follows is another piece's test.
    expect(world.pieces!.map((piece) => piece.id).slice(0, 9)).toEqual(ids);
    expect(world.pieces![8]!.ticks).toBe(Math.round(flatten(TRACKS['clannad-medley']!).length * 60));
    expect(new Set(world.pieces!.map((piece) => piece.ticks)).size).toBe(world.pieces!.length);
  });

  it('plays the ninth piece with A on its row, and the others still their own', () => {
    ids.forEach((id, i) => expect(press(down(open, i), { a: true }).piano).toMatchObject({ piece: id, ticks: world.pieces![i]!.ticks }));
  });
});
