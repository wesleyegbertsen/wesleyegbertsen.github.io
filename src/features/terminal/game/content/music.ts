import type { Track, Wave } from '../audio/score.ts';
import type { Cue, World } from '../engine/types.ts';

/**
 * The music and the sound effects, as data. Nothing here is a recording: the browser makes every sound from
 * these numbers, like the Game Boy did, with two pulse voices, a triangle voice and noise. HOW TO EDIT
 *
 * - A track has a tempo (`bpm`) and voices. A voice is a line of notes: `C4` `F#3` `Bb5` are notes (A4 is 440 Hz),
 *   `-` is a rest, `:n` is how many sixteenth notes it lasts (`C5:4` is a quarter note), `|` is a bar line for the
 *   eye. On the noise voice `k` `s` `h` are kick, snare and hi-hat. A bar is 16 steps.
 * - Every voice of a track must be equally long, in whole bars: a test checks it and names the track.
 * - `loop: true` starts again at the end; `loopFrom` (in steps) skips an intro the second time round.
 * - `backing()` writes the bass, the chords and the drums from a chord per bar (`F+G` is two chords in one bar),
 *   so a new tune only needs a melody and its chords.
 * - MUSIC says which track plays where. A map that is not listed plays `indoors`.
 * - EFFECTS are the short sounds, one per cue of the engine (see `Cue` in engine/types.ts): each is a few tones
 *   with a start (`at`, seconds), a pitch (`from`, sliding to `to`), a length and a volume. For noise, `from` and
 *   `to` are how bright it is (1 is hiss, 0.1 is rumble). `gap` is the least time between two of the same.
 * - All melodies are original. Volumes are 0 to 1 and sit under the master volume in useGameSound.ts.
 */

// --- writing the backing from chords -------------------------------------------------------------------------------

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ROOTS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The note name of a pitch counted in semitones from C0. */
const name = (pitch: number) => `${NAMES[pitch % 12]}${Math.floor(pitch / 12)}`;

