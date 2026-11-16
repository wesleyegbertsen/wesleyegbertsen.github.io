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

  it('is fourteen bars and a held last chord, at 56 quarter notes a minute: about a minute', () => {
    // One step of the score is a twelfth of a beat: a triplet eighth is 4 steps, a dotted eighth and a sixteenth
    // are 9 and 3, a bar of four beats is 48.
    expect(piece.bpm).toBe(168);
    expect(60 / stepSeconds(piece) / 12).toBeCloseTo(56, 6);
    expect(trackSteps(piece)).toBe(14 * 48 + 32);
    const { length } = flatten(piece);
    expect(length).toBeGreaterThanOrEqual(60);
    expect(length).toBeLessThanOrEqual(65);
    for (const voice of piece.voices) expect(parseVoice(voice.notes).steps, voice.notes.slice(0, 20)).toBe(trackSteps(piece));
  });

  it('has three plucked voices and no drums, every note on a piano', () => {
    expect(piece.voices).toHaveLength(3);
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

  it('is softer than the other tunes at its loudest', () => {
    const others = Object.keys(TRACKS).filter((name) => name !== 'moonlight' && TRACKS[name]!.loop);
    const quietest = Math.min(...others.map(peakOf));
    expect(peakOf('moonlight')).toBeLessThan(quietest);
    expect(peakOf('moonlight')).toBeGreaterThanOrEqual(0.6);
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
 * and a sixteenth are 9 and 3). The last entry is the held chord the piece ends on.
 */
const SCORE: { bar: number; triplets: string; bass: string; melody: string }[] = [
  { bar: 1, triplets: 'G#3 C#4 E4 G#3 C#4 E4 G#3 C#4 E4 G#3 C#4 E4', bass: 'C#2:48', melody: '-:48' },
  { bar: 2, triplets: 'G#3 C#4 E4 G#3 C#4 E4 G#3 C#4 E4 G#3 C#4 E4', bass: 'B1:48', melody: '-:48' },
  { bar: 3, triplets: 'A3 C#4 E4 A3 C#4 E4 A3 D4 F#4 A3 D4 F#4', bass: 'A1:24 F#1:24', melody: '-:48' },
  { bar: 4, triplets: 'G#3 B#3 F#4 G#3 C#4 E4 G#3 C#4 D#4 F#3 B#3 D#4', bass: 'G#1:48', melody: '-:48' },
  { bar: 5, triplets: 'E3 G#3 C#4 G#3 C#4 E4 G#3 C#4 E4 G#3 C#4 E4', bass: 'C#2:48', melody: '-:36 G#4:9 G#4:3' },
  { bar: 6, triplets: 'G#3 D#4 F#4 G#3 D#4 F#4 G#3 D#4 F#4 G#3 D#4 F#4', bass: 'B#1:48', melody: 'G#4:36 G#4:9 G#4:3' },
  { bar: 7, triplets: 'G#3 C#4 E4 G#3 C#4 E4 A3 C#4 F#4 A3 C#4 F#4', bass: 'C#2:24 F#1:24', melody: 'G#4:24 A4:24' },
  { bar: 8, triplets: 'G#3 B3 E4 G#3 B3 E4 A3 B3 D#4 A3 B3 D#4', bass: 'B1:48', melody: 'G#4:24 F#4:12 B4:12' },
  { bar: 9, triplets: 'G#3 B3 E4 G#3 B3 E4 G#3 B3 E4 G#3 B3 E4', bass: 'E2:48', melody: 'E4:12 -:36' },
  { bar: 10, triplets: 'G3 B3 E4 G3 B3 E4 G3 B3 E4 G3 B3 E4', bass: 'E2:48', melody: '-:36 G4:9 G4:3' },
  { bar: 11, triplets: 'G3 B3 F4 G3 B3 F4 G3 B3 F4 G3 B3 F4', bass: 'D2:48', melody: 'G4:36 G4:9 G4:3' },
  { bar: 12, triplets: 'G3 C4 E4 G3 B3 E4 G3 C#4 E4 F#3 C#4 E4', bass: 'C2:12 B1:12 A#1:24', melody: 'G4:36 F#4:12' },
  { bar: 13, triplets: 'F#3 B3 D4 F#3 B3 D4 G3 B3 C#4 E3 B3 C#4', bass: 'B1:24 E2:12 G2:12', melody: 'F#4:24 G4:12 E4:12' },
  { bar: 14, triplets: 'F#3 B3 D4 F#3 B3 D4 F#3 A#3 C#4 F#3 A#3 C#4', bass: 'F#2:24 F#1:24', melody: 'F#4:24 F#4:24' },
];
/** The end: the F sharp major chord of the half cadence at the end of bar 14, held. */
const HELD = { triplets: 'A#3:32', bass: 'F#1:32', melody: 'F#4:32' };

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

  it('ends on the held F sharp major chord of the half cadence, and has nothing more', () => {
    expect([triplets[14], bass[14], melody[14]]).toEqual([HELD.triplets, HELD.bass, HELD.melody]);
    expect([triplets.length, bass.length, melody.length]).toEqual([15, 15, 15]);
  });
});
