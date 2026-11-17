import { EFFECTS, JINGLES, MUSIC, TRACKS } from '../content/music.ts';
import { PIECES } from '../content/pieces.ts';
import { JUMP_TICKS } from '../engine/engine.ts';
import { BOSS_TICKS, QUICK_TICKS, WILD_TICKS } from '../engine/transition.ts';
import type { Cue } from '../engine/types.ts';
import { createSequencer, flatten, frequencyOf, loudnessOf, parseVoice, stepSeconds, trackSteps, type Track } from './score.ts';

// Written as a record so that a new cue in the engine is a type error here until it is listed.
const CUE_LIST = { cursor: true, confirm: true, cancel: true, blip: true, door: true, item: true, coin: true, star: true, badge: true, bump: true, jump: true, heal: true, rest: true, hit: true, hurt: true, miss: true, faint: true, fall: true, light: true, low: true, run: true, encounter: true, showdown: true, round: true, levelup: true, quieter: true, louder: true, path: true, cave: true, sound: true, screen: true, mode: true, push: true, slide: true, switch: true, gate: true } satisfies Record<Cue, true>;
const CUES = Object.keys(CUE_LIST) as Cue[];

const tune = (notes: string, extra: Partial<Track> = {}): Track => ({ bpm: 150, loop: false, voices: [{ wave: 'pulse', volume: 0.5, notes }], ...extra });

describe('note names', () => {
  it('turns a name into its frequency', () => {
    expect(frequencyOf('A4')).toBe(440);
    expect(frequencyOf('A5')).toBe(880);
    expect(frequencyOf('C4')).toBeCloseTo(261.63, 2);
    expect(frequencyOf('F#3')).toBeCloseTo(185, 1);
    expect(frequencyOf('Bb3')).toBeCloseTo(frequencyOf('A#3'), 6);
  });

  it('takes a double sharp as two sharps: F##4 is a G4, as a score writes it', () => {
    expect(frequencyOf('F##4')).toBeCloseTo(frequencyOf('G4'), 9);
    expect(frequencyOf('F##1')).toBeCloseTo(frequencyOf('G1'), 9);
  });

  it('takes a double flat as two flats: Bbb2 is an A2, Abb5 a G5, as a score writes them', () => {
    expect(frequencyOf('Bbb2')).toBeCloseTo(frequencyOf('A2'), 9);
    expect(frequencyOf('Abb5')).toBeCloseTo(frequencyOf('G5'), 9);
    expect(frequencyOf('Cbb4')).toBeCloseTo(frequencyOf('A#3'), 9);
  });

  it('refuses what is not a note', () => {
    for (const bad of ['H4', 'C', '4', 'c4', 'C#', 'C10', '', 'C###4', 'Cbbb4', 'C#b4', 'Cb#4']) expect(() => frequencyOf(bad)).toThrow(/Not a note/);
  });
});

describe('a voice', () => {
  it('places notes on steps: a length after the colon, one step without, rests leave a gap, bar lines are skipped', () => {
    const { notes, steps } = parseVoice('C4 D4:2 | -:3 E4:4');
    expect(steps).toBe(10);
    expect(notes.map((note) => [note.step, note.steps])).toEqual([
      [0, 1],
      [1, 2],
      [6, 4],
    ]);
    expect(notes[2]!.frequency).toBeCloseTo(329.63, 2);
  });

  it('reads the drums of a noise voice', () => {
    expect(parseVoice('k:2 h s:4').notes).toEqual([
      { step: 0, steps: 2, frequency: 0, drum: 'k' },
      { step: 2, steps: 1, frequency: 0, drum: 'h' },
      { step: 3, steps: 4, frequency: 0, drum: 's' },
    ]);
  });

  it('names the token that is wrong', () => {
    expect(() => parseVoice('C4 X9')).toThrow(/'X9'/);
    expect(() => parseVoice('C4:0')).toThrow(/Bad length in 'C4:0'/);
    expect(() => parseVoice('C4:1.5')).toThrow(/Bad length/);
    expect(() => parseVoice('C4:2:2')).toThrow(/Bad length/);
    expect(parseVoice('   ')).toEqual({ notes: [], steps: 0 });
  });
});

