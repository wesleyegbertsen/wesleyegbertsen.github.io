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
 * My Soul, Your Beats!, from the anime Angel Beats!, converted from a piano and vocals MIDI file; the vocal is the melody voice (see the credit and the conversion rules above the track in music.ts). The MIDI is not in the
 * repository, so these tests check what the conversion produced: the tempo and grid, the length against the MIDI's,
 * the notes in each voice and those left out, the range, and a few bars.
 */
const SPOTS: { bar: number; melody: string; second: string; bass: string; octave: string; inner: string }[] = [
  { bar: 1, melody: '-:16', second: '-:14 F#5:2', bass: '-:16', octave: '-:16', inner: '-:16' },
  { bar: 2, melody: '-:16', second: 'E5:4 D5:4 B4:2 D4:2 A4:16', bass: 'B2:2 F#3:2 G2:2 D3:2 G3:4 F#2:20', octave: '-:12 F#3:20', inner: '-:8 B3:2 -:2 A3:16' },
  { bar: 20, melody: 'C#5:4 A4:4 B4:4 B4:8', second: '-:6 E4:2 A4:2 E5:2 -:4', bass: 'F#1:2 F#2:2 F#2:2 F#2:2 F#2:2 F#2:2 F#2:2 F#2:2', octave: 'F#2:2 -:14', inner: '-:8 F#4:2 -:6' },
  { bar: 40, melody: 'F#5:2 G#5:8 G#5:2 F#5:2 E5:2', second: 'F#5:2 G#5:2 C#5:2 E5:2 G#5:2 G#5:2 F#5:2 E5:2', bass: 'C#2:2 G#2:2 C#3:2 E3:2 G#3:2 C#4:2 G#3:2 E3:2', octave: 'C#3:2 -:14', inner: 'F#4:2 G#4:2 -:6 G#4:2 F#4:2 E4:2' },
  { bar: 54, melody: '-:4', second: 'E5:2 G#5:2 C#6:2 E6:2 G#6:2 C#7:4 -:2', bass: 'C#3:2 C#3:2 C#3:2 C#3:2 C#3:2 C#2:4 -:2', octave: '-:10 C#3:4 -:2', inner: '-:10 G#6:4 -:2' },
];

describe('My Soul, Your Beats! on the player piano, as converted from the MIDI', () => {
  const piece = TRACKS['my-soul-your-beats']!;
  const bars = (voice: number) => piece.voices[voice]?.notes.split('|').map((bar) => bar.trim().split(/\s+/).join(' ')) ?? [];
  const notes = (voice: number) => parseVoice(piece.voices[voice]!.notes).notes.length;

  it('keeps the MIDI\'s tempo, 145 a minute, on a grid of sixteenths: a step 64 MIDI ticks', () => {
    expect(piece.bpm).toBe(145);
    expect(stepSeconds(piece)).toBeCloseTo(0.10345, 4);
    expect(piece.loop).toBe(false);
  });

  it('is as long as the MIDI, 54 bars as its time signatures make them: about 1:29', () => {
    expect(trackSteps(piece)).toBe(864);
    expect(bars(0)).toHaveLength(54);
    // The MIDI's notes end at 89.2 s from its start; the data ends on the bar after.
    const { length } = flatten(piece);
    expect(Math.abs(length - 89.2)).toBeLessThan(1);
    for (const voice of piece.voices) expect(parseVoice(voice.notes).steps).toBe(trackSteps(piece));
  });

  it('has five plucked voices with the notes the conversion gave each: 1037 of the MIDI\'s 1065, 28 left out', () => {
    expect(piece.voices.map((voice) => voice.wave)).toEqual(['pulse', 'thin', 'triangle', 'triangle', 'thin']);
    for (const voice of piece.voices) expect(voice.pluck).toBe(true);
    expect([0, 1, 2, 3, 4].map(notes)).toEqual([137, 289, 382, 86, 143]);
    // Left out: 0 under 40 Hz, 0 struck twice at once by one hand, 28 with no free voice.
    expect([0, 1, 2, 3, 4].map(notes).reduce((a, b) => a + b)).toBe(1065 - 0 - 0 - 28);
  });

  it('plays every note on a piano, over the 40 Hz floor (F#1 to B7)', () => {
    const frequencies = flatten(piece).notes.map((note) => note.frequency);
    expect(Math.min(...frequencies)).toBeCloseTo(46.25, 1);
    expect(Math.max(...frequencies)).toBeCloseTo(3951.07, 1);
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

describe('the selector with nine pieces (the Clannad Medley taken out)', () => {
  const world = buildWorld({ profile, skills, experience, education, projects });
  const press = (state: GameState, input: Partial<typeof NO_INPUT>) => step(state, { ...NO_INPUT, ...input }, world, { instant: true }).state;
  const open: GameState = { ...initialGame(world), scene: 'world', map: 'cafe', pick: { cursor: 0 } };
  const down = (state: GameState, times: number): GameState => (times === 0 ? state : down(press(state, { dir: 'down', pressed: 'down' }), times - 1));
  const ids = ['moonlight', 'scarborough-fair', 'always-in-my-heart', 'unravel', 'aliez', 'guren-no-yumiya', 'ichiban-no-takaramono', 'bauklotze', 'my-soul-your-beats'];

  it('lists the nine pieces, each with the length of its own track, and no track of the medley is left', () => {
    expect(PIECES.find((entry) => entry.id === 'my-soul-your-beats')).toEqual({ id: 'my-soul-your-beats', name: 'MY SOUL, YOUR BEATS!', artist: 'ANGEL BEATS', track: 'my-soul-your-beats' });
    expect(world.pieces!.map((piece) => piece.id)).toEqual(ids);
    expect(TRACKS['clannad-medley']).toBeUndefined();
    expect(world.pieces![8]!.ticks).toBe(Math.round(flatten(TRACKS['my-soul-your-beats']!).length * 60));
    expect(new Set(world.pieces!.map((piece) => piece.ticks)).size).toBe(9);
  });

  it('plays the ninth piece, the last, with A on its row, and the others still their own', () => {
    ids.forEach((id, i) => expect(press(down(open, i), { a: true }).piano).toMatchObject({ piece: id, ticks: world.pieces![i]!.ticks }));
  });
});