/** The three notes of a chord (`C`, `Am`, `Bb`, `F#m`), as semitones above C, the root first. */
function chord(symbol: string): [number, number, number] {
  const match = /^([A-G])([#b]?)(m?)$/.exec(symbol);
  if (!match) throw new Error(`Not a chord: '${symbol}'`);
  const root = (ROOTS[match[1]!]! + (match[2] === '#' ? 1 : match[2] === 'b' ? 11 : 0)) % 12;
  return [root, root + (match[3] ? 3 : 4), root + 7];
}

type Bass = 'walk' | 'pump' | 'hold';
type Chords = 'eighths' | 'quarters' | 'fast';

/** Half a bar (8 steps) of bass under a chord, around octave 2. */
function bassHalf([root, , fifth]: [number, number, number], style: Bass): string {
  const low = 24 + root;
  if (style === 'hold') return `${name(low)}:8`;
  if (style === 'walk') return `${name(low)}:4 ${name(24 + fifth)}:4`;
  return `${name(low)}:2 ${name(low)}:2 ${name(low + 12)}:2 ${name(low)}:2`;
}

/** Half a bar of broken chord, around octave 4. */
function chordHalf([root, third, fifth]: [number, number, number], style: Chords, second: boolean): string {
  const [a, b, c] = [48 + root, 48 + third, 48 + fifth];
  if (style === 'quarters') return second ? `${name(c)}:4 ${name(b)}:4` : `${name(a)}:4 ${name(b)}:4`;
  if (style === 'eighths') return `${name(a)}:2 ${name(b)}:2 ${name(c)}:2 ${name(b)}:2`;
  return `${name(a)} ${name(b)} ${name(c)} ${name(a + 12)} ${name(a)} ${name(b)} ${name(c)} ${name(a + 12)}`;
}

/** The chords of a tune, one per bar, as one chord per half bar: `F+G` is a bar with two. */
const halves = (chords: string) =>
  chords.split(/\s+/).flatMap((bar) => {
    const [first = '', second = first] = bar.split('+');
    return [chord(first), chord(second)];
  });

const bars = (count: number, bar: string) => Array.from({ length: count }, () => bar).join(' | ');

/** The bass, the broken chords and (when given) the drums that go with a melody. */
function backing(chords: string, style: { bass: Bass; chords: Chords; drums?: string }) {
  const list = halves(chords);
  return [
    { wave: 'thin' as Wave, volume: 0.22, notes: list.map((item, i) => chordHalf(item, style.chords, i % 2 === 1)).join(' ') },
    { wave: 'triangle' as Wave, volume: 0.6, notes: list.map((item) => bassHalf(item, style.bass)).join(' ') },
    ...(style.drums ? [{ wave: 'noise' as Wave, volume: 0.22, notes: bars(list.length / 2, style.drums) }] : []),
  ];
}

const lead = (notes: string[], volume = 0.42) => ({ wave: 'pulse' as Wave, volume, notes: notes.join(' | ') });

const STEADY = 'h:2 h:2 s:2 h:2 h:2 h:2 s:2 h:2';
const DRIVING = 'k:2 h:2 s:2 h:2 k:2 k:2 s:2 h h';

// --- the tracks ----------------------------------------------------------------------------------------------------

export const TRACKS: Record<string, Track> = {
  /** The title screen: broad and a little solemn. */
  title: {
    bpm: 112,
    loop: true,
    voices: [
      lead([
        'C5:4 E5:4 G5:6 E5:2',
        'D5:4 G5:4 B5:6 G5:2',
        'C6:4 B5:2 A5:2 E5:8',
        'F5:4 A5:4 C6:6 A5:2',
        'G5:4 E5:4 C6:6 G5:2',
        'B5:4 G5:4 D6:6 B5:2',
        'C6:2 A5:2 F5:4 D6:2 B5:2 G5:4',
        'C6:12 -:4',
      ]),
      ...backing('C G Am F C G F+G C', { bass: 'hold', chords: 'eighths' }),
    ],
  },

  /** Career Town: a cheerful walk, an A part and a B part. */
  town: {
    bpm: 132,
    loop: true,
    voices: [
      lead([
        'E5:2 G5:2 C6:4 B5:2 A5:2 G5:4',
        'A5:2 C6:2 E6:4 D6:2 C6:2 A5:4',
        'F5:2 A5:2 C6:4 A5:2 F5:2 A5:4',
        'G5:2 B5:2 D6:4 B5:2 G5:2 D5:4',
        'E5:2 G5:2 C6:4 B5:2 A5:2 G5:4',
        'A5:2 C6:2 E6:4 D6:2 C6:2 A5:4',
        'F5:2 A5:2 C6:2 A5:2 G5:2 B5:2 D6:2 B5:2',
        'C6:6 G5:2 E5:2 G5:2 C6:4',
        'A5:4 F5:2 A5:2 C6:4 A5:4',
        'B5:4 G5:2 B5:2 D6:4 B5:4',
        'G5:4 E5:2 G5:2 B5:4 G5:4',
        'A5:2 B5:2 C6:4 E6:4 C6:4',
        'A5:4 F5:2 A5:2 C6:4 F6:4',
        'D6:4 B5:2 G5:2 B5:4 D6:4',
        'E6:2 D6:2 C6:2 G5:2 E5:2 G5:2 C6:4',
        'D6:6 B5:2 G5:4 -:4',
      ]),
      ...backing('C Am F G C Am F+G C F G Em Am F G C G', { bass: 'walk', chords: 'eighths', drums: STEADY }),
    ],
  },

  /** Inside the buildings: slower, softer, no drums. */
  indoors: {
    bpm: 96,
    loop: true,
    voices: [
      lead(
        [
          'A4:4 C5:4 F5:8',
          'F5:4 D5:4 A4:8',
          'Bb4:4 D5:4 F5:6 D5:2',
          'E5:4 C5:4 G4:8',
          'A4:4 C5:4 F5:4 A5:4',
          'F5:4 D5:4 F5:8',
          'G5:4 D5:4 E5:4 C5:4',
          'F5:12 -:4',
        ],
        0.34,
      ),
      ...backing('F Dm Bb C F Dm Gm+C F', { bass: 'hold', chords: 'quarters' }),
    ],
  },

  /** A wild BUG: quick and minor. The first bar is a run-up that is played once. */
  battle: {
    bpm: 160,
    loop: true,
    loopFrom: 16,
    voices: [
      lead([
        'E5 F5 G5 A5 B5 C6 D6 E6 E6:2 -:2 E6:2 -:2',
        'A4:2 C5:2 E5:2 A5:2 E5:2 C5:2 E5:2 C5:2',
        'A4:2 C5:2 E5:2 A5:2 G5:2 E5:2 C5:2 E5:2',
        'F4:2 A4:2 C5:2 F5:2 C5:2 A4:2 C5:2 A4:2',
        'G4:2 B4:2 D5:2 G5:2 D5:2 B4:2 D5:2 B4:2',
        'A5:4 E5:2 A5:2 C6:4 B5:2 A5:2',
        'G5:2 A5:2 E5:4 C5:2 E5:2 A4:4',
        'F5:4 C5:2 F5:2 A5:4 G5:2 F5:2',
        'E5:2 G#5:2 B5:2 E6:2 B5:2 G#5:2 E5:4',
      ]),
      ...backing('E Am Am F G Am Am F E', { bass: 'pump', chords: 'eighths', drums: DRIVING }),
    ],
  },

  /** A boss: faster and darker, in another key than the wild battle. */
  boss: {
    bpm: 172,
    loop: true,
    voices: [
      lead([
        'E5:2 E5:2 B4:2 E5:2 G5:2 E5:2 B4:2 G5:2',
        'G5:2 G5:2 B4:2 G5:2 B5:2 G5:2 E5:2 G5:2',
        'E5:2 E5:2 C5:2 E5:2 G5:2 E5:2 C5:2 G5:2',
        'F#5:2 F#5:2 D5:2 F#5:2 A5:2 F#5:2 D5:2 A5:2',
        'B5:4 G5:2 E5:2 B5:4 A5:2 G5:2',
        'A5:4 F#5:2 E5:2 G5:4 F#5:2 E5:2',
        'G5:2 E5:2 C5:2 E5:2 G5:2 C6:2 B5:2 G5:2',
        'F#5:2 D#5:2 B4:2 D#5:2 F#5:2 B5:4 -:2',
      ]),
      ...backing('Em Em C D Em Em C B', { bass: 'pump', chords: 'fast', drums: DRIVING }),
    ],
  },

  /** A battle is won: a short fanfare, played once. */
  victory: {
    bpm: 150,
    loop: false,
    voices: [
      lead(['C5:2 E5:2 G5:2 C6:2 -:2 A5:2 B5:2 -:2', 'C6:12 -:4'], 0.45),
      { wave: 'thin', volume: 0.25, notes: 'E4:2 G4:2 C5:2 E5:2 -:2 F5:2 G5:2 -:2 | E5:12 -:4' },
      { wave: 'triangle', volume: 0.6, notes: 'C3:8 F3:4 G3:4 | C3:12 -:4' },
      { wave: 'noise', volume: 0.2, notes: 's:2 s:2 s:2 s:2 -:2 s:2 s:2 -:2 | k:4 -:12' },
    ],
  },

  /** A badge is earned: one bright bar over the music, which steps back for it. */
  badge: {
    bpm: 140,
    loop: false,
    voices: [
      lead(['E5 G5 C6 E6 G6:2 E6 G6 C7:6 -:2'], 0.45),
      { wave: 'thin', volume: 0.25, notes: 'C5 E5 G5 C6 E6:2 C6 E6 G6:6 -:2' },
      { wave: 'triangle', volume: 0.6, notes: 'C3:6 G3:2 C4:6 -:2' },
    ],
  },

  /** The ending: warm and unhurried. */
  ending: {
    bpm: 100,
    loop: true,
    voices: [
      lead([
        'E5:4 G5:4 C6:8',
        'B5:4 G5:4 E5:8',
        'A5:4 C6:4 F6:6 E6:2',
        'D6:4 B5:4 G5:8',
        'C6:4 A5:4 E5:4 A5:4',
        'A5:4 F5:4 C6:8',
        'B5:4 D6:4 G5:4 B5:4',
        'C6:12 -:4',
      ]),
      ...backing('C Em F G Am F G C', { bass: 'walk', chords: 'eighths' }),
    ],
  },
};

/** Which track plays where. */
export const MUSIC: NonNullable<World['music']> = {
  title: 'title',
  ending: 'ending',
  wild: 'battle',
  boss: 'boss',
  victory: 'victory',
  indoors: 'indoors',
  maps: { town: 'town' },
};

// --- the sound effects ---------------------------------------------------------------------------------------------

export type Tone = { wave: Wave; at?: number; from: number; to?: number; duration: number; volume: number };
export type Effect = { tones: Tone[]; gap?: number };

const beep = (from: number, duration: number, volume = 0.3, at = 0, to?: number, wave: Wave = 'pulse'): Tone => ({ wave, at, from, to, duration, volume });
const hiss = (from: number, duration: number, volume = 0.3, at = 0, to?: number): Tone => ({ wave: 'noise', at, from, to, duration, volume });

/** One effect per cue. A cue that is in JINGLES plays a track instead. */
export const EFFECTS: Partial<Record<Cue, Effect>> = {
  cursor: { tones: [beep(880, 0.03, 0.2)], gap: 0.03 },
  confirm: { tones: [beep(660, 0.04, 0.22), beep(990, 0.06, 0.22, 0.04)] },
  cancel: { tones: [beep(440, 0.04, 0.22), beep(330, 0.07, 0.22, 0.04)] },
  // The typewriter: quiet and thin, so a long text does not tire.
  blip: { tones: [beep(1150, 0.018, 0.09, 0, undefined, 'thin')], gap: 0.04 },
  door: { tones: [hiss(0.25, 0.12, 0.3, 0, 0.12), beep(180, 0.14, 0.3, 0.02, 90, 'triangle')] },
  item: { tones: [beep(1047, 0.06), beep(1319, 0.06, 0.3, 0.06), beep(1568, 0.06, 0.3, 0.12), beep(2093, 0.16, 0.3, 0.18)] },
  star: { tones: [beep(1976, 0.05, 0.28), beep(2637, 0.22, 0.28, 0.05)] },
  bump: { tones: [beep(95, 0.07, 0.3, 0, 60, 'triangle')], gap: 0.28 },
  heal: { tones: [beep(523, 0.08, 0.25, 0, 784), beep(784, 0.08, 0.25, 0.08, 1047), beep(1047, 0.2, 0.25, 0.16, 1568)] },
  hit: { tones: [hiss(0.8, 0.09, 0.4, 0, 0.3), beep(260, 0.12, 0.3, 0, 90)] },
  hurt: { tones: [hiss(0.4, 0.16, 0.45, 0, 0.1), beep(160, 0.18, 0.3, 0, 55, 'triangle')] },
  miss: { tones: [beep(900, 0.14, 0.14, 0, 300, 'thin')] },
  faint: { tones: [beep(620, 0.5, 0.3, 0, 70), hiss(0.2, 0.3, 0.2, 0.3, 0.05)] },
  low: { tones: [beep(1000, 0.07, 0.2, 0.25), beep(1000, 0.07, 0.2, 0.42)] },
  run: { tones: [beep(400, 0.05, 0.25), beep(600, 0.05, 0.25, 0.05), beep(800, 0.05, 0.25, 0.1), beep(1200, 0.08, 0.25, 0.15)] },
  encounter: {
    tones: [hiss(0.1, 0.45, 0.3, 0, 1), beep(300, 0.15, 0.25, 0, 1200), beep(300, 0.15, 0.25, 0.15, 1200), beep(300, 0.2, 0.25, 0.3, 1600)],
  },
};

/** Cues that play a track of TRACKS once, over the music, instead of an effect. */
export const JINGLES: Partial<Record<Cue, string>> = { badge: 'badge' };
