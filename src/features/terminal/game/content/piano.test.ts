import { flatten, parseVoice, stepSeconds, trackSteps } from '../audio/score.ts';
import { education } from '../../../../data/education.ts';
import { experience } from '../../../../data/experience.ts';
import { profile } from '../../../../data/profile.ts';
import { projects } from '../../../../data/projects.ts';
import { skills } from '../../../../data/skills.ts';
import { routeTo } from '../engine/bot.ts';
import { initialGame } from '../engine/engine.ts';
import type { GameState } from '../engine/types.ts';
import { TRACKS } from './music.ts';
import { PIECES } from './pieces.ts';
import { buildWorld } from './world.ts';

/** The summed volume of the voices that sound at each step (as in audio/levels.test.ts). */
const peakOf = (name: string) => {
  const track = TRACKS[name]!;
  const sum = new Array<number>(trackSteps(track)).fill(0);
  for (const voice of track.voices) for (const note of parseVoice(voice.notes).notes) for (let s = note.step; s < note.step + note.steps; s++) sum[s]! += voice.volume;
  return Math.max(...sum);
};

describe('the Moonlight Sonata on the player piano of the cafe', () => {
  const piece = TRACKS.moonlight!;

  it('is a piece of the player piano, played once', () => {
    expect(PIECES.map((entry) => entry.track)).toContain('moonlight');
    expect(piece.loop).toBe(false);
  });

  it('is the whole first movement, 69 bars at 56 quarter notes a minute, the last chord held: about five minutes', () => {
    // One step of the score is a twelfth of a beat: a triplet eighth is 4 steps, a dotted eighth and a sixteenth
    // are 9 and 3, a bar of four beats is 48. The last bar, the chord under the fermata, is 64.
    expect(piece.bpm).toBe(168);
    expect(60 / stepSeconds(piece) / 12).toBeCloseTo(56, 6);
    expect(trackSteps(piece)).toBe(68 * 48 + 64);
    const { length } = flatten(piece);
    expect(length).toBeCloseTo((68 * 48 + 64) * stepSeconds(piece), 6);
    expect(length).toBeGreaterThanOrEqual(290);
    expect(length).toBeLessThanOrEqual(305);
    for (const voice of piece.voices) expect(parseVoice(voice.notes).steps, voice.notes.slice(0, 20)).toBe(trackSteps(piece));
  });

  it('has five plucked voices and no drums, every note on a piano', () => {
    // Five since round 31: the octaves of the left hand and the inner chord notes were added.
    expect(piece.voices).toHaveLength(5);
    for (const voice of piece.voices) {
      expect(voice.wave).not.toBe('noise');
      expect(voice.pluck).toBe(true);
    }
    for (const note of flatten(piece).notes) {
      // A1 (55 Hz) to the top of the melody here, inside the 88 keys (27.5 to 4186 Hz).
      expect(note.frequency).toBeGreaterThanOrEqual(27.5);
      expect(note.frequency).toBeLessThanOrEqual(4186);
      expect(note.pluck).toBe(true);
    }
    // The triplets: the right hand runs on every step of the first bar, three notes over and over.
    const first = parseVoice(piece.voices[1]!.notes).notes.filter((note) => note.step < 48);
    expect(first.map((note) => note.step)).toEqual([0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44]);
  });

  it('is as loud as a piece may be: its peak at the loudest tune\'s (pieces.test.ts holds the rule)', () => {
    const others = Object.keys(TRACKS).filter((name) => name !== 'moonlight' && TRACKS[name]!.loop);
    expect(peakOf('moonlight')).toBeCloseTo(Math.max(...others.map(peakOf)), 6);
  });
});

