import { flatten, parseVoice, stepSeconds, trackSteps } from '../audio/score.ts';
import { education } from '../../../../data/education.ts';
import { experience } from '../../../../data/experience.ts';
import { profile } from '../../../../data/profile.ts';
import { projects } from '../../../../data/projects.ts';
import { skills } from '../../../../data/skills.ts';
import { routeTo } from '../engine/bot.ts';
import { initialGame } from '../engine/engine.ts';
import type { GameState } from '../engine/types.ts';
import { MUSIC, TRACKS } from './music.ts';
import { buildWorld } from './world.ts';

/** The summed volume of the voices that sound at each step (as in audio/levels.test.ts). */
const peakOf = (name: string) => {
  const track = TRACKS[name]!;
  const sum = new Array<number>(trackSteps(track)).fill(0);
  for (const voice of track.voices) for (const note of parseVoice(voice.notes).notes) for (let s = note.step; s < note.step + note.steps; s++) sum[s]! += voice.volume;
  return Math.max(...sum);
};

describe('the Moonlight Sonata on the player piano of the cafe', () => {
  const piece = TRACKS[MUSIC.piano!]!;

  it('is the piano tune of the world, played once', () => {
    expect(MUSIC.piano).toBe('moonlight');
    expect(piece.loop).toBe(false);
  });

  it('is fourteen bars of triplets and a held last chord, at 56 quarter notes a minute: about a minute', () => {
    // One step of the score is one triplet eighth: twelve to a bar of four beats.
    expect(piece.bpm).toBe(42);
    expect(60 / stepSeconds(piece) / 3).toBeCloseTo(56, 6);
    expect(trackSteps(piece)).toBe(14 * 12 + 8);
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
    const first = parseVoice(piece.voices[1]!.notes).notes.filter((note) => note.step < 12);
    expect(first.map((note) => note.step)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('is softer than the other tunes at its loudest', () => {
    const others = Object.keys(TRACKS).filter((name) => name !== 'moonlight' && TRACKS[name]!.loop);
    const quietest = Math.min(...others.map(peakOf));
    expect(peakOf('moonlight')).toBeLessThan(quietest);
    expect(peakOf('moonlight')).toBeGreaterThanOrEqual(0.6);
  });
});

describe('the player piano in the cafe', () => {
  const world = buildWorld({ profile, skills, experience, education, projects });
  const cafe = world.maps.cafe!;

  it('knows how long the piece is, in ticks of the game', () => {
    expect(MUSIC.pianoTicks).toBe(Math.round(flatten(TRACKS.moonlight!).length * 60));
  });

  it('stands on the right wall, in the pocket between the table and the plant, and starts and stops the piece', () => {
    const piano = cafe.objects.find((object) => object.id === 'cafe:k')!;
    expect(piano).toMatchObject({ x: 8, y: 5, sprite: 'piano', solid: true, trigger: 'interact' });
    expect(piano.branches).toEqual([{ do: [{ piano: true }] }]);
  });

  it('is in nobody\'s way: from the door every other thing of the cafe can still be reached, and the piano too', () => {
    // Just inside the door (m at 4,8).
    const at: GameState = { ...initialGame(world), scene: 'world', map: 'cafe', x: 4, y: 7 };
    for (const object of cafe.objects) expect(routeTo(world, { ...at, x: 4, y: 7 }, object.id), object.id).not.toBeNull();
    // The piano is faced from the one cell beside it.
    const route = routeTo(world, { ...at, x: 4, y: 7 }, 'cafe:k')!;
    expect(route.at(-1)).toBe('right');
  });
});