describe('a track', () => {
  it('gives every note a time in seconds from the tempo: four steps to the beat', () => {
    const track: Track = {
      bpm: 150,
      loop: false,
      voices: [
        { wave: 'pulse', volume: 0.5, notes: 'A4:2 -:2 A5:4' },
        { wave: 'triangle', volume: 0.6, notes: 'A2:8' },
      ],
    };
    expect(stepSeconds(track)).toBeCloseTo(0.1, 9);
    expect(trackSteps(track)).toBe(8);
    const { notes, length, loopAt } = flatten(track);
    expect(length).toBeCloseTo(0.8, 9);
    expect(loopAt).toBe(0);
    expect(notes.map((note) => [note.voice, note.wave, +note.time.toFixed(3), +note.duration.toFixed(3), Math.round(note.frequency)])).toEqual([
      [0, 'pulse', 0, 0.2, 440],
      [1, 'triangle', 0, 0.8, 110],
      [0, 'pulse', 0.4, 0.4, 880],
    ]);
    expect(notes[0]!.volume).toBe(0.5);
  });

  it('hands its notes out as time passes, each one once', () => {
    const sequencer = createSequencer(tune('A4 B4 C5 D5'));
    expect(sequencer.take(0)).toEqual([]);
    expect(sequencer.take(0.15).map((note) => Math.round(note.frequency))).toEqual([440, 494]);
    expect(sequencer.take(0.15)).toEqual([]);
    expect(sequencer.done).toBe(false);
    expect(sequencer.take(10).map((note) => Math.round(note.frequency))).toEqual([523, 587]);
    expect(sequencer.take(20)).toEqual([]);
    expect(sequencer.done).toBe(true);
  });

  it('goes round and round when it loops, later each time', () => {
    const sequencer = createSequencer(tune('A4:2 B4:2', { loop: true }));
    const times = sequencer.take(1.3).map((note) => [Math.round(note.frequency), +note.time.toFixed(2)]);
    expect(times).toEqual([
      [440, 0],
      [494, 0.2],
      [440, 0.4],
      [494, 0.6],
      [440, 0.8],
      [494, 1],
      [440, 1.2],
    ]);
    expect(sequencer.done).toBe(false);
    expect(sequencer.take(1.5).map((note) => +note.time.toFixed(2))).toEqual([1.4]);
  });

  it('plays an intro once and loops from the loop point', () => {
    const sequencer = createSequencer(tune('C4:2 A4:2 B4:2', { loop: true, loopFrom: 2 }));
    expect(flatten(tune('C4:2 A4:2 B4:2', { loop: true, loopFrom: 2 })).loopAt).toBeCloseTo(0.2, 9);
    const heard = sequencer.take(1.19).map((note) => [Math.round(note.frequency), +note.time.toFixed(2)]);
    expect(heard).toEqual([
      [262, 0],
      [440, 0.2],
      [494, 0.4],
      [440, 0.6],
      [494, 0.8],
      [440, 1],
    ]);
  });

  it('gives one round when asked for everything, and does not hang on an empty loop', () => {
    expect(createSequencer(tune('A4 B4', { loop: true })).take(Infinity)).toHaveLength(2);
    const empty = createSequencer(tune('-:4', { loop: true }));
    expect(empty.take(100)).toEqual([]);
    expect(empty.done).toBe(true);
    const tail = createSequencer(tune('A4:2 -:2', { loop: true, loopFrom: 2 }));
    expect(tail.take(100)).toHaveLength(1);
    expect(tail.done).toBe(true);
  });
});

