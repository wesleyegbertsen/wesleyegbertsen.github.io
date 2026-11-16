import { education } from '../../../../data/education.ts';
import { experience } from '../../../../data/experience.ts';
import { profile } from '../../../../data/profile.ts';
import { projects } from '../../../../data/projects.ts';
import { skills } from '../../../../data/skills.ts';
import { flatten, parseVoice, trackSteps } from '../audio/score.ts';
import { TRACKS } from './music.ts';
import { PIECES, PIECE_TEXT_MAX } from './pieces.ts';
import { buildWorld } from './world.ts';

/** The loudest step of a track: its voices summed (as in audio/levels.test.ts). */
const peakOf = (name: string) => {
  const track = TRACKS[name]!;
  const sum = new Array<number>(trackSteps(track)).fill(0);
  for (const voice of track.voices) for (const note of parseVoice(voice.notes).notes) for (let s = note.step; s < note.step + note.steps; s++) sum[s]! += voice.volume;
  return Math.max(...sum);
};

describe('the pieces of the player piano', () => {
  it('has the Moonlight Sonata, by Beethoven', () => {
    expect(PIECES.map((piece) => [piece.id, piece.track])).toContainEqual(['moonlight', 'moonlight']);
    expect(PIECES.find((piece) => piece.id === 'moonlight')?.artist).toMatch(/BEETHOVEN/);
  });

  it('names a track of TRACKS for every piece: one that plays once, as soft as the piano is', () => {
    const songs = Object.keys(TRACKS).filter((name) => TRACKS[name]!.loop);
    const quietest = Math.min(...songs.map(peakOf));
    for (const piece of PIECES) {
      expect(TRACKS[piece.track], piece.id).toBeDefined();
      expect(TRACKS[piece.track]!.loop, piece.id).toBe(false);
      expect(peakOf(piece.track), piece.id).toBeLessThan(quietest);
      expect(TRACKS[piece.track]!.voices.every((voice) => voice.pluck), piece.id).toBe(true);
    }
  });

  it('has unique ids, and a name and an artist that are not empty and fit the selector', () => {
    expect(new Set(PIECES.map((piece) => piece.id)).size).toBe(PIECES.length);
    expect(PIECE_TEXT_MAX).toBe(22);
    for (const piece of PIECES) {
      for (const text of [piece.name, piece.artist]) {
        expect(text.trim().length, piece.id).toBeGreaterThan(0);
        expect(text.length, `${piece.id}: ${text}`).toBeLessThanOrEqual(PIECE_TEXT_MAX);
      }
    }
  });

  it('goes into the world with the length of its track in ticks, never typed by hand', () => {
    const world = buildWorld({ profile, skills, experience, education, projects });
    expect(world.pieces?.map((piece) => piece.id)).toEqual(PIECES.map((piece) => piece.id));
    for (const piece of world.pieces!) expect(piece.ticks, piece.id).toBe(Math.round(flatten(TRACKS[piece.track]!).length * 60));
    // Nothing the track holds is written twice.
    for (const piece of PIECES) expect(Object.keys(piece).sort()).toEqual(['artist', 'id', 'name', 'track']);
  });
});