describe('the music corner of the cafe', () => {
  const world = buildWorld({ profile, skills, experience, education, projects });
  const cafe = world.maps.cafe!;
  const at: GameState = { ...initialGame(world), scene: 'world', map: 'cafe', x: 4, y: 7 };
  const object = (key: string) => cafe.objects.find((candidate) => candidate.id === `cafe:${key}`)!;

  it('makes the cafe 17 cells wide and 9 high, the left part as it was, the old pocket of the piano floor again', () => {
    expect([cafe.width, cafe.height]).toEqual([17, 9]);
    // The counter, the barista and the shop clerk, the regular and the door stay where they were.
    expect([object('B'), object('V'), object('1'), object('m')].map((thing) => [thing.x, thing.y])).toEqual([
      [3, 2],
      [6, 2],
      [3, 6],
      [4, 8],
    ]);
    expect(cafe.tiles[cafe.cells[5]![8]!]!.sprite).toBe(cafe.tiles[cafe.cells[5]![7]!]!.sprite);
  });

  it('has the piano in the middle of a stage across the top of the corner, faced from the front of the stage', () => {
    const piano = object('k');
    expect(piano).toMatchObject({ x: 13, y: 1, sprite: 'piano', solid: true, trigger: 'interact' });
    expect(piano.branches).toEqual([{ do: [{ piano: true }] }]);
    const stage = cafe.tiles[cafe.cells[1]![13]!]!.sprite;
    expect(stage).toBe('stage');
    for (let x = 11; x <= 15; x++) {
      expect(cafe.tiles[cafe.cells[2]![x]!]!.sprite, `edge ${x}`).toBe('stage-edge');
      expect(cafe.tiles[cafe.cells[2]![x]!]!.solid).toBe(false);
    }
    const route = routeTo(world, at, 'cafe:k')!;
    expect(route.at(-1)).toBe('up');
    // Chairs face the stage, with an aisle in the middle.
    expect([11, 12, 13, 14, 15].map((x) => cafe.tiles[cafe.cells[4]![x]!]!.sprite)).toEqual(['chair', 'chair', cafe.tiles[cafe.cells[4]![13]!]!.sprite, 'chair', 'chair']);
  });

  it('has the plant of the old right wall against the bottom wall now, out of the way of the corner', () => {
    expect(cafe.tiles[cafe.cells[7]![8]!]!.sprite).toBe('plant');
    expect(cafe.tiles[cafe.cells[6]![8]!]!.solid).toBe(false);
    // The opening into the corner, column 9 from row 3 to row 7, is free.
    for (let y = 3; y <= 7; y++) expect(cafe.tiles[cafe.cells[y]![9]!]!.solid, `9,${y}`).toBe(false);
  });

  it('has three people of music who talk, and nothing in the cafe is out of reach from the door', () => {
    const musicians = ['f', 'l', 'r'].map(object);
    expect(musicians.map((person) => [person.x, person.y])).toEqual([
      [15, 1],
      [14, 5],
      [11, 6],
    ]);
    for (const person of musicians) {
      expect(person.trigger).toBe('interact');
      expect(JSON.stringify(person.branches)).toMatch(/say/);
    }
    for (const thing of cafe.objects) expect(routeTo(world, at, thing.id), thing.id).not.toBeNull();
  });
});

/**
 * The first fourteen bars as the score has them (a Creative Commons BY-SA 2.5 engraving of Op. 27 No. 2), bar by
 * bar: the twelve triplet eighths (right hand, or the left hand where it takes them over), the bass (the lowest note
 * of the left hand; its lengths in steps of a twelfth of a beat) and the melody (with its lengths: a dotted eighth
 * and a sixteenth are 9 and 3). Bars 4 and 8: two half notes in the bass, each struck (round 35; one whole before).
 */