describe('the scores of the game', () => {
  it.each(Object.entries(TRACKS))('%s: every voice is equally long, in whole bars, and it loops from a bar line', (_name, track) => {
    const lengths = track.voices.map((voice) => parseVoice(voice.notes).steps);
    expect(new Set(lengths).size).toBe(1);
    expect(lengths[0]! % 16).toBe(0);
    expect(lengths[0]).toBeGreaterThan(0);
    expect((track.loopFrom ?? 0) % 16).toBe(0);
    expect(track.loopFrom ?? 0).toBeLessThan(lengths[0]!);
    expect(track.bpm).toBeGreaterThanOrEqual(60);
    expect(track.bpm).toBeLessThanOrEqual(200);
  });

  it.each(Object.entries(TRACKS))('%s: uses the four voices of a Game Boy (a piece of the player piano up to six), within hearing and at a sane level', (name, track) => {
    // The tunes keep to the Game Boy's four channels; a piece of the player piano (PIECES) is a piano with more
    // fingers: up to six voices and two triangles. The player itself has no limit (every note is an oscillator).
    const piano = PIECES.some((piece) => piece.track === name);
    expect(track.voices.length).toBeLessThanOrEqual(piano ? 6 : 4);
    expect(track.voices.filter((voice) => voice.wave === 'noise').length).toBeLessThanOrEqual(piano ? 0 : 1);
    expect(track.voices.filter((voice) => voice.wave === 'triangle').length).toBeLessThanOrEqual(piano ? 2 : 1);
    for (const note of flatten(track).notes) {
      expect(note.volume).toBeGreaterThan(0);
      expect(note.volume).toBeLessThanOrEqual(1);
      if (note.wave === 'noise') expect(note.drum).toBeDefined();
      else {
        expect(note.frequency).toBeGreaterThan(40);
        expect(note.frequency).toBeLessThan(4200);
      }
    }
  });

  it('has a track for every place, and they are different tunes', () => {
    const names = [MUSIC.title, MUSIC.ending, MUSIC.wild, MUSIC.boss, MUSIC.victory, MUSIC.indoors, ...Object.values(MUSIC.maps)];
    for (const name of names) expect(TRACKS).toHaveProperty([name]);
    // The two routes share a tune, and so do the two floors of the cave; every other place has its own.
    const tunes = [...new Set(names)];
    expect(tunes.length).toBe(names.length - 2);
    expect(MUSIC.maps.deep).toBe(MUSIC.maps.cave);
    expect(MUSIC.maps.east).toBe(MUSIC.maps.west);
    expect(MUSIC.maps.town).toBeDefined();
    for (const place of ['town', 'east', 'west', 'hills', 'cave']) expect(MUSIC.maps[place], place).toBeDefined();
    expect(new Set(['town', 'hills', 'cave', 'east'].map((place) => MUSIC.maps[place])).size).toBe(4);
    const melodies = tunes.map((name) => TRACKS[name]!.voices[0]!.notes);
    expect(new Set(melodies).size).toBe(tunes.length);
    // The cave is dark and sparse: slow, and its melody rests for a good part of the time.
    const cave = TRACKS[MUSIC.maps.cave!]!;
    expect(cave.bpm).toBeLessThan(TRACKS[MUSIC.maps.town!]!.bpm);
    const melody = parseVoice(cave.voices[0]!.notes);
    const sounding = melody.notes.reduce((sum, note) => sum + note.steps, 0);
    expect(sounding / melody.steps).toBeLessThan(0.7);
    for (const name of [MUSIC.title, MUSIC.ending, MUSIC.wild, MUSIC.boss, MUSIC.indoors, MUSIC.maps.town!]) expect(TRACKS[name]!.loop).toBe(true);
    expect(TRACKS[MUSIC.victory]!.loop).toBe(false);
  });

  it('has a sound for every cue of the engine: an effect or a jingle', () => {
    for (const cue of CUES) {
      const jingle = JINGLES[cue];
      if (jingle) {
        expect(TRACKS[jingle]?.loop).toBe(false);
        continue;
      }
      const effect = EFFECTS[cue];
      expect(effect, cue).toBeDefined();
      expect(effect!.tones.length).toBeGreaterThan(0);
      for (const tone of effect!.tones) {
        expect(tone.duration).toBeGreaterThan(0);
        // Short, all of them; the boss's transition is the long one, and its sound lasts as long as it does.
        expect((tone.at ?? 0) + tone.duration).toBeLessThan(cue === 'showdown' ? 2 : 1);
        expect(tone.volume).toBeGreaterThan(0);
        expect(tone.volume).toBeLessThanOrEqual(0.5);
        expect(tone.from).toBeGreaterThan(0);
      }
    }
    // The two transitions sound different, and each sound fits inside its transition (60 ticks a second).
    const ends = (cue: Cue) => Math.max(...EFFECTS[cue]!.tones.map((tone) => (tone.at ?? 0) + tone.duration));
    expect(ends('encounter')).toBeLessThanOrEqual(WILD_TICKS / 60);
    expect(ends('showdown')).toBeLessThanOrEqual(BOSS_TICKS / 60);
    expect(ends('showdown')).toBeGreaterThan(ends('encounter') * 1.5);
    // The next boss of the last fight: a cut-down of the boss's sound that fits the short transition.
    expect(ends('round')).toBeLessThanOrEqual(QUICK_TICKS / 60);
    expect(ends('round')).toBeGreaterThan(0.3);
    expect(ends('round')).toBeLessThan(ends('showdown') / 2);
    // The hop over a ledge: a small sound that is over when the hop is.
    expect(ends('jump')).toBeLessThanOrEqual(JUMP_TICKS / 60 + 0.05);
    for (const tone of EFFECTS.jump!.tones) expect(tone.volume).toBeLessThanOrEqual(0.25);
    expect(JINGLES.badge).toBe('badge');
    expect(JINGLES.levelup).toBe('levelup');
    // The quiet ones stay quiet: the bump and the typewriter must not nag.
    expect(EFFECTS.blip!.tones[0]!.volume).toBeLessThanOrEqual(0.1);
    expect(EFFECTS.bump!.gap).toBeGreaterThanOrEqual(0.2);
  });
});

