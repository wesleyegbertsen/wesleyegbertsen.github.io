import { education } from '../../../../data/education.ts';
import { experience } from '../../../../data/experience.ts';
import { profile } from '../../../../data/profile.ts';
import { projects } from '../../../../data/projects.ts';
import { skills } from '../../../../data/skills.ts';
import { flatten, parseVoice, trackSteps } from '../audio/score.ts';
import { loudnessOf } from '../audio/score.ts';
import { PIANO_LOUDNESS, PIANO_PEAK, TRACKS, levelled } from './music.ts';
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
    expect(PIECES.find((piece) => piece.id === 'moonlight')?.artist).toBe('L. VAN BEETHOVEN');
  });

  it('says in its name that the Moonlight Sonata is the first movement only (bars 1 to 69), in words, not a Roman numeral', () => {
    expect(PIECES.find((piece) => piece.id === 'moonlight')?.name).toBe('MOONLIGHT SONATA MVT 1');
  });

  it('names a track of TRACKS for every piece: one that plays once, plucked', () => {
    for (const piece of PIECES) {
      expect(TRACKS[piece.track], piece.id).toBeDefined();
      expect(TRACKS[piece.track]!.loop, piece.id).toBe(false);
      expect(TRACKS[piece.track]!.voices.every((voice) => voice.pluck), piece.id).toBe(true);
    }
  });

  it('sets every piece by its energy: at the level of the cafe tune, or with its peak at the loudest tune\'s, never over either', () => {
    // The target is the level of the tune the piano replaces; the ceiling the loudest step of any tune (as the cries).
    expect(PIANO_LOUDNESS).toBeCloseTo(loudnessOf(TRACKS.cafe!), 2);
    expect(PIANO_PEAK).toBeCloseTo(Math.max(...Object.keys(TRACKS).filter((name) => TRACKS[name]!.loop).map(peakOf)), 6);
    for (const piece of PIECES) {
      const level = loudnessOf(TRACKS[piece.track]!);
      const peak = peakOf(piece.track);
      expect(level, piece.id).toBeLessThanOrEqual(PIANO_LOUDNESS * 1.001);
      expect(peak, piece.id).toBeLessThanOrEqual(PIANO_PEAK + 1e-9);
      // As loud as it may be: at the target, or at the ceiling.
      expect(level >= PIANO_LOUDNESS * 0.999 || peak >= PIANO_PEAK - 1e-6, piece.id).toBe(true);
    }
  });

  it('raises a quiet piece and lowers a loud one, all its voices together, so a new piece cannot be quiet or loud by accident', () => {
    const quiet = { bpm: 120, loop: false, voices: [{ wave: 'pulse' as const, volume: 0.05, pluck: true as const, notes: 'C4:4 E4:4 G4:4 C5:4' }, { wave: 'triangle' as const, volume: 0.1, pluck: true as const, notes: 'C3:16' }] };
    const raised = levelled(quiet);
    expect(raised.voices[0]!.volume / raised.voices[1]!.volume).toBeCloseTo(0.5, 9);
    expect(loudnessOf(raised)).toBeGreaterThan(loudnessOf(quiet));
    const loud = { ...quiet, voices: quiet.voices.map((voice) => ({ ...voice, volume: voice.volume * 20 })) };
    const lowered = levelled(loud);
    expect(lowered.voices[0]!.volume).toBeLessThan(loud.voices[0]!.volume);
    for (const track of [raised, lowered]) {
      const sum = Math.max(...track.voices.map((voice) => voice.volume)) + Math.min(...track.voices.map((voice) => voice.volume));
      expect(sum).toBeLessThanOrEqual(PIANO_PEAK + 1e-9);
      expect(loudnessOf(track)).toBeLessThanOrEqual(PIANO_LOUDNESS * 1.001);
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