const SCORE: { bar: number; triplets: string; bass: string; melody: string }[] = [
  { bar: 1, triplets: 'G#3 C#4 E4 G#3 C#4 E4 G#3 C#4 E4 G#3 C#4 E4', bass: 'C#2:48', melody: '-:48' },
  { bar: 2, triplets: 'G#3 C#4 E4 G#3 C#4 E4 G#3 C#4 E4 G#3 C#4 E4', bass: 'B1:48', melody: '-:48' },
  { bar: 3, triplets: 'A3 C#4 E4 A3 C#4 E4 A3 D4 F#4 A3 D4 F#4', bass: 'A1:24 F#1:24', melody: '-:48' },
  { bar: 4, triplets: 'G#3 B#3 F#4 G#3 C#4 E4 G#3 C#4 D#4 F#3 B#3 D#4', bass: 'G#1:24 G#1:24', melody: '-:48' },
  { bar: 5, triplets: 'E3 G#3 C#4 G#3 C#4 E4 G#3 C#4 E4 G#3 C#4 E4', bass: 'C#2:48', melody: '-:36 G#4:9 G#4:3' },
  { bar: 6, triplets: 'G#3 D#4 F#4 G#3 D#4 F#4 G#3 D#4 F#4 G#3 D#4 F#4', bass: 'B#1:48', melody: 'G#4:36 G#4:9 G#4:3' },
  { bar: 7, triplets: 'G#3 C#4 E4 G#3 C#4 E4 A3 C#4 F#4 A3 C#4 F#4', bass: 'C#2:24 F#1:24', melody: 'G#4:24 A4:24' },
  { bar: 8, triplets: 'G#3 B3 E4 G#3 B3 E4 A3 B3 D#4 A3 B3 D#4', bass: 'B1:24 B1:24', melody: 'G#4:24 F#4:12 B4:12' },
  { bar: 9, triplets: 'G#3 B3 E4 G#3 B3 E4 G#3 B3 E4 G#3 B3 E4', bass: 'E2:48', melody: 'E4:12 -:36' },
  { bar: 10, triplets: 'G3 B3 E4 G3 B3 E4 G3 B3 E4 G3 B3 E4', bass: 'E2:48', melody: '-:36 G4:9 G4:3' },
  { bar: 11, triplets: 'G3 B3 F4 G3 B3 F4 G3 B3 F4 G3 B3 F4', bass: 'D2:48', melody: 'G4:36 G4:9 G4:3' },
  { bar: 12, triplets: 'G3 C4 E4 G3 B3 E4 G3 C#4 E4 F#3 C#4 E4', bass: 'C2:12 B1:12 A#1:24', melody: 'G4:36 F#4:12' },
  { bar: 13, triplets: 'F#3 B3 D4 F#3 B3 D4 G3 B3 C#4 E3 B3 C#4', bass: 'B1:24 E2:12 G2:12', melody: 'F#4:24 G4:12 E4:12' },
  { bar: 14, triplets: 'F#3 B3 D4 F#3 B3 D4 F#3 A#3 C#4 F#3 A#3 C#4', bass: 'F#2:24 F#1:24', melody: 'F#4:24 F#4:24' },
];

describe('the notes of the Moonlight Sonata, against the score', () => {
  const piece = TRACKS.moonlight!;
  /** A voice's bars, as written between the bar lines, each one's tokens joined by a space. */
  const bars = (voice: number) => piece.voices[voice]!.notes.split('|').map((bar) => bar.trim().split(/\s+/).join(' '));
  const [melody, triplets, bass] = [bars(0), bars(1), bars(2)];

  it.each(SCORE)('bar $bar: the triplets, the bass and the melody as the score has them', ({ bar, triplets: expected, bass: low, melody: tune }) => {
    // Every triplet eighth is 4 steps.
    expect(triplets[bar - 1]).toBe(expected.split(' ').map((note) => `${note}:4`).join(' '));
    expect(bass[bar - 1]).toBe(low);
    expect(melody[bar - 1]).toBe(tune);
  });

  it('goes on after bar 14 (the held chord that closed the old excerpt is gone) and has nothing after bar 69', () => {
    expect([triplets.length, bass.length, melody.length]).toEqual([69, 69, 69]);
    expect(triplets[14]).toBe(FULL[0]!.triplets);
  });
});

/**
 * The two voices added in round 31, bar by bar: the upper note of the left hand's octaves (a rest where it plays one
 * note), and the inner notes of the left hand's chords (bars 5 and 6).
 */
const LOW: { bar: number; octave: string; inner: string }[] = [
  { bar: 1, octave: 'C#3:48', inner: '-:48' },
  { bar: 2, octave: 'B2:48', inner: '-:48' },
  { bar: 3, octave: 'A2:24 F#2:24', inner: '-:48' },
  { bar: 4, octave: 'G#2:24 G#2:24', inner: '-:48' },
  { bar: 5, octave: 'C#3:48', inner: 'G#2:48' },
  { bar: 6, octave: 'B#2:48', inner: 'G#2:48' },
  { bar: 7, octave: 'C#3:24 F#2:24', inner: '-:48' },
  { bar: 8, octave: 'B2:24 B2:24', inner: '-:48' },
  { bar: 9, octave: 'E3:48', inner: '-:48' },
  { bar: 10, octave: 'E3:48', inner: '-:48' },
  { bar: 11, octave: 'D3:48', inner: '-:48' },
  { bar: 12, octave: 'C3:12 B2:12 A#2:24', inner: '-:48' },
  { bar: 13, octave: 'B2:24 -:24', inner: '-:48' },
  { bar: 14, octave: '-:24 F#2:24', inner: '-:48' },
];