describe('how loud a track is over its length', () => {
  it('measures the mean power: a plucked note a third of a held one, a square fuller than a triangle, rests count', () => {
    const one = (wave: 'pulse' | 'triangle' | 'thin', notes: string, pluck?: true) => loudnessOf({ bpm: 60, loop: false, voices: [{ wave, volume: 0.6, notes, ...(pluck ? { pluck } : {}) }] });
    // A held triangle of 4 s: 0.6 x 0.577 for 92% of it, three quarters held and the last quarter dying away.
    expect(one('triangle', 'A4:16')).toBeCloseTo(Math.sqrt((0.6 * Math.sqrt(1 / 3)) ** 2 * 0.92 * (0.75 + 0.25 / 3)), 9);
    expect(one('triangle', 'A4:16', true) ** 2 / one('triangle', 'A4:16') ** 2).toBeCloseTo((1 / 3) / (0.75 + 0.25 / 3), 9);
    // A pulse is struck anyway, and a square is fuller than a triangle.
    expect(one('pulse', 'A4:16')).toBeGreaterThan(one('triangle', 'A4:16', true));
    expect(one('triangle', 'A4:8 -:8', true)).toBeCloseTo(one('triangle', 'A4:8', true) / Math.SQRT2, 9);
  });
});

/**
 * What every tune but the pieces of the player piano plays, as a fingerprint of its flattened notes (how many, the
 * length in ms, a checksum of times, lengths, pitches, volumes and voices), taken before the pieces got more voices
 * (round 31): a change to the format or to these tracks shows up here.
 */
const FINGERPRINTS: Record<string, string> = {
  title: '111:17143:528221150',
  town: '409:29091:570898032',
  route: '231:13333:873330769',
  hills: '79:20870:573999134',
  cave: '31:26667:581261095',
  indoors: '73:20000:834961975',
  cafe: '152:18462:857717817',
  battle: '292:13500:700500899',
  boss: '322:11163:229421693',
  victory: '25:3200:193551878',
  badge: '19:1714:439052934',
  final: '314:11429:474834890',
  rest: '15:2857:369098112',
  levelup: '19:1600:289819308',
  ending: '121:19200:382529446',
};

describe('the tunes that are not piano pieces', () => {
  it('play exactly what they played before the piano pieces got more voices', () => {
    const piano = new Set(PIECES.map((piece) => piece.track));
    const now: Record<string, string> = {};
    for (const [name, track] of Object.entries(TRACKS)) {
      if (piano.has(name)) continue;
      const { notes, length } = flatten(track);
      let sum = 0;
      for (const n of notes) sum = (sum * 31 + Math.round(n.time * 1000) * 7 + Math.round(n.duration * 1000) * 3 + Math.round(n.frequency * 100) + Math.round(n.volume * 1000) + n.voice) % 1000000007;
      now[name] = `${notes.length}:${Math.round(length * 1000)}:${sum}`;
    }
    expect(now).toEqual(FINGERPRINTS);
  });
});