describe('the left hand of the Moonlight Sonata, fuller', () => {
  const piece = TRACKS.moonlight!;
  const bars = (voice: number) => piece.voices[voice]?.notes.split('|').map((bar) => bar.trim().split(/\s+/).join(' ')) ?? [];

  it('has five plucked voices now: the octaves of the left hand and the inner notes too', () => {
    expect(piece.voices).toHaveLength(5);
    for (const voice of piece.voices) expect(voice.pluck).toBe(true);
  });

  it.each(LOW)('bar $bar: the upper note of the octave and the inner note as the score has them', ({ bar, octave, inner }) => {
    expect(bars(3)[bar - 1]).toBe(octave);
    expect(bars(4)[bar - 1]).toBe(inner);
  });

});

/**
 * Bars 15 to 69, the rest of the first movement, the five voices as the score has them: the melody (the stemmed tune
 * notes), the triplets (one line, whichever hand or staff plays them; a rest where a held note of another voice is
 * the same note), the bass (the lowest note of the left hand), the left hand's upper note (its octaves; from bar 60
 * its G sharp line) and the inner notes (chord notes, the held lower line of bars 37 to 40). Ties are written in the
 * bar where the note starts, so a bar can be longer, shorter or empty (the bass of bar 36, tied from 35 into 37).
 * Double sharps are `##`. The last bar is the chord under the fermata, held 64 steps; its doubled G#2 is left out.
 */
const FULL: { bar: number; melody: string; triplets: string; bass: string; octave: string; inner: string }[] = [
  { bar: 15, melody: '-:36 B4:12', triplets: 'B3:4 D4:4 F#4:4 B3:4 D4:4 F#4:4 B3:4 D#4:4 F#4:4 B3:4 D#4:4 F#4:4', bass: 'B1:60', octave: 'B2:60', inner: '-:48' },
  { bar: 16, melody: 'C5:36 A#4:12', triplets: 'B3:4 E4:4 G4:4 B3:4 E4:4 G4:4 B3:4 E4:4 G4:4 B3:4 E4:4 G4:4', bass: 'E2:12 G2:12 E2:12', octave: 'E3:12 G3:12 E3:12', inner: '-:48' },
  { bar: 17, melody: 'B4:36 B4:12', triplets: 'B3:4 D#4:4 F#4:4 B3:4 D#4:4 F#4:4 B3:4 D#4:4 F#4:4 B3:4 D#4:4 F#4:4', bass: 'B1:60', octave: 'B2:60', inner: '-:48' },
  { bar: 18, melody: 'C5:36 A#4:12', triplets: 'B3:4 E4:4 G4:4 B3:4 E4:4 G4:4 B3:4 E4:4 G4:4 B3:4 E4:4 G4:4', bass: 'E2:12 G2:12 E2:12', octave: 'E3:12 G3:12 E3:12', inner: '-:48' },
  { bar: 19, melody: 'B4:24 B4:24', triplets: 'B3:4 D#4:4 F#4:4 B3:4 D#4:4 F#4:4 B3:4 D4:4 E#4:4 B3:4 D4:4 E#4:4', bass: 'B1:24 G#1:24', octave: 'B2:24 G#2:24', inner: '-:48' },
  { bar: 20, melody: 'B4:24 A4:24', triplets: 'B3:4 C#4:4 G#4:4 B3:4 C#4:4 G#4:4 A3:4 C#4:4 F#4:4 A3:4 C#4:4 F#4:4', bass: 'E#1:24 F#1:24', octave: 'E#2:24 F#2:24', inner: '-:48' },
  { bar: 21, melody: 'G4:24 F#4:24', triplets: 'G3:4 B3:4 D4:4 G3:4 B3:4 D4:4 F#3:4 A3:4 D#4:4 F#3:4 A3:4 D#4:4', bass: 'B1:24 B#1:24', octave: 'B2:24 B#2:24', inner: '-:48' },
  { bar: 22, melody: 'C#4:24 C#4:12 C#4:12', triplets: 'C#3:4 F#3:4 A3:4 C#3:4 F#3:4 A3:4 C#3:4 F#3:4 G#3:4 C#3:4 E#3:4 G#3:4', bass: 'C#2:24 C#2:24', octave: '-:48', inner: '-:48' },
  { bar: 23, melody: '-:36 C#5:9 C#5:3', triplets: 'F#3:4 A3:4 C#4:4 A3:4 C#4:4 F#4:4 C#4:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4', bass: 'F#1:48', octave: 'F#2:48', inner: 'C#2:48' },
  { bar: 24, melody: 'C#5:36 C#5:9 C#5:3', triplets: 'C#4:4 G#4:4 B4:4 C#4:4 G#4:4 B4:4 C#4:4 G#4:4 B4:4 C#4:4 G#4:4 B4:4', bass: 'E#2:48', octave: 'E#3:48', inner: 'C#3:48' },
  { bar: 25, melody: 'C#5:24 B#4:12 C#5:12', triplets: 'C#4:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4 B#3:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4', bass: 'F#2:24 D#2:12 C#2:12', octave: 'F#3:24 D#3:12 C#3:12', inner: '-:48' },
  { bar: 26, melody: 'D#5:36 D#5:12', triplets: 'D#4:4 F#4:4 G#4:4 D#4:4 F#4:4 G#4:4 D#4:4 F#4:4 G#4:4 D#4:4 F#4:4 G#4:4', bass: 'B#1:36 B#1:12', octave: 'B#2:36 B#2:12', inner: 'G#2:36 G#2:12' },
  { bar: 27, melody: 'E5:24 D#5:12 C#5:12', triplets: 'E4:4 G#4:4 C#5:4 E4:4 G#4:4 C#5:4 D#4:4 F#4:4 A4:4 C#4:4 E4:4 A#4:4', bass: 'C#2:24 F#1:12 F##1:12', octave: 'C#3:24 F#2:12 F##2:12', inner: 'A2:24 -:24' },
  { bar: 28, melody: '-:12 F#4:12 A4:12 F#4:12', triplets: 'B#4:4 B#3:4 D#4:4 -:4 B#3:4 D#4:4 -:4 B#3:4 D#4:4 -:4 B#3:4 D#4:4', bass: 'G#1:48', octave: 'G#2:48', inner: '-:48' },
  { bar: 29, melody: '-:12 G#3:12 A3:12 F#3:12', triplets: '-:4 B#3:4 D#4:4 -:4 B#3:4 D#4:4 -:4 B#3:4 D#4:4 -:4 B#3:4 D#4:4', bass: 'G#1:48', octave: 'G#2:48', inner: '-:48' },
  { bar: 30, melody: '-:12 C#5:12 E5:12 C#5:12', triplets: 'E3:4 E4:4 G#4:4 -:4 E4:4 G#4:4 -:4 E4:4 G#4:4 -:4 E4:4 G#4:4', bass: 'G#1:48', octave: 'G#2:48', inner: '-:48' },
  { bar: 31, melody: '-:12 C#4:12 E4:12 C#4:12', triplets: '-:4 E3:4 G#3:4 -:4 E3:4 G#3:4 -:4 E3:4 G#3:4 -:4 E3:4 G#3:4', bass: 'G#1:48', octave: 'G#2:48', inner: '-:48' },
  { bar: 32, melody: '-:48', triplets: 'D#3:4 A3:4 F#3:4 B#3:4 A3:4 D#4:4 B#3:4 F#4:4 D#4:4 A4:4 F#4:4 B#4:4', bass: 'G#1:48', octave: 'G#2:48', inner: '-:48' },
  { bar: 33, melody: '-:48', triplets: 'E3:4 C#4:4 G#3:4 E4:4 C#4:4 G#4:4 E4:4 C#5:4 G#4:4 E5:4 C#5:4 G#4:4', bass: 'G#1:48', octave: 'G#2:48', inner: '-:48' },
  { bar: 34, melody: '-:48', triplets: 'C#4:4 F##4:4 E4:4 A#4:4 F##4:4 C#5:4 A#4:4 E5:4 C#5:4 F##5:4 E5:4 A#5:4', bass: 'G#1:48', octave: 'G#2:48', inner: '-:48' },
  { bar: 35, melody: '-:48', triplets: 'F#4:4 B#4:4 A4:4 D#5:4 B#4:4 F#5:4 D#5:4 A5:4 F#5:4 B#5:4 A5:4 D#6:4', bass: 'G#1:144', octave: 'G#2:144', inner: '-:48' },
  { bar: 36, melody: '-:48', triplets: 'B#5:4 F#5:4 A5:4 D#5:4 F#5:4 B#4:4 D#5:4 A4:4 B#4:4 F#4:4 A4:4 D#4:4', bass: '', octave: '', inner: '-:48' },
  { bar: 37, melody: '-:48', triplets: 'F#4:4 B#3:4 D#4:4 A3:4 B#3:4 F#3:4 A3:4 -:4 F#3:4 -:4 F#3:4 A3:4', bass: '', octave: '', inner: '-:28 D#3:8 C#3:12' },
  { bar: 38, melody: '-:48', triplets: '-:4 F#3:4 G#3:4 A3:4 G#3:4 F#3:4 -:4 F#3:4 A3:4 -:4 F#3:4 A3:4', bass: 'G#1:48', octave: 'G#2:48', inner: 'B#2:24 D#3:12 C#3:12' },
  { bar: 39, melody: '-:48', triplets: '-:4 F#3:4 G#3:4 A3:4 G#3:4 F#3:4 -:4 F#3:4 A3:4 -:4 F#3:4 A3:4', bass: 'G#1:48', octave: 'G#2:48', inner: 'B#2:24 D3:12 C#3:12' },
  { bar: 40, melody: '-:48', triplets: '-:4 F#3:4 G#3:4 A3:4 G#3:4 F#3:4 C#3:4 E3:4 C#4:4 C#3:4 E3:4 C#4:4', bass: 'G#1:24 A1:24', octave: 'G#2:24 A2:24', inner: 'B#2:24 -:24' },
  { bar: 41, melody: '-:48', triplets: 'D#3:4 A3:4 C#4:4 D#3:4 A3:4 C#4:4 D#3:4 G#3:4 B#3:4 D#3:4 F#3:4 B#3:4', bass: 'F#1:24 G#1:24', octave: 'F#2:24 G#2:24', inner: '-:48' },
  { bar: 42, melody: '-:36 G#4:9 G#4:3', triplets: 'E3:4 G#3:4 C#4:4 G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4', bass: 'C#2:48', octave: 'C#3:48', inner: 'G#2:48' },
  { bar: 43, melody: 'G#4:36 G#4:9 G#4:3', triplets: 'G#3:4 D#4:4 F#4:4 G#3:4 D#4:4 F#4:4 G#3:4 D#4:4 F#4:4 G#3:4 D#4:4 F#4:4', bass: 'B#1:48', octave: 'B#2:48', inner: 'G#2:48' },
  { bar: 44, melody: 'G#4:24 A4:24', triplets: 'G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4 A3:4 C#4:4 F#4:4 A3:4 C#4:4 F#4:4', bass: 'C#2:24 F#1:24', octave: 'C#3:24 F#2:24', inner: '-:48' },
  { bar: 45, melody: 'G#4:24 F#4:12 B4:12', triplets: 'G#3:4 B3:4 E4:4 G#3:4 B3:4 E4:4 A3:4 B3:4 D#4:4 A3:4 B3:4 D#4:4', bass: 'B1:24 B1:24', octave: 'B2:24 B2:24', inner: '-:48' },
  { bar: 46, melody: 'E4:12 -:24 B4:9 B4:3', triplets: 'G#3:4 B3:4 E4:4 B3:4 E4:4 G#4:4 B3:4 E4:4 G#4:4 B3:4 E4:4 G#4:4', bass: 'E2:48', octave: 'E3:48', inner: '-:48' },
  { bar: 47, melody: 'B4:36 B4:9 B4:3', triplets: 'B3:4 F#4:4 A4:4 B3:4 F#4:4 A4:4 B3:4 F#4:4 A4:4 B3:4 F#4:4 A4:4', bass: 'D#2:48', octave: 'D#3:48', inner: '-:48' },
  { bar: 48, melody: 'B4:24 B#4:12 C#5:12', triplets: 'B3:4 E4:4 G#4:4 B3:4 E4:4 G#4:4 B#3:4 F#4:4 G#4:4 C#4:4 E4:4 G#4:4', bass: 'E2:24 D#2:12 C#2:12', octave: 'E3:24 D#3:12 C#3:12', inner: '-:48' },
  { bar: 49, melody: 'D#5:24 E5:24', triplets: 'D#4:4 F#4:4 G#4:4 D#4:4 F#4:4 G#4:4 E4:4 G#4:4 C#5:4 E4:4 G#4:4 C#5:4', bass: 'B#1:24 C#2:24', octave: 'B#2:24 C#3:24', inner: 'G#2:24 G#2:24' },
  { bar: 50, melody: 'D5:24 B#4:24', triplets: 'D4:4 F#4:4 A4:4 D4:4 F#4:4 A4:4 B#3:4 F#4:4 G#4:4 B#3:4 F#4:4 G#4:4', bass: 'F#1:24 G#1:24', octave: 'F#2:24 G#2:24', inner: '-:48' },
  { bar: 51, melody: 'C#5:36 C#5:12', triplets: 'C#4:4 E4:4 G#4:4 C#4:4 E4:4 G#4:4 C#4:4 E#4:4 G#4:4 C#4:4 E#4:4 G#4:4', bass: 'C#2:60', octave: 'C#3:60', inner: '-:48' },
  { bar: 52, melody: 'D5:36 B#4:12', triplets: 'C#4:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4', bass: 'F#2:12 A2:12 F#2:12', octave: 'F#3:12 A3:12 F#3:12', inner: '-:48' },
  { bar: 53, melody: 'C#5:36 C#5:12', triplets: 'C#4:4 E#4:4 G#4:4 C#4:4 E#4:4 G#4:4 C#4:4 E#4:4 G#4:4 C#4:4 E#4:4 G#4:4', bass: 'C#2:60', octave: 'C#3:60', inner: '-:48' },
  { bar: 54, melody: 'D5:36 B#4:12', triplets: 'C#4:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4', bass: 'F#2:12 A2:12 F#2:12', octave: 'F#3:12 A3:12 F#3:12', inner: '-:48' },
  { bar: 55, melody: 'C#5:24 C#5:24', triplets: 'C#4:4 E#4:4 G#4:4 C#4:4 E#4:4 G#4:4 C#4:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4', bass: 'C#2:24 F#1:24', octave: 'C#3:24 F#2:24', inner: '-:48' },
  { bar: 56, melody: 'B4:36 B4:12', triplets: 'B3:4 F#4:4 A4:4 B3:4 F#4:4 A4:4 B3:4 F#4:4 A4:4 B3:4 E4:4 G#4:4', bass: 'D#2:36 E2:12', octave: 'D#3:36 E3:12', inner: '-:48' },
  { bar: 57, melody: 'A4:12 A4:12 G#4:12 G#4:12', triplets: 'A3:4 E4:4 G#4:4 A3:4 D#4:4 F#4:4 G#3:4 D#4:4 F#4:4 G#3:4 C#4:4 E4:4', bass: 'C#2:12 D#2:12 B#1:12 C#2:12', octave: 'C#3:12 D#3:12 B#2:12 C#3:12', inner: '-:48' },
  { bar: 58, melody: 'F#4:24 G#4:12 A4:12', triplets: 'F#3:4 C#4:4 D#4:4 F#3:4 C#4:4 D#4:4 G#3:4 C#4:4 D#4:4 A3:4 C#4:4 D#4:4', bass: 'A1:24 G#1:12 F#1:12', octave: 'A2:24 G#2:12 F#2:12', inner: '-:48' },
  { bar: 59, melody: 'G#4:24 G#4:24', triplets: 'G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4 F#3:4 B#3:4 D#4:4 F#3:4 B#3:4 D#4:4', bass: 'G#1:24 G#1:24', octave: 'G#2:24 G#2:24', inner: '-:48' },
  { bar: 60, melody: 'C#4:12 -:36', triplets: 'E3:4 G#3:4 C#4:4 G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4', bass: 'C#2:48', octave: 'G#2:36 G#2:9 G#2:3', inner: '-:48' },
  { bar: 61, melody: '-:48', triplets: 'G#3:4 D#4:4 F#4:4 G#3:4 D#4:4 F#4:4 G#3:4 D#4:4 F#4:4 G#3:4 D#4:4 F#4:4', bass: 'B#1:48', octave: 'G#2:36 G#2:9 G#2:3', inner: '-:48' },
  { bar: 62, melody: '-:48', triplets: 'G#3:4 E4:4 C#4:4 G#4:4 E4:4 C#5:4 G#4:4 E5:4 C#5:4 G#5:4 E5:4 C#5:4', bass: 'C#2:48', octave: 'G#2:36 G#2:9 G#2:3', inner: '-:48' },
  { bar: 63, melody: '-:36 B#3:12', triplets: 'B#4:4 D#5:4 A4:4 B#4:4 F#4:4 A4:4 D#4:4 F#4:4 A3:8 G#3:4 F#3:4', bass: 'G#1:48', octave: 'G#2:36 G#2:9 G#2:3', inner: '-:48' },
  { bar: 64, melody: '-:48', triplets: 'C#4:4 E4:4 C#4:4 G#4:4 E4:4 C#5:4 G#4:4 E5:4 C#5:4 G#5:4 E5:4 C#5:4', bass: 'C#2:48', octave: 'G#2:36 G#2:9 G#2:3', inner: 'E3:4 -:44' },
  { bar: 65, melody: '-:36 B#3:12', triplets: 'B#4:4 D#5:4 A4:4 B#4:4 F#4:4 A4:4 D#4:4 F#4:4 A3:8 G#3:4 F#3:4', bass: 'G#1:48', octave: 'G#2:36 G#2:9 G#2:3', inner: '-:48' },
  { bar: 66, melody: '-:48', triplets: 'C#4:4 G#3:4 C#4:4 E4:4 C#4:4 G#3:4 -:4 E3:4 G#3:4 C#4:4 G#3:4 E3:4', bass: 'C#2:96', octave: 'G#2:24 C#3:24', inner: 'E3:4 -:44' },
  { bar: 67, melody: '-:48', triplets: '-:4 C#3:4 E3:4 G#3:4 E3:4 C#3:4 -:24', bass: '', octave: 'G#2:24 G#2:4 C#3:4 G#2:4 E2:4 G#2:4 E2:4', inner: '-:48' },
  { bar: 68, melody: '-:24 C#4:24', triplets: '-:24 G#3:24', bass: 'C#2:24 C#2:24', octave: '-:24 C#3:24', inner: '-:24 E3:24' },
  { bar: 69, melody: 'C#4:64', triplets: 'G#3:64', bass: 'C#2:64', octave: 'C#3:64', inner: 'E3:64' },
];

describe('the whole first movement of the Moonlight Sonata, against the score', () => {
  const piece = TRACKS.moonlight!;
  const bars = (voice: number) => piece.voices[voice]?.notes.split('|').map((bar) => bar.trim().split(/\s+/).join(' ')) ?? [];

  it.each(FULL)('bar $bar: the five voices as the score has them', ({ bar, melody, triplets, bass, octave, inner }) => {
    expect(bars(0)[bar - 1]).toBe(melody);
    expect(bars(1)[bar - 1]).toBe(triplets);
    expect(bars(2)[bar - 1]).toBe(bass);
    expect(bars(3)[bar - 1]).toBe(octave);
    expect(bars(4)[bar - 1]).toBe(inner);
  });

  it('ends on the whole C sharp minor chord under the fermata, every voice 69 bars long', () => {
    expect([0, 1, 2, 3, 4].map((voice) => bars(voice).at(-1))).toEqual(['C#4:64', 'G#3:64', 'C#2:64', 'C#3:64', 'E3:64']);
    expect([0, 1, 2, 3, 4].map((voice) => bars(voice).length)).toEqual([69, 69, 69, 69, 69]);
  });
});
