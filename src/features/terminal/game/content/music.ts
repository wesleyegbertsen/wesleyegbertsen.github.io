import type { Effect, Tone } from '../audio/player.ts';
import { loudnessOf, peakOf as trackPeak, type Track, type Wave } from '../audio/score.ts';
import { PIECES } from './pieces.ts';
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
 * - MUSIC says which track plays where: the town, the routes, Hobby Hills and the cave have their own tune. A map
 *   that is not listed plays `indoors`.
 * - EFFECTS are the short sounds, one per cue of the engine (see `Cue` in engine/types.ts): each is a few tones
 *   with a start (`at`, seconds), a pitch (`from`, sliding to `to`), a length and a volume. For noise, `from` and
 *   `to` are how bright it is (1 is hiss, 0.1 is rumble). `gap` is the least time between two of the same.
 * - A battle starts with a transition on the screen (engine/transition.ts). The music is silent while it plays;
 *   its sound is the effect `encounter` (a wild enemy), `showdown` (a boss) or `round` (the next boss of the last
 *   fight, a short one), and the battle tune starts after.
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

  /** The routes out of town: a march with a spring in its step. */
  route: {
    bpm: 144,
    loop: true,
    voices: [
      lead([
        'G4:2 B4:2 D5:4 G5:4 D5:4',
        'E5:2 G5:2 B5:4 A5:2 G5:2 E5:4',
        'C5:2 E5:2 G5:4 C6:4 G5:4',
        'D5:2 F#5:2 A5:4 D6:6 -:2',
        'G5:4 B5:2 D6:2 B5:4 G5:4',
        'E5:4 G5:2 B5:2 G5:4 E5:4',
        'C6:2 B5:2 A5:2 G5:2 F#5:2 A5:2 D6:4',
        'G5:8 D5:4 -:4',
      ]),
      ...backing('G Em C D G Em C+D G', { bass: 'pump', chords: 'eighths', drums: STEADY }),
    ],
  },

  /** Hobby Hills: unhurried, on five notes, like a tune from a tea house. */
  hills: {
    bpm: 92,
    loop: true,
    voices: [
      lead(
        [
          'E5:4 F5:2 E5:2 C5:4 B4:4',
          'A4:6 B4:2 C5:8',
          'E5:4 F5:2 E5:2 A5:4 E5:4',
          'F5:6 E5:2 C5:8',
          'B4:4 C5:2 E5:2 F5:4 E5:4',
          'C5:6 B4:2 A4:8',
          'E5:2 F5:2 A5:4 F5:2 E5:2 C5:4',
          'A4:12 -:4',
        ],
        0.36,
      ),
      ...backing('Am F Am F Em Am F+Em Am', { bass: 'hold', chords: 'quarters' }),
    ],
  },

  /** The cave: dark and sparse. A low drone, a few notes that do not resolve, a drip now and then. */
  cave: {
    bpm: 72,
    loop: true,
    voices: [
      lead(
        [
          'E4:4 -:4 G4:2 F#4:2 -:4',
          'B3:8 -:8',
          'E4:4 -:4 Bb4:2 A4:2 -:4',
          'F#4:8 -:8',
          '-:8 E5:2 B4:2 G4:4',
          'F4:6 E4:2 -:8',
          'E4:2 -:2 E4:2 -:2 G4:4 F#4:4',
          'E4:12 -:4',
        ],
        0.26,
      ),
      { wave: 'triangle', volume: 0.55, notes: 'E2:16 | E2:16 | C2:16 | B1:16 | E2:16 | F2:16 | C2:8 B1:8 | E2:16' },
      { wave: 'noise', volume: 0.12, notes: 'h -:15 | -:16 | -:8 h -:7 | -:16 | h -:15 | -:16 | -:12 h -:3 | -:16' },
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

  /**
   * The player piano in the cafe: the first movement of Beethoven's Moonlight Sonata (Piano Sonata No. 14, Op. 27
   * No. 2, Adagio sostenuto, C sharp minor; the music is in the public domain), the whole movement, bars 1 to 69. The
   * notes were checked bar by bar against a Creative Commons BY-SA 2.5 engraving of the sonata.
   *
   * HOW TO EDIT: a step of this score is a sixteenth of its `bpm` beat, so `bpm: 168` makes a step a twelfth of a
   * real quarter note at 56 a minute: a triplet eighth is 4 steps, the melody's dotted eighth and sixteenth 9 and 3,
   * a quarter 12, a half 24, a bar 48; the last bar, the chord under the fermata, is held 64. A bar line `|` between
   * bars (content/piano.test.ts reads them). Pitches carry their own accidentals (B#1, G3 natural, F##4 a double
   * sharp), not the key signature. A tie is one longer note in the bar where it starts (a bar can then be empty in
   * one voice, as the bass of bar 36). The triplets are one voice (whichever hand or staff plays them), the bass
   * another (the lowest note of the left hand), the melody the third (the stemmed tune notes); a fourth has the upper
   * note of the left hand, a fifth the inner notes of chords (one voice is one line). Where a held note is also the
   * first note of a triplet group, the held voice plays it and the triplets rest. `pluck` makes every note die away
   * from its start, like a piano. It plays once (an entry in content/pieces.ts).
   */
  moonlight: {
    bpm: 168,
    loop: false,
    voices: [
      { wave: 'pulse', volume: 0.2, pluck: true, notes: '-:48 | -:48 | -:48 | -:48 | -:36 G#4:9 G#4:3 | G#4:36 G#4:9 G#4:3 | G#4:24 A4:24 | G#4:24 F#4:12 B4:12 | E4:12 -:36 | -:36 G4:9 G4:3 | G4:36 G4:9 G4:3 | G4:36 F#4:12 | F#4:24 G4:12 E4:12 | F#4:24 F#4:24 | -:36 B4:12 | C5:36 A#4:12 | B4:36 B4:12 | C5:36 A#4:12 | B4:24 B4:24 | B4:24 A4:24 | G4:24 F#4:24 | C#4:24 C#4:12 C#4:12 | -:36 C#5:9 C#5:3 | C#5:36 C#5:9 C#5:3 | C#5:24 B#4:12 C#5:12 | D#5:36 D#5:12 | E5:24 D#5:12 C#5:12 | -:12 F#4:12 A4:12 F#4:12 | -:12 G#3:12 A3:12 F#3:12 | -:12 C#5:12 E5:12 C#5:12 | -:12 C#4:12 E4:12 C#4:12 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:36 G#4:9 G#4:3 | G#4:36 G#4:9 G#4:3 | G#4:24 A4:24 | G#4:24 F#4:12 B4:12 | E4:12 -:24 B4:9 B4:3 | B4:36 B4:9 B4:3 | B4:24 B#4:12 C#5:12 | D#5:24 E5:24 | D5:24 B#4:24 | C#5:36 C#5:12 | D5:36 B#4:12 | C#5:36 C#5:12 | D5:36 B#4:12 | C#5:24 C#5:24 | B4:36 B4:12 | A4:12 A4:12 G#4:12 G#4:12 | F#4:24 G#4:12 A4:12 | G#4:24 G#4:24 | C#4:12 -:36 | -:48 | -:48 | -:36 B#3:12 | -:48 | -:36 B#3:12 | -:48 | -:48 | -:24 C#4:24 | C#4:64' },
      { wave: 'thin', volume: 0.18, pluck: true, notes: 'G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4 | G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4 | A3:4 C#4:4 E4:4 A3:4 C#4:4 E4:4 A3:4 D4:4 F#4:4 A3:4 D4:4 F#4:4 | G#3:4 B#3:4 F#4:4 G#3:4 C#4:4 E4:4 G#3:4 C#4:4 D#4:4 F#3:4 B#3:4 D#4:4 | E3:4 G#3:4 C#4:4 G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4 | G#3:4 D#4:4 F#4:4 G#3:4 D#4:4 F#4:4 G#3:4 D#4:4 F#4:4 G#3:4 D#4:4 F#4:4 | G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4 A3:4 C#4:4 F#4:4 A3:4 C#4:4 F#4:4 | G#3:4 B3:4 E4:4 G#3:4 B3:4 E4:4 A3:4 B3:4 D#4:4 A3:4 B3:4 D#4:4 | G#3:4 B3:4 E4:4 G#3:4 B3:4 E4:4 G#3:4 B3:4 E4:4 G#3:4 B3:4 E4:4 | G3:4 B3:4 E4:4 G3:4 B3:4 E4:4 G3:4 B3:4 E4:4 G3:4 B3:4 E4:4 | G3:4 B3:4 F4:4 G3:4 B3:4 F4:4 G3:4 B3:4 F4:4 G3:4 B3:4 F4:4 | G3:4 C4:4 E4:4 G3:4 B3:4 E4:4 G3:4 C#4:4 E4:4 F#3:4 C#4:4 E4:4 | F#3:4 B3:4 D4:4 F#3:4 B3:4 D4:4 G3:4 B3:4 C#4:4 E3:4 B3:4 C#4:4 | F#3:4 B3:4 D4:4 F#3:4 B3:4 D4:4 F#3:4 A#3:4 C#4:4 F#3:4 A#3:4 C#4:4 | B3:4 D4:4 F#4:4 B3:4 D4:4 F#4:4 B3:4 D#4:4 F#4:4 B3:4 D#4:4 F#4:4 | B3:4 E4:4 G4:4 B3:4 E4:4 G4:4 B3:4 E4:4 G4:4 B3:4 E4:4 G4:4 | B3:4 D#4:4 F#4:4 B3:4 D#4:4 F#4:4 B3:4 D#4:4 F#4:4 B3:4 D#4:4 F#4:4 | B3:4 E4:4 G4:4 B3:4 E4:4 G4:4 B3:4 E4:4 G4:4 B3:4 E4:4 G4:4 | B3:4 D#4:4 F#4:4 B3:4 D#4:4 F#4:4 B3:4 D4:4 E#4:4 B3:4 D4:4 E#4:4 | B3:4 C#4:4 G#4:4 B3:4 C#4:4 G#4:4 A3:4 C#4:4 F#4:4 A3:4 C#4:4 F#4:4 | G3:4 B3:4 D4:4 G3:4 B3:4 D4:4 F#3:4 A3:4 D#4:4 F#3:4 A3:4 D#4:4 | C#3:4 F#3:4 A3:4 C#3:4 F#3:4 A3:4 C#3:4 F#3:4 G#3:4 C#3:4 E#3:4 G#3:4 | F#3:4 A3:4 C#4:4 A3:4 C#4:4 F#4:4 C#4:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4 | C#4:4 G#4:4 B4:4 C#4:4 G#4:4 B4:4 C#4:4 G#4:4 B4:4 C#4:4 G#4:4 B4:4 | C#4:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4 B#3:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4 | D#4:4 F#4:4 G#4:4 D#4:4 F#4:4 G#4:4 D#4:4 F#4:4 G#4:4 D#4:4 F#4:4 G#4:4 | E4:4 G#4:4 C#5:4 E4:4 G#4:4 C#5:4 D#4:4 F#4:4 A4:4 C#4:4 E4:4 A#4:4 | B#4:4 B#3:4 D#4:4 -:4 B#3:4 D#4:4 -:4 B#3:4 D#4:4 -:4 B#3:4 D#4:4 | -:4 B#3:4 D#4:4 -:4 B#3:4 D#4:4 -:4 B#3:4 D#4:4 -:4 B#3:4 D#4:4 | E3:4 E4:4 G#4:4 -:4 E4:4 G#4:4 -:4 E4:4 G#4:4 -:4 E4:4 G#4:4 | -:4 E3:4 G#3:4 -:4 E3:4 G#3:4 -:4 E3:4 G#3:4 -:4 E3:4 G#3:4 | D#3:4 A3:4 F#3:4 B#3:4 A3:4 D#4:4 B#3:4 F#4:4 D#4:4 A4:4 F#4:4 B#4:4 | E3:4 C#4:4 G#3:4 E4:4 C#4:4 G#4:4 E4:4 C#5:4 G#4:4 E5:4 C#5:4 G#4:4 | C#4:4 F##4:4 E4:4 A#4:4 F##4:4 C#5:4 A#4:4 E5:4 C#5:4 F##5:4 E5:4 A#5:4 | F#4:4 B#4:4 A4:4 D#5:4 B#4:4 F#5:4 D#5:4 A5:4 F#5:4 B#5:4 A5:4 D#6:4 | B#5:4 F#5:4 A5:4 D#5:4 F#5:4 B#4:4 D#5:4 A4:4 B#4:4 F#4:4 A4:4 D#4:4 | F#4:4 B#3:4 D#4:4 A3:4 B#3:4 F#3:4 A3:4 -:4 F#3:4 -:4 F#3:4 A3:4 | -:4 F#3:4 G#3:4 A3:4 G#3:4 F#3:4 -:4 F#3:4 A3:4 -:4 F#3:4 A3:4 | -:4 F#3:4 G#3:4 A3:4 G#3:4 F#3:4 -:4 F#3:4 A3:4 -:4 F#3:4 A3:4 | -:4 F#3:4 G#3:4 A3:4 G#3:4 F#3:4 C#3:4 E3:4 C#4:4 C#3:4 E3:4 C#4:4 | D#3:4 A3:4 C#4:4 D#3:4 A3:4 C#4:4 D#3:4 G#3:4 B#3:4 D#3:4 F#3:4 B#3:4 | E3:4 G#3:4 C#4:4 G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4 | G#3:4 D#4:4 F#4:4 G#3:4 D#4:4 F#4:4 G#3:4 D#4:4 F#4:4 G#3:4 D#4:4 F#4:4 | G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4 A3:4 C#4:4 F#4:4 A3:4 C#4:4 F#4:4 | G#3:4 B3:4 E4:4 G#3:4 B3:4 E4:4 A3:4 B3:4 D#4:4 A3:4 B3:4 D#4:4 | G#3:4 B3:4 E4:4 B3:4 E4:4 G#4:4 B3:4 E4:4 G#4:4 B3:4 E4:4 G#4:4 | B3:4 F#4:4 A4:4 B3:4 F#4:4 A4:4 B3:4 F#4:4 A4:4 B3:4 F#4:4 A4:4 | B3:4 E4:4 G#4:4 B3:4 E4:4 G#4:4 B#3:4 F#4:4 G#4:4 C#4:4 E4:4 G#4:4 | D#4:4 F#4:4 G#4:4 D#4:4 F#4:4 G#4:4 E4:4 G#4:4 C#5:4 E4:4 G#4:4 C#5:4 | D4:4 F#4:4 A4:4 D4:4 F#4:4 A4:4 B#3:4 F#4:4 G#4:4 B#3:4 F#4:4 G#4:4 | C#4:4 E4:4 G#4:4 C#4:4 E4:4 G#4:4 C#4:4 E#4:4 G#4:4 C#4:4 E#4:4 G#4:4 | C#4:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4 | C#4:4 E#4:4 G#4:4 C#4:4 E#4:4 G#4:4 C#4:4 E#4:4 G#4:4 C#4:4 E#4:4 G#4:4 | C#4:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4 | C#4:4 E#4:4 G#4:4 C#4:4 E#4:4 G#4:4 C#4:4 F#4:4 A4:4 C#4:4 F#4:4 A4:4 | B3:4 F#4:4 A4:4 B3:4 F#4:4 A4:4 B3:4 F#4:4 A4:4 B3:4 E4:4 G#4:4 | A3:4 E4:4 G#4:4 A3:4 D#4:4 F#4:4 G#3:4 D#4:4 F#4:4 G#3:4 C#4:4 E4:4 | F#3:4 C#4:4 D#4:4 F#3:4 C#4:4 D#4:4 G#3:4 C#4:4 D#4:4 A3:4 C#4:4 D#4:4 | G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4 F#3:4 B#3:4 D#4:4 F#3:4 B#3:4 D#4:4 | E3:4 G#3:4 C#4:4 G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4 G#3:4 C#4:4 E4:4 | G#3:4 D#4:4 F#4:4 G#3:4 D#4:4 F#4:4 G#3:4 D#4:4 F#4:4 G#3:4 D#4:4 F#4:4 | G#3:4 E4:4 C#4:4 G#4:4 E4:4 C#5:4 G#4:4 E5:4 C#5:4 G#5:4 E5:4 C#5:4 | B#4:4 D#5:4 A4:4 B#4:4 F#4:4 A4:4 D#4:4 F#4:4 A3:8 G#3:4 F#3:4 | C#4:4 E4:4 C#4:4 G#4:4 E4:4 C#5:4 G#4:4 E5:4 C#5:4 G#5:4 E5:4 C#5:4 | B#4:4 D#5:4 A4:4 B#4:4 F#4:4 A4:4 D#4:4 F#4:4 A3:8 G#3:4 F#3:4 | C#4:4 G#3:4 C#4:4 E4:4 C#4:4 G#3:4 -:4 E3:4 G#3:4 C#4:4 G#3:4 E3:4 | -:4 C#3:4 E3:4 G#3:4 E3:4 C#3:4 -:24 | -:24 G#3:24 | G#3:64' },
      { wave: 'triangle', volume: 0.18, pluck: true, notes: 'C#2:48 | B1:48 | A1:24 F#1:24 | G#1:24 G#1:24 | C#2:48 | B#1:48 | C#2:24 F#1:24 | B1:24 B1:24 | E2:48 | E2:48 | D2:48 | C2:12 B1:12 A#1:24 | B1:24 E2:12 G2:12 | F#2:24 F#1:24 | B1:60 | E2:12 G2:12 E2:12 | B1:60 | E2:12 G2:12 E2:12 | B1:24 G#1:24 | E#1:24 F#1:24 | B1:24 B#1:24 | C#2:24 C#2:24 | F#1:48 | E#2:48 | F#2:24 D#2:12 C#2:12 | B#1:36 B#1:12 | C#2:24 F#1:12 F##1:12 | G#1:48 | G#1:48 | G#1:48 | G#1:48 | G#1:48 | G#1:48 | G#1:48 | G#1:144 |  |  | G#1:48 | G#1:48 | G#1:24 A1:24 | F#1:24 G#1:24 | C#2:48 | B#1:48 | C#2:24 F#1:24 | B1:24 B1:24 | E2:48 | D#2:48 | E2:24 D#2:12 C#2:12 | B#1:24 C#2:24 | F#1:24 G#1:24 | C#2:60 | F#2:12 A2:12 F#2:12 | C#2:60 | F#2:12 A2:12 F#2:12 | C#2:24 F#1:24 | D#2:36 E2:12 | C#2:12 D#2:12 B#1:12 C#2:12 | A1:24 G#1:12 F#1:12 | G#1:24 G#1:24 | C#2:48 | B#1:48 | C#2:48 | G#1:48 | C#2:48 | G#1:48 | C#2:96 |  | C#2:24 C#2:24 | C#2:64' },

      // The upper note of the left hand (its octaves; from bar 60 its G sharp line), and the inner notes of chords.
      { wave: 'triangle', volume: 0.14, pluck: true, notes: 'C#3:48 | B2:48 | A2:24 F#2:24 | G#2:24 G#2:24 | C#3:48 | B#2:48 | C#3:24 F#2:24 | B2:24 B2:24 | E3:48 | E3:48 | D3:48 | C3:12 B2:12 A#2:24 | B2:24 -:24 | -:24 F#2:24 | B2:60 | E3:12 G3:12 E3:12 | B2:60 | E3:12 G3:12 E3:12 | B2:24 G#2:24 | E#2:24 F#2:24 | B2:24 B#2:24 | -:48 | F#2:48 | E#3:48 | F#3:24 D#3:12 C#3:12 | B#2:36 B#2:12 | C#3:24 F#2:12 F##2:12 | G#2:48 | G#2:48 | G#2:48 | G#2:48 | G#2:48 | G#2:48 | G#2:48 | G#2:144 |  |  | G#2:48 | G#2:48 | G#2:24 A2:24 | F#2:24 G#2:24 | C#3:48 | B#2:48 | C#3:24 F#2:24 | B2:24 B2:24 | E3:48 | D#3:48 | E3:24 D#3:12 C#3:12 | B#2:24 C#3:24 | F#2:24 G#2:24 | C#3:60 | F#3:12 A3:12 F#3:12 | C#3:60 | F#3:12 A3:12 F#3:12 | C#3:24 F#2:24 | D#3:36 E3:12 | C#3:12 D#3:12 B#2:12 C#3:12 | A2:24 G#2:12 F#2:12 | G#2:24 G#2:24 | G#2:36 G#2:9 G#2:3 | G#2:36 G#2:9 G#2:3 | G#2:36 G#2:9 G#2:3 | G#2:36 G#2:9 G#2:3 | G#2:36 G#2:9 G#2:3 | G#2:36 G#2:9 G#2:3 | G#2:24 C#3:24 | G#2:24 G#2:4 C#3:4 G#2:4 E2:4 G#2:4 E2:4 | -:24 C#3:24 | C#3:64' },
      { wave: 'thin', volume: 0.12, pluck: true, notes: '-:48 | -:48 | -:48 | -:48 | G#2:48 | G#2:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | C#2:48 | C#3:48 | -:48 | G#2:36 G#2:12 | A2:24 -:24 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:28 D#3:8 C#3:12 | B#2:24 D#3:12 C#3:12 | B#2:24 D3:12 C#3:12 | B#2:24 -:24 | -:48 | G#2:48 | G#2:48 | -:48 | -:48 | -:48 | -:48 | -:48 | G#2:24 G#2:24 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | -:48 | E3:4 -:44 | -:48 | E3:4 -:44 | -:48 | -:24 E3:24 | E3:64' },
    ],
  },
  /**
   * Scarborough Fair, a traditional English song, in the version from the soundtrack of the anime SukaSuka by Kato
   * Tatsuya; converted here from a MIDI file linked with the YouTube video j6sZX-u9Nbk; reduced to five chiptune
   * voices and quantized.
   *
   * HOW IT WAS CONVERTED (the MIDI is not in the repository; the rules of always-in-my-heart below, but for the
   * tempo): the MIDI changes tempo six times (140, 120, 127, 130, 110 and 94 a minute) and meter (3/4 and 4/4); the
   * format takes one bpm, so every note's time is worked out in seconds through that tempo map and rounded to a fixed
   * grid of 75 ms, `bpm: 200` (37 ms at most). A bar line `|` is every 16 steps (1.2 s), a line of the data, not a
   * bar of the music. The MIDI's empty first bar is left out; the end is padded to the next line. Track 0 is the right
   * hand, tracks 1 and 2 the left; the 3 notes under 40 Hz (C1, D1) are left out; five voices one note at a time as
   * for the other MIDI pieces; 71 of 1120 notes found no free voice (thick chords). No velocities or pedal:
   * `levelled` sets the loudness (content/scarborough.test.ts checks the result).
   */
  'scarborough-fair': {
    bpm: 200,
    loop: false,
    voices: [
      { wave: 'pulse', volume: 0.2, pluck: true, notes: '-:16 | -:1 F5:2 G5:2 C6:2 F6:2 G6:2 A6:1 -:1 C7:19 |  | -:1 D6:3 D#6:9 -:1 A#5:13 | C6:45 |  |  | -:8 | C5:21 | -:1 D5:3 D#5:6 -:1 | D5:3 D5:1 D#5:1 D5:1 C5:3 A#4:3 C5:24 |  | -:1 C5:12 | -:1 C5:6 G5:12 | -:1 G5:6 D5:9 | -:1 D#5:3 D5:6 C5:18 |  | -:16 | -:10 G5:6 | -:1 A#5:6 C6:12 | A#5:6 -:1 G5:6 | A5:6 F5:6 -:1 G5:18 | -:1 | -:16 | -:15 C6:6 | C6:12 | -:1 C6:6 A#5:12 | -:1 G5:6 G5:6 | F5:6 -:1 D#5:6 C5:18 |  | -:1 C5:9 F5:1 A5:1 C6:8 | C5:12 | G5:6 -:1 F5:12 | D5:6 -:1 D5:6 | C5:6 A#4:6 -:1 C5:17 | -:2 | -:16 | -:16 | -:16 | -:8 C6:6 C6:6 | -:1 C6:6 G5:6 | G5:6 -:1 G5:6 D5:9 | D#5:3 -:1 D5:6 | D#5:12 G5:3 | -:1 A5:3 A#5:3 A5:3 G5:9 | G5:3 -:1 F5:3 G5:3 C5:6 | G5:6 -:1 A#5:5 -:1 | C6:12 A#5:6 | -:1 G5:6 A5:6 F5:6 | -:1 G5:6 D#6:6 | D6:6 -:1 C6:5 -:1 A#5:6 | A5:6 G5:6 | -:1 D#5:6 D5:6 A#4:12 | -:1 C6:6 | C6:12 -:1 C6:6 | A#5:12 | -:1 G5:6 G5:6 F5:6 | -:1 D#5:6 D5:3 A#4:12 | -:4 A#6:18 | -:1 | C5:12 G5:6 | -:1 F5:12 D5:6 | D5:6 -:1 C5:6 | A#4:6 C5:18 | -:1 G#5:6 | A5:6 -:1 B5:5 -:1 C#6:6 | F#4:6 C#6:6 | C#6:6 A4:3 B5:3 -:1 A5:5 | -:1 G#5:6 G#4:3 A5:3 G#5:6 | F#5:6 F#4:3 G#4:3 | A4:3 -:1 B4:2 -:1 C#5:5 -:1 C#6:6 | E6:6 F#6:6 | F#4:3 E6:3 C#6:6 -:1 C#6:5 | -:1 D#6:8 -:1 B5:3 C#6:6 | C#5:3 B4:3 A4:3 G#4:3 | F#4:6 -:1 A4:5 -:1 C#5:6 | F#6:6 C#6:12 | E6:6 -:1 B5:8 | -:1 C#6:3 C#6:6 B5:6 | A5:6 G#5:3 E5:3 | E4:6 -:1 G#4:11 | -:1 E4:3 E4:3 F#4:3 G#4:3 | F#5:12 -:1 C#6:5 | -:1 B5:11 -:1 G#5:6 | G#5:6 F#5:6 | E5:6 -:1 F#5:8 | -:1 C#5:3 F#5:6 C#5:3 F#5:6 | C#5:3 F#5:6 -:1 A#4:2 -:1 | F#4:5 -:1 A#4:3 F#4:6 A#4:3 | F#4:6 A#4:3 F#4:6 | D5:6 -:1 D5:5 -:1 D5:6 | A5:6 A5:6 | A5:6 E5:9 -:1 | F5:3 E5:6 D5:6 A#4:3 | C5:3 D5:6 E5:6 | C5:3 -:1 D5:2 -:1 E5:11 | -:1 A5:6 C6:6 | D6:12 -:1 C6:5 | -:1 A5:6 B5:9 | G5:3 A5:3 D5:3 F5:3 D6:3 | D5:3 -:1 F5:2 -:1 C6:3 D5:3 F5:3 | B5:3 D5:3 F5:3 A5:3 D5:3 | F5:3 G5:3 D6:6 -:1 D6:11 | -:1 D6:6 C6:3 | G5:9 A5:6 | A5:6 -:1 G5:5 -:1 F5:6 | E5:3 C5:26 |  | -:2 C5:6 D5:12 | A5:6 G5:12 | -:1 E5:5 -:1 E5:7 | D5:7 C5:7 | -:1 D5:8 G4:8 | -:1 A4:8 C5:8 | -:1 B4:16 | -:1 D4:16 | -:1 D4:8 | A4:8 -:1 A4:8 | A4:8 -:1 E4:12 | F4:4 -:1 E4:8 | D4:16 | -:13' },
      { wave: 'thin', volume: 0.18, pluck: true, notes: '-:16 | -:13 A6:19 |  | -:16 | -:11 A5:45 |  |  | -:8 | G4:21 | -:11 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:1 A4:9 -:6 | -:16 | -:16 | -:16 | -:13 G4:17 | -:2 | -:16 | -:16 | -:16 | -:8 C5:6 C5:6 | -:1 C5:6 G4:6 | G4:6 -:1 G4:6 D4:9 | D#4:3 -:1 D4:6 | C5:12 D#5:3 | -:1 F5:3 G5:3 F5:3 C5:9 | D#5:3 -:1 C5:3 D5:3 A4:6 | G4:6 -:1 A#4:5 -:1 | C5:12 A#4:6 | -:1 G4:6 A4:6 F4:6 | -:1 G4:6 C6:6 | A#5:6 -:1 A5:5 -:1 G5:6 | F5:6 D#5:6 | -:1 C5:6 A#4:6 D#4:12 | -:1 G5:6 | G5:12 -:1 G5:6 | F5:12 | -:1 D#5:6 C5:6 A#4:6 | -:1 A#4:6 A#4:3 D4:12 | -:4 F6:18 | -:1 | -:12 D#5:6 | -:1 D5:12 A#4:6 | A#4:6 -:1 F4:6 | D4:6 G4:18 | -:1 D#5:6 | F#5:6 -:1 G#5:5 -:1 A5:6 | C#4:6 A5:6 | A5:6 F#4:3 E5:3 -:1 E5:5 | -:1 E5:6 E4:3 E5:3 E5:6 | C#5:6 C#4:3 E4:3 | F#4:3 -:1 F#4:2 -:1 A4:5 -:1 A5:6 | C#6:6 C#6:6 | C#4:3 A5:3 A5:6 -:1 A5:5 | -:1 B5:8 -:1 B4:3 C#5:6 | A4:3 G#4:3 F#4:3 E4:3 | C#4:6 -:1 F#4:5 -:1 A4:6 | C#6:6 C#5:12 | B5:6 -:1 B4:8 | -:1 C#5:3 A5:6 F#5:6 | E5:6 E5:3 G#4:3 | B3:6 -:1 E4:11 | -:1 B3:3 -:9 | D5:12 -:1 C#5:5 | -:1 F#5:11 -:1 G#4:6 | E5:6 B4:6 | B4:6 -:1 C#5:8 | -:1 A4:3 -:6 A4:3 -:3 | -:3 A4:3 -:7 F#4:2 -:1 | -:6 F#4:3 -:6 F#4:3 | -:6 F#4:3 -:5 | -:1 A4:6 -:1 A4:5 -:1 A4:6 | D5:6 D5:6 | D5:6 C5:9 -:1 | C5:3 E4:6 A#4:6 F4:3 | -:3 A#4:6 C5:6 | G4:3 -:4 C5:11 | -:1 D5:6 C5:6 | A5:12 -:1 C5:5 | -:1 F5:6 B4:9 | C5:3 D5:3 -:6 D5:3 | -:7 C5:3 -:5 | -:1 B4:3 -:6 A4:3 -:3 | -:3 G4:3 D5:6 -:1 A5:11 | -:1 D5:6 G5:3 | D5:9 F5:6 | F5:6 -:1 D5:5 -:1 C5:6 | C5:3 G4:26 |  | -:2 C4:6 A#4:12 | F5:6 E5:12 | -:1 E4:5 -:1 C5:7 | C5:7 G4:7 | -:1 A4:8 F4:8 | -:1 F4:8 G4:8 | -:11 | -:7 A3:16 | -:9 | -:16 | -:16 | -:16 | -:16 | -:16' },
      { wave: 'triangle', volume: 0.18, pluck: true, notes: 'C3:2 F3:2 G3:2 A3:2 C4:1 -:1 F4:1 G4:2 A4:2 C5:2 | -:15 | -:16 | -:16 | -:16 | -:16 | -:16 | -:10 C2:3 G3:3 | C4:3 D#4:3 -:1 G4:2 -:1 F4:3 C2:3 | G3:3 C4:3 D4:3 D#4:6 -:1 | C2:3 G3:3 C4:3 D4:3 G4:6 | -:1 C3:3 G3:3 C4:12 | C3:3 -:1 G3:3 C4:3 D#4:3 | G4:6 C3:3 -:1 G3:3 C4:3 | D#4:3 G4:6 D3:3 G#3:3 | -:1 C4:3 D#4:3 G4:6 D3:3 | G#3:3 C4:3 -:1 D#4:3 G4:6 | D3:3 G#3:3 C4:3 -:1 D#4:3 G4:6 | C3:3 G3:3 C4:3 D#4:3 | -:1 G4:6 C3:3 G3:3 C4:3 | D#4:3 G4:6 -:1 A#3:6 | C4:6 F3:6 -:1 C3:3 | G3:3 C4:3 D#4:3 G4:6 -:1 | C3:3 G3:3 C4:3 D#4:3 G4:6 | C3:3 -:1 G3:3 C4:12 | C3:1 D#3:1 G3:1 C4:16 | D#3:1 G3:1 A#3:1 D#4:16 | D#6:1 G6:1 A#6:1 D#7:16 | F2:3 | A#2:3 C3:3 -:1 F3:2 -:1 A#3:3 F3:3 | A3:18 | -:1 F3:6 F4:3 A#4:3 | C5:3 -:1 F4:3 D4:18 | -:1 A#5:18 | -:1 C3:3 | G3:3 C4:3 D#4:3 G4:6 A#2:4 | G3:3 C4:3 D#4:3 G4:6 | G2:3 G3:3 -:1 C4:3 D#4:3 G4:6 | F2:3 G3:3 -:1 C4:3 D#4:3 | D4:3 A#3:3 C2:18 | -:1 C3:18 | -:1 G2:18 |  | -:1 F3:3 G3:3 A#3:6 C4:3 | -:1 D#4:3 G4:3 C4:3 C4:12 | -:7 G2:18 | -:1 | C2:18 | -:1 A#2:6 C3:6 F2:6 | -:1 C3:3 G3:3 A#3:3 C4:3 | D#4:3 G4:3 -:1 C3:2 -:1 G3:3 A#3:3 | C4:3 D#4:3 G4:3 C3:3 -:1 G3:3 | A#3:3 C4:3 D#4:3 G4:3 C3:3 | G3:3 -:1 C4:12 | C4:12 -:1 C4:6 | A#3:12 | -:1 D3:6 D4:6 G3:6 | -:1 F3:6 F2:12 | -:4 F3:3 A#2:18 | -:1 | F2:6 C3:6 F3:6 | -:1 G2:6 A#2:6 F3:6 | A#1:6 -:1 A#2:6 | D3:6 C2:6 -:1 D#3:3 | G3:3 A#3:3 C4:3 G#2:6 | A2:6 -:1 B2:5 -:1 F#2:6 | C#3:6 A3:6 | F#2:6 C#3:6 -:1 E3:5 | -:1 E2:6 B2:6 E3:6 | F#2:6 C#3:6 | C#3:6 -:1 F#2:5 -:1 C#3:6 | A3:6 F#2:6 | C#3:6 A3:6 -:1 E2:5 | -:1 F#2:8 -:1 E2:3 F#2:6 | C#3:6 F#3:6 | F#2:6 -:1 C#3:5 -:1 F#3:6 | F#2:6 C#3:6 | C#3:6 G#2:6 -:1 E3:8 | -:1 A2:3 A2:6 F#2:6 | E2:6 G#2:6 | B2:6 -:1 E3:5 -:1 E2:6 | B2:6 E3:6 | D2:3 A2:3 D3:3 F#3:3 -:1 A3:2 -:1 | D2:3 E2:3 B2:3 E3:3 F#3:3 G#3:6 | E2:3 B2:3 E3:3 F#3:3 | G#3:6 -:1 F#1:3 C#3:3 F#3:3 | A3:3 F#3:3 A3:3 A3:3 F#3:3 | A3:3 A3:3 F#3:3 A3:3 -:1 A#1:3 | F#3:3 A#3:3 C#4:3 A#3:3 F#3:3 C#3:3 | A#2:3 G#2:3 F#2:3 E2:3 D#2:3 | D2:3 -:1 A2:2 -:1 D3:3 A3:3 D3:3 | A2:3 F3:3 D3:3 F3:3 A3:3 | F3:3 D3:3 C2:3 G2:3 -:1 C3:2 -:1 | E3:3 G3:3 E3:3 A#1:3 D3:3 F3:3 | A#3:3 D4:3 A#3:3 C2:3 G3:3 | C4:3 -:1 G3:2 -:1 E4:3 C4:3 D2:3 | A2:3 D3:3 F3:3 A3:3 F3:3 | D2:3 A2:3 F3:3 D4:3 -:1 A3:2 -:1 | F3:3 A2:6 D3:9 | A2:3 D2:3 A2:3 D3:3 F3:3 | A3:3 -:1 F3:2 -:1 D2:3 A3:3 E3:3 | D4:3 A3:3 E3:3 D2:3 A2:3 | D3:3 F3:3 D3:3 F3:3 -:1 D2:3 | D3:3 F3:3 A3:3 D4:6 C2:3 | C3:3 E3:3 G3:3 C4:6 | F2:1 C3:1 A3:5 E2:1 G3:5 D2:1 C3:5 | C2:3 G2:3 C3:3 D3:3 | E3:6 C2:3 G2:3 -:1 C3:2 -:1 | E3:3 C3:3 G2:3 A#1:3 F2:3 A#2:3 | F3:3 D3:3 F2:3 C2:3 G2:3 | C3:3 -:1 G3:2 -:1 C3:3 G2:3 C2:3 | G2:4 C3:3 -:1 G3:3 C3:4 | G2:3 -:1 A#1:8 A2:8 | -:1 F2:8 G1:24 |  | -:2 D2:89 |  |  |  |  |  | -:16' },

      // The left hand's second note, and what neither hand's first two voices take.
      { wave: 'triangle', volume: 0.14, pluck: true, notes: '-:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:10 C3:3 -:3 | -:13 C3:3 | -:16 | C3:3 -:13 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:10 D4:6 | F4:6 C4:6 -:4 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:4 C4:6 -:6 | -:7 A#4:18 | -:1 D6:18 | -:4 | -:15 C3:3 | -:14 | -:2 C3:3 -:11 | -:5 C3:3 -:8 | -:8 G2:18 | -:1 G3:18 | -:1 D3:18 |  | -:1 A#3:3 -:9 G4:3 | -:1 C5:3 D#5:3 A#4:3 G4:12 | -:7 C3:18 | -:1 | G2:18 | -:1 D3:6 F3:6 C3:6 | -:11 | -:16 | -:16 | -:16 | -:16 | -:1 G4:12 -:1 G4:6 | F4:12 | -:1 A#3:6 F4:6 A#3:6 | -:1 A#3:6 A#2:12 | -:7 A#3:18 | -:1 | F3:6 F3:6 -:4 | -:3 G3:6 D3:6 A#3:6 | F2:6 -:1 D3:6 | F3:6 C3:6 -:2 | -:11 D#3:6 | E3:6 -:1 F#3:5 -:1 C#3:6 | F#3:6 C#4:6 | C#3:6 F#3:6 -:1 A3:5 | -:1 B2:6 F#3:6 B3:6 | C#3:6 F#3:6 | A3:6 -:1 C#3:5 -:1 F#3:6 | C#4:6 C#3:6 | F#3:6 C#4:6 -:1 A2:5 | -:1 B2:8 -:1 B2:3 C#3:6 | F#3:6 A3:6 | C#3:6 -:1 F#3:5 -:1 A3:6 | C#3:6 F#3:6 | F#3:6 B2:6 -:1 G#3:8 | -:1 C#3:3 C#3:6 B2:6 | A2:6 B2:6 | E3:6 -:1 G#3:5 -:1 B2:6 | E3:6 G#3:6 | -:16 | -:16 | -:16 | -:8 F#2:3 -:5 | -:1 C#4:3 -:6 C#4:3 -:3 | -:3 C#4:3 -:7 A#2:2 -:1 | -:16 | -:16 | -:16 | -:4 A3:3 -:9 | -:16 | -:9 A#2:3 -:4 | -:11 C3:3 -:2 | -:14 D3:3 | -:15 | D3:3 -:13 | -:3 C3:6 A3:9 | D3:3 D3:3 -:8 | -:8 D3:3 -:5 | -:10 D3:3 -:3 | -:13 A2:2 -:1 | -:15 G2:3 | -:14 | -:8 C3:6 -:1 F3:5 | C3:3 -:9 | -:6 C3:3 -:7 | -:9 A#2:3 -:4 | -:11 C3:3 -:2 | -:14 C3:3 | -:15 | -:4 A#2:8 A3:8 | -:1 F3:8 G2:24 |  | -:11 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16' },
      { wave: 'thin', volume: 0.12, pluck: true, notes: '-:16 | -:13 F6:19 |  | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:4 F4:6 -:6 | -:7 D5:18 | -:1 F6:18 | -:4 | -:16 | -:16 | -:16 | -:16 | -:8 C3:18 | -:1 C4:18 | -:1 A#3:18 |  | -:1 G4:12 -:3 | -:16 | -:13 G3:18 | -:1 | C3:18 | -:14 | -:16 | -:16 | -:16 | -:16 | -:16 | -:1 C5:12 -:1 C5:6 | A#4:12 | -:1 A#4:6 A#4:6 D#4:6 | -:1 D4:6 D3:12 | -:7 D6:18 | -:1 | -:16 | -:9 F3:6 D4:6 | -:7 F3:6 | -:14 | -:11 G#4:6 | C#5:6 -:1 E5:5 -:1 F#5:6 | A3:6 F#5:6 | F#5:6 C#4:6 -:1 C#5:5 | -:1 G#4:6 B3:6 C#5:6 | F#4:6 A3:6 | C#4:6 -:7 F#5:6 | A5:6 A5:6 | A3:6 F#5:6 -:1 E5:5 | -:1 F#5:8 -:5 | -:5 A3:6 C#4:6 | -:7 A3:5 -:1 C#4:6 | A5:6 A3:6 | C#4:6 G#5:6 -:1 B3:8 | -:1 A3:3 E5:6 C#5:6 | C#5:6 G#4:3 E4:3 | -:15 | -:4 G#3:6 B3:6 | A4:12 -:4 | -:3 E5:11 -:2 | -:5 B4:6 F#4:6 | E4:6 -:1 A4:8 | -:16 | -:13 C#4:2 -:1 | -:6 C#4:3 -:6 C#4:3 | -:6 C#4:3 -:5 | -:1 D4:6 -:1 D4:5 -:1 D4:6 | A4:6 A4:6 | A4:6 G4:9 -:1 | F4:3 -:6 F4:6 -:1 | -:11 G4:6 | -:15 | -:4 A4:6 -:6 | F5:12 -:4 | -:3 C5:6 -:7 | -:2 G4:3 A4:3 -:8 | -:16 | -:16 | -:13 F5:11 | -:7 C5:3 | C5:9 C5:6 | C5:6 -:1 C5:5 -:1 A4:6 | G4:3 E4:26 |  | -:8 F4:12 | D5:6 C5:12 | -:7 G4:7 | G4:7 E4:7 | -:1 F4:8 D4:8 | -:1 C4:8 C4:8 | -:11 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16' },
    ],
  },
  /**
   * Always in my heart, from the anime SukaSuka (Shumatsu Nani Shitemasu ka?), composed by Kato Tatsuya; converted
   * here from a piano arrangement published as a MIDI file with the YouTube video IGW-TD92vi0, whose author allows
   * its use anywhere with credit to the original composer and to the arranger (the arranger of that video); reduced
   * to five chiptune voices and quantized.
   *
   * HOW IT WAS CONVERTED (the MIDI is not in the repository): its one tempo, 91.9 a minute, doubled to `bpm: 183.8`
   * so a step is a 32nd note (12 of the MIDI's 96 ticks a quarter), a bar of 3/4 24 steps; onsets and ends rounded to
   * the nearest step (41 ms at most), a note shorter than a step kept as one; the MIDI's empty first bar left out,
   * the end padded to a multiple of 16 steps. Its two tracks, right and left hand, go to five voices, one note at a
   * time: at each onset the right hand's notes from the top take the melody (the top one, cutting the note the melody
   * still holds), then the second voice, then the inner voice, whichever is free; the left hand's from the bottom the
   * bass, then the octave voice, then the inner voice. A note that finds no free voice is left out (2 of 955). No
   * velocities, pedal or pitch bends: `levelled` sets the loudness. A bar line `|` every 24 steps; a long note
   * stays in the bar where it starts (content/always.test.ts checks the result).
   */
  'always-in-my-heart': {
    bpm: 183.8,
    loop: false,
    voices: [
      { wave: 'pulse', volume: 0.2, pluck: true, notes: 'B6:16 A6:8 | F#6:16 D6:8 | E6:16 D6:8 | B5:16 A4:8 | B4:16 A4:8 | F#4:11 A4:1 A5:4 A4:3 F#5:5 | E5:24 | C#4:40 | -:3 A4:8 | A4:16 D5:8 | D5:16 D5:8 | E5:12 F#5:4 E5:8 | F#5:16 E5:4 D5:4 | D5:8 A5:1 B5:7 A5:8 | A5:12 F#5:2 E5:2 D5:8 | E5:20 D4:4 | C#4:16 A4:8 | A4:16 D5:8 | D5:16 D5:8 | E5:12 F#5:4 G5:8 | A5:11 -:1 F#4:4 D5:4 C#5:4 | D5:8 D6:8 B5:4 A5:4 | A5:4 -:4 D5:8 A5:4 F#5:4 | F#5:12 G5:2 F#5:2 E5:8 | D5:8 F#3:8 A3:7 | -:1 E4:16 A4:8 | A4:8 D5:8 A4:4 C#4:4 | B4:12 A4:4 F#4:8 | A4:16 C#5:8 | C#5:16 A4:8 | D5:8 D5:8 A4:8 | A5:12 A4:4 D5:6 | G4:1 F#4:1 D5:12 A3:4 B3:4 D4:4 | -:19 A4:8 | -:2 A4:16 | D5:8 D5:16 | D5:8 E5:12 F#5:4 | G5:8 A5:12 D4:4 | D5:4 F#4:4 D5:8 D6:8 | B5:4 A5:4 A5:8 C#5:8 | A5:4 F#5:4 F#5:12 G5:2 F#5:2 | E5:8 D5:24 | G5:8 A5:8 | B5:8 A5:16 | C#6:8 D6:8 E6:8 | F#6:8 A5:24 | G5:16 | E5:8 F#5:23 | -:1 F#5:8 G5:8 | A5:8 F5:1 D6:23 | A5:16 | G5:8 F#5:40 |  | A5:8 A5:8 D6:8 | A5:8 B5:12 A5:4 | F#5:8 A5:32 | B4:7 -:1 | A5:8 A5:8 D6:8 | E6:8 D6:12 B5:4 | A5:6 F#4:2 E5:40 |  | -:2 A4:8 -:1 A4:16 | D5:8 C#6:16 | D5:8 A5:12 C#6:4 | E6:8 E6:8 D6:8 | A5:4 D5:4 A5:8 A5:1 B5:7 | C#6:8 C#6:8 D6:4 F#5:2 | E5:2 D5:8 D6:24 | C#6:8 -:5 | -:3 A4:8 D5:16 | D5:8 D5:8 F#5:8 | D5:8 E5:8 D5:4 F#5:4 | G5:8 A5:16 | D5:8 D5:8 D6:8 | B5:4 A5:4 A5:16 | A5:4 F#5:4 F#5:12 G5:2 | F#5:2 E5:8 D5:16 | D5:2 E5:2 F#5:10 G5:1 F#5:2 E5:3 D5:6 | B4:4 A4:1 B4:1 A4:8 A4:8 | F#4:8 C#4:9 E4:8 | A5:8 A5:8 D6:8 | A5:8 B5:12 | A5:4 F#5:8 A5:8 -:4 | F#5:2 A5:2 B5:8 A5:4 F#5:4 G5:8 | F#5:8 D6:12 | A5:4 C#6:4 B5:4 B5:8 A5:4 | B4:4 F#6:8 F#6:12 | D5:2 E5:2 F#5:6 G5:1 F#5:1 E5:19 | A4:7 -:1 A4:16 | D5:7 -:1 D5:15 | -:1 D5:7 -:1 E5:12 | F#5:4 E5:8 F#5:8 A4:8 | E5:4 D5:3 -:1 D5:7 -:1 A5:1 | B5:7 A5:7 -:1 A5:15 | -:1 A5:8 E5:24 | C#5:16 | A4:7 -:1 A4:16 | D5:7 -:1 D5:15 | -:1 D5:7 -:1 E5:12 | F#5:4 G5:8 A5:16 | D5:7 -:1 D5:8 D6:8 | B5:4 A5:3 -:1 A5:15 | -:1 A5:3 -:1 F#5:3 -:1 F#5:12 | G5:2 F#5:2 E5:8 D5:16 | A5:7 -:1 A5:7 -:1 D6:7 | -:1 B5:4 A4:3 -:1 A5:15 | -:1 A4:4 F#4:4 D5:1 F#4:1 E4:22 | C#5:13 | -:9 D4:5 -:1 D4:58 |  |  | E5:4 D5:8 A5:17 | G5:10 F#5:51 |  | -:9' },
      { wave: 'thin', volume: 0.18, pluck: true, notes: 'A6:1 -:15 F#6:8 | D6:15 -:1 A5:8 | -:16 B5:8 | F#5:16 -:8 | -:24 | E4:11 -:5 D4:3 -:5 | E4:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:3 A4:40 | -:5 | -:24 | -:24 | -:24 | -:24 | -:24 | -:3 E5:8 -:8 F#4:8 | A4:16 -:5 | -:24 | -:3 F#3:16 D4:8 | -:16 D4:4 -:1 | -:3 C#4:16 B3:8 | A3:16 E4:8 | F#4:16 -:5 | -:3 A4:8 -:13 | -:3 B4:12 -:4 F#4:4 -:1 | -:3 E4:1 -:20 | -:24 | -:24 | -:24 | -:20 F#4:4 | G4:8 A4:16 | E4:4 -:4 F#4:8 -:8 | -:24 | A4:8 A4:16 | G4:8 F#4:24 | G4:8 A4:8 | B4:8 A4:16 | C#5:8 D5:8 E5:8 | F#5:8 A4:24 | G4:16 | A4:8 F#4:23 | -:1 F#4:8 G4:8 | E5:8 D5:24 | E5:16 | G4:8 D5:40 |  | E5:8 D5:8 B5:8 | C#5:8 G5:12 A4:4 | F#4:8 F#5:40 |  | C#5:7 -:1 D5:7 -:1 D5:8 | E5:8 B5:12 B4:4 | F#5:6 -:2 D5:40 |  | -:24 | -:11 D5:16 | -:8 E5:12 F#5:4 | E5:8 F#5:16 | E5:4 -:4 D5:8 -:5 | -:3 A5:8 A5:12 -:1 | -:11 E5:40 |  | -:8 A4:16 | -:21 | -:11 C#5:8 -:5 | -:3 E5:8 D5:16 | -:21 | -:24 | -:24 | -:24 | -:24 | -:19 F#4:8 | D4:8 -:13 | -:24 | -:24 | -:24 | F#4:2 A4:2 D5:8 A4:4 F#4:4 G4:8 | A4:8 A5:12 | -:4 E5:4 B4:4 D5:8 A4:8 | A5:8 A5:12 | -:24 | -:24 | -:24 | -:24 | -:24 | -:7 B4:4 C#5:3 -:1 C#5:8 D5:8 | -:8 F#5:16 | D5:7 -:1 D5:23 | -:10 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:7 A4:7 -:1 A4:7 -:1 D5:7 | -:1 A5:7 -:1 F#5:15 | -:9 E4:1 -:8 | -:24 | -:24 | -:24 | -:24 | -:24 | -:20 D5:51 |  | -:9' },
      { wave: 'triangle', volume: 0.18, pluck: true, notes: 'D5:16 E5:8 | F#5:8 E5:8 F#4:8 | G4:8 D5:8 B4:4 -:4 | -:8 E3:8 D3:8 | G2:24 | D2:24 | A2:64 |  | -:8 | -:3 G2:8 A3:4 G3:4 F#3:8 | D3:8 A3:16 | A2:8 A3:4 B3:4 C#4:8 | B2:8 D3:8 E3:8 | G2:24 | D2:8 D3:16 | A2:8 A3:16 | A2:16 -:5 | -:3 G2:8 D3:8 G3:8 | D2:8 A2:8 D3:8 | A2:8 E3:4 B2:4 C#3:8 | B2:8 F#3:8 A2:8 | G2:8 D3:8 G3:8 | F#2:8 D3:8 G2:8 | A2:8 E3:8 A3:8 | D2:8 A2:8 E3:16 | A2:8 C#2:8 | B2:8 F#3:16 | G2:8 D3:16 | D2:8 A2:8 E3:8 | D3:8 A3:8 C#3:8 | B2:8 F#3:4 C#3:4 D3:8 | G2:8 D3:8 F#3:8 | A2:8 E3:4 -:9 | -:3 E3:19 -:2 | -:8 G2:24 | D2:24 | A2:24 | B2:24 | G2:24 | D2:8 F#2:8 | G2:8 A2:24 | D3:4 D2:4 A2:4 D3:4 | E3:4 F#3:4 D3:4 D2:4 G2:4 B2:4 | D3:4 A2:4 D3:4 D2:4 F#2:4 A2:4 | D3:4 A2:4 D3:4 A2:4 D3:4 A2:4 | D3:4 A2:4 F3:4 F2:4 C3:4 F3:4 | C3:4 F3:4 E3:4 E2:4 B2:4 G3:4 | E3:4 A2:4 D3:4 A2:4 D2:4 D3:4 | F#3:4 A2:4 D3:4 A2:4 E3:4 B2:4 | A3:4 C3:4 F3:4 F2:4 C3:4 F3:4 | C3:4 F3:4 E3:4 E2:4 B2:4 G3:4 | E3:4 A2:4 D3:4 A2:4 D2:4 D3:4 | F#3:4 A2:4 D3:4 A2:4 D3:4 A2:4 | C#3:4 A2:4 B2:4 F#3:4 B3:4 F#3:4 | A3:4 F#3:4 G2:4 D3:4 B3:4 G3:4 | D4:4 D3:4 D2:4 A2:4 D3:4 A2:4 | F#3:4 A3:4 D4:4 F#3:4 C#4:4 F#3:4 | C#3:4 F#3:4 B2:4 F#3:4 B3:4 F#3:4 | C#4:4 A3:4 G2:4 D3:4 A3:4 G3:4 | C#4:4 A3:4 A2:4 E3:4 D4:4 A3:4 | A3:4 D4:4 E3:1 C#4:15 | -:11 G2:24 | D3:24 | A2:24 | B2:16 | A2:8 G2:24 | F#2:24 | A2:40 |  | -:8 G2:8 A3:8 | D4:8 D2:8 F#3:16 | A2:8 D3:8 | E3:8 B2:8 F#3:8 | A3:8 G2:24 | F#2:8 D3:8 | G2:8 A2:16 | E3:8 D3:4 D2:4 A2:4 D3:4 | E3:4 F#3:4 D3:4 D2:4 G2:4 B2:4 | D3:4 A2:4 D3:4 D2:4 F#2:4 A2:4 | D3:4 A2:4 D3:5 A2:4 D3:4 | A2:4 C#3:4 A2:4 B2:4 F#3:4 B3:4 | F#3:4 A3:4 F#3:4 G2:4 D3:4 B3:4 | G3:4 D4:4 D3:4 D2:4 A2:4 D3:4 | A2:4 F#3:4 A3:4 D4:4 F#3:4 C#4:4 | F#3:4 C#3:4 F#3:4 B2:4 F#3:4 B3:4 | F#3:4 C#4:4 A3:4 G2:4 D3:4 A3:4 | G3:4 D4:4 A3:4 A2:4 E3:4 D4:4 | A3:4 A3:4 D4:4 E3:1 C#4:18 | -:8 G2:24 | D3:24 | A2:23 | -:1 F#2:16 | A2:8 G2:8 G3:16 | D2:8 D3:16 | A2:48 |  | G2:4 A3:4 D4:4 | C#4:4 D4:4 A3:4 D2:4 A3:4 D4:4 | C#4:4 D4:4 A3:4 A2:4 A3:4 D4:4 | C#4:4 D4:4 A3:3 -:1 B2:3 -:1 G3:3 -:1 G3:3 | -:1 F#3:3 -:1 F#3:3 -:1 E3:3 -:1 G2:3 -:1 B2:3 -:1 D3:3 | -:1 E3:3 -:1 F#3:3 -:1 G3:3 -:1 F#2:4 D3:3 -:1 F#3:3 | -:1 A2:3 -:1 F#2:3 -:1 G2:3 -:1 A2:24 | D2:8 A2:7 | -:1 C#3:8 B2:8 F#3:8 | A2:8 G2:17 | -:7 A2:37 |  | -:15 D2:10 | D3:4 E3:4 F#3:4 D3:4 D2:4 | G2:4 B2:4 D3:4 A2:4 D3:4 A2:4 | D2:4 D3:4 E3:4 F#3:4 D3:4 D2:4 | G2:5 B2:4 D3:5 A2:5 D3:1 D4:51 |  | -:8' },

      // The left hand's second note, and what neither hand's first two voices take.
      { wave: 'triangle', volume: 0.14, pluck: true, notes: '-:16 E5:8 | F#5:8 -:8 D5:8 | E5:8 -:16 | -:8 B3:8 A3:8 | B2:24 | F#2:24 | E3:64 |  | -:8 | -:3 G3:12 -:9 | -:3 F#3:8 D4:16 | E3:24 | C#4:8 B3:8 A3:8 | D3:24 | -:21 | -:3 A3:8 -:13 | -:3 A3:16 -:5 | -:24 | -:24 | -:19 A3:8 | D3:24 | -:21 | -:19 G3:8 | -:21 | -:24 | -:19 E3:8 | -:21 | -:24 | -:3 A2:8 -:13 | -:3 F#3:16 E3:8 | -:16 B3:8 | A3:8 -:13 | -:3 E3:8 -:13 | -:3 A3:19 -:2 | -:8 G3:24 | D3:24 | A3:24 | B3:24 | G3:24 | D3:8 F#3:8 | G3:8 A3:24 | -:16 | -:8 G3:4 -:12 | G3:4 -:4 F#3:4 -:12 | F#3:4 -:4 F#3:4 -:4 F#3:4 -:4 | F#3:4 -:4 A3:4 -:8 A3:4 | -:8 G3:4 -:12 | -:8 F#3:4 -:12 | -:8 F#3:4 -:4 G3:4 -:4 | -:8 A3:4 -:8 A3:4 | -:8 G3:4 -:12 | -:8 F#3:4 -:12 | -:8 F#3:4 -:4 F#3:4 -:4 | E3:4 -:12 D4:4 -:4 | C#4:4 -:20 | -:24 | -:8 F#4:4 -:4 E4:4 -:4 | B3:4 -:12 D4:4 -:4 | -:16 D4:4 -:4 | -:20 D4:4 | -:8 A3:16 | -:11 G3:24 | F#3:24 | E3:24 | -:13 | -:24 | -:24 | -:24 | -:24 | -:11 D3:8 -:5 | -:11 E3:8 -:5 | -:11 C#3:8 -:5 | -:3 A3:8 D3:8 -:5 | -:11 D3:24 | E3:8 -:5 | -:3 A2:8 F#3:16 | -:21 | -:11 G3:4 -:9 | -:3 G3:4 -:4 F#3:4 -:9 | -:3 F#3:4 -:4 F#3:5 -:4 F#3:4 | -:4 E3:4 -:12 D4:4 | -:4 C#4:4 -:16 | -:24 | -:12 F#4:4 -:4 E4:4 | -:4 C#4:4 -:12 D4:4 | -:20 D4:4 | -:24 | D4:4 -:8 A3:19 | -:8 G3:24 | A3:24 | C#3:24 | B2:16 | -:17 | -:24 | -:15 E3:48 |  | -:9 | -:24 | -:24 | -:15 A3:3 -:6 | -:15 D3:3 -:6 | -:15 A3:3 -:6 | -:7 D3:3 -:5 A3:24 | -:8 D3:8 | A3:8 -:9 | -:15 G3:17 | -:7 A3:37 |  | -:20 | -:17 G3:4 -:3 | -:9 G3:4 -:4 F#3:4 -:3 | -:17 G3:4 -:3 | -:10 G3:5 -:5 F#3:52 |  | -:8' },
      { wave: 'thin', volume: 0.12, pluck: true, notes: 'G6:16 -:8 | -:24 | -:24 | -:8 E4:8 D4:8 | G3:24 | D3:24 | D4:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:3 F#3:24 | -:21 | -:3 D4:20 -:1 | -:24 | -:24 | -:24 | -:24 | -:19 A3:8 | -:21 | -:24 | -:24 | -:24 | -:24 | -:24 | -:19 G3:8 | -:21 | -:24 | -:3 D4:8 -:13 | -:3 A4:12 -:4 D4:8 | D4:12 -:9 | -:3 C#4:19 -:2 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | A4:8 -:16 | -:8 A4:16 | -:8 F#4:40 |  | A4:8 A4:8 D5:8 | A4:8 B4:12 -:4 | -:8 A4:40 |  | A4:8 A4:8 -:8 | -:8 F#5:12 -:4 | A4:6 -:2 E4:24 | -:16 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:11 F#3:23 | -:1 A3:24 | -:13 | -:24 | -:19 E4:8 | -:21 | -:24 | -:24 | -:24 | -:4 B4:8 -:12 | -:4 F#4:8 D5:16 | C#5:4 -:4 B4:8 -:4 | -:4 F#5:8 F#5:12 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:7 B4:4 -:4 A4:15 | -:18 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:24 | -:32' },
    ],
  },
  /**
   * Unravel, the Tokyo Ghoul opening, by TK of Ling tosite sigure; converted here from the MIDI file of a piano cover
   * by Cosmic PIANO (YouTube video SdIawoVY-eM); reduced to five chiptune voices and quantized.
   *
   * HOW IT WAS CONVERTED (the MIDI is not in the repository; the rules of always-in-my-heart above): its tempo,
   * 134.5 a minute (the one that holds for every note), as `bpm: 134.5`, a step a sixteenth (24 of the MIDI's 96
   * ticks a quarter), a bar of 4/4 16 steps; onsets and ends rounded to the nearest step (all but 3 notes exact, those
   * within 51 ms), a note shorter than a step kept as one; the data starts at the MIDI's start, the end padded to a
   * whole bar. The 16 left-hand notes under the 40 Hz floor (D1 and D#1) are left out. The right hand (track 2) and
   * the left (track 3) go to five voices one note at a time, as above: the right hand from the top to the melody, then
   * the second voice, then the inner voice; the left hand from the bottom to the bass, then the octave voice, then the
   * inner voice; 0 notes found no free voice. No velocities, pedal or pitch bends: `levelled` sets the loudness.
   * A bar line `|` every 16 steps; a long note stays in the bar where it starts (content/unravel.test.ts checks it).
   */
  unravel: {
    bpm: 134.5,
    loop: false,
    voices: [
      { wave: 'pulse', volume: 0.2, pluck: true, notes: '-:2 A#5:2 C6:4 A#5:4 A5:2 G5:4 | C6:4 A#5:4 A5:4 G5:4 | G5:2 F5:6 D#5:2 D#5:3 F5:3 | D5:13 -:1 | -:2 D5:2 D5:4 D5:2 D5:4 D6:2 | D6:2 -:4 C5:2 D5:4 C5:2 D5:4 | A#5:2 A5:4 A5:2 A5:4 A#5:2 | A#5:4 -:2 A4:2 A#4:4 A4:2 A#4:4 | A#5:2 C6:4 A#5:4 A5:2 G5:4 | C6:4 A#5:4 A5:4 G5:4 | G5:2 F5:6 D#5:2 D#5:3 F5:3 | D5:4 A4:2 A#4:4 A4:2 A#4:4 | D5:2 D5:4 D5:2 D5:4 D6:2 | D6:2 -:4 C5:2 D5:4 C5:2 D5:4 | A#4:2 A4:4 A4:2 A4:4 A#4:2 | A#4:4 A#4:1 -:2 A#4:3 A#4:1 -:1 A#4:3 A#4:1 | A#4:4 D5:1 D4:1 G4:1 C5:1 D4:1 G4:1 A#4:1 G4:1 D5:1 D4:1 G4:1 C5:1 | D4:1 G4:1 A#4:2 A#3:1 -:2 A#3:3 A#3:1 -:1 A#3:3 A#3:1 | A#3:4 D5:1 A#5:2 D5:1 G5:6 D5:2 | C5:2 D5:2 D5:1 A#5:2 D5:1 G5:6 D5:2 | A#5:2 A5:2 D5:1 A#5:2 D5:1 G5:6 D5:2 | C5:2 D5:2 D5:1 A#5:2 D5:1 G5:6 D5:2 | A#5:2 A5:2 A#5:3 G5:3 C6:2 A#5:3 G5:3 | A5:2 A#5:3 A#5:3 A#5:6 | A#5:2 D6:2 D6:3 C6:3 C6:7 | -:1 A#5:2 C6:3 A#5:3 A5:4 F5:4 | D5:2 -:6 D4:2 C4:4 | -:2 F4:2 F4:2 D4:1 D4:1 -:2 D4:2 C4:2 D4:1 D4:1 | -:2 F4:2 F4:2 D4:1 D4:1 -:2 D4:2 C4:2 D4:1 D4:1 | -:2 F4:2 F4:2 D4:1 D4:1 -:2 D4:2 C4:3 C4:3 | D4:2 D4:4 -:3 F5:1 D6:4 | C6:4 D6:3 C6:3 C6:2 C6:3 A#5:3 | A5:4 A#5:4 A5:4 F5:6 | D6:3 C6:3 C6:4 A#5:4 | A#5:2 A5:3 A#5:3 F6:4 A5:4 | A#5:2 G6:3 F6:3 D6:4 A#5:4 | A#5:2 A#5:4 A5:2 G5:4 A5:4 | A#5:13 -:1 | -:2 A#4:2 A4:3 A#4:3 A4:4 F4:4 | F4:2 D6:3 C6:3 C6:2 C6:3 A#5:3 | A5:4 A#5:4 A5:4 F5:6 | D6:3 C6:3 C6:4 A#5:4 | A#5:2 A5:3 A#5:3 F6:4 A5:4 | A#5:2 G6:3 F6:3 D6:2 A#5:4 | -:2 A#5:2 A#5:4 A5:2 G5:4 A5:4 | A#5:2 D5:1 D4:1 G4:1 D5:1 D4:1 G4:1 C5:1 G4:1 D4:1 G4:1 A#4:1 G4:1 | D4:1 G4:1 A#4:2 C5:1 D4:1 G4:1 D5:1 D4:1 G4:1 C5:1 G4:1 D4:1 G4:1 A#4:1 G4:1 | D4:1 G4:1 A#4:2 C5:1 D4:1 G4:2 A#4:22 | -:2' },
      { wave: 'thin', volume: 0.18, pluck: true, notes: '-:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:4 G4:1 -:2 G4:3 G4:1 -:1 G4:3 G4:1 | G4:4 -:12 | -:4 G3:1 -:2 G3:3 G3:1 -:1 G3:3 G3:1 | G3:4 -:12 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:11 D5:5 | -:4 D5:3 C5:3 C5:2 C5:3 A#4:3 | A4:4 A#4:4 A4:4 F4:6 | D5:3 C5:3 C5:4 A#4:4 | A#4:2 A4:3 A#4:3 F5:4 A4:4 | A#4:2 G5:3 F5:3 D5:4 A#4:4 | A#4:2 A#4:4 A4:2 G4:4 A4:4 | A#4:13 -:1 | -:16 | -:4 D5:3 C5:3 C5:2 C5:3 A#4:3 | A4:4 A#4:4 A4:4 F4:6 | D5:3 C5:3 C5:4 A#4:4 | A#4:2 A4:3 A#4:3 F5:4 A4:4 | A#4:2 G5:3 F5:3 D5:2 A#4:4 | -:2 A#4:2 A#4:4 A4:2 G4:4 A4:4 | A#4:2 -:12 | -:16 | -:16 | -:16' },
      { wave: 'triangle', volume: 0.18, pluck: true, notes: '-:4 G4:11 -:1 | A#4:4 D#4:11 -:1 | G4:4 F4:11 -:1 | A4:4 G4:11 -:1 | -:4 D#2:2 A#2:2 D#3:2 D#2:2 A#2:2 D#3:2 | D#2:2 A#2:2 G2:2 D3:2 G3:2 G2:2 D3:2 G3:2 | G2:2 D3:2 F2:2 C3:2 F3:2 F2:2 C3:2 F3:2 | F2:2 C3:2 G2:2 D3:2 G3:2 G2:2 D3:2 G3:2 | G2:2 D3:2 D#2:2 A#2:2 D#3:2 D#2:2 A#2:2 D#3:2 | D#2:2 A#2:2 G2:2 D3:2 G3:2 G2:2 D3:2 G3:2 | G2:2 D3:2 F2:2 C3:2 F3:2 F2:2 C3:2 F3:2 | F2:2 C3:2 G2:2 D3:2 G3:2 G2:2 D3:2 G3:2 | G2:2 D3:2 D#2:2 A#2:2 D#3:2 D#2:2 A#2:2 D#3:2 | D#2:2 A#2:2 G2:2 D3:2 G3:2 G2:2 D3:2 G3:2 | G2:2 D3:2 F2:2 C3:2 F3:2 F2:2 C3:2 F3:2 | F2:2 C3:2 G2:1 -:2 G2:3 G2:1 -:1 G2:3 G2:1 | G2:4 -:12 | -:4 G1:1 -:2 G1:3 G1:1 -:1 G1:3 G1:1 | G1:4 G1:2 G2:2 G2:2 G2:2 F1:2 F2:2 | F2:2 F2:2 D#2:2 D#2:2 D#2:2 D#2:2 D2:2 D2:2 | D2:2 D2:2 G1:2 G2:2 G2:2 G2:2 F1:2 F2:2 | F2:2 F2:2 D#2:2 D#2:2 D#2:2 D#2:2 D2:2 D2:2 | D2:2 D2:2 G2:3 G2:3 G2:2 G2:3 G2:3 | -:2 G2:15 | -:1 D#2:15 | -:1 F2:15 | -:1 A#2:15 | -:1 G2:2 D3:2 G2:2 D3:2 G2:2 D3:2 | G2:2 D3:2 G2:2 D3:2 G2:2 D3:2 G2:2 D3:2 | G2:2 D3:2 G2:2 D3:2 G2:2 D3:2 G2:2 D3:2 | G2:2 D3:2 -:12 | -:4 D#2:3 D#2:3 D#2:2 D#4:1 A#3:1 G3:1 D#3:1 | A#2:1 G2:1 D#2:2 F1:3 F2:3 F2:2 F4:1 C4:1 A3:1 F3:1 | C3:1 A2:1 F1:2 G1:3 G2:3 G2:2 G2:2 A#2:1 G2:2 | C3:1 F2:2 D2:3 D2:3 D3:4 F4:1 C4:1 | A3:1 F3:1 D3:2 D#2:3 D#2:3 D#2:2 D#4:1 A#3:1 G3:1 D#3:1 | A#2:1 G2:1 D#2:2 F1:4 F2:2 F2:2 F3:2 C3:2 | F2:2 F2:2 G1:2 G2:2 G2:2 G2:2 G2:2 G2:4 | D3:2 D2:3 D2:2 A2:1 F3:3 A2:3 | A2:1 D#2:1 A#1:1 -:1 D#2:3 D#2:3 D#2:2 D#4:1 A#3:1 G3:1 D#3:1 | A#2:1 G2:1 D#2:2 F1:3 F2:3 F2:2 F4:1 C4:1 A3:1 F3:1 | C3:1 A2:1 F1:2 G1:3 G2:3 G2:2 G4:1 D4:1 A#3:1 F3:1 | C3:1 A2:1 G2:2 D2:3 D2:3 D3:2 D3:2 D4:1 C4:1 | A3:1 F3:1 D3:2 D#2:3 D#2:3 D#2:2 D#4:1 A#3:1 G3:1 D#3:1 | A#2:1 G2:1 D#2:2 F1:4 C3:2 F2:2 C4:2 F3:2 | F2:2 G2:61 |  |  | -:1' },

      // The left hand's second note, and what neither hand's first two voices take.
      { wave: 'triangle', volume: 0.14, pluck: true, notes: '-:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:4 D3:1 -:2 D3:3 D3:1 -:1 D3:3 D3:1 | D3:4 -:12 | -:4 D2:1 -:2 D2:3 D2:1 -:1 D2:3 D2:1 | D2:4 G2:2 G3:2 G3:2 G3:2 F2:2 F3:2 | F3:2 F3:2 -:2 D#3:2 D#3:2 D#3:2 -:2 D3:2 | D3:2 D3:2 G2:2 G3:2 G3:2 G3:2 F2:2 F3:2 | F3:2 F3:2 -:2 D#3:2 D#3:2 D#3:2 -:2 D3:2 | D3:2 D3:2 D3:3 D3:3 D3:2 D3:3 D3:3 | -:2 D3:15 | -:1 A#2:15 | -:1 C3:15 | -:1 F3:15 | -:3 G3:2 -:2 G3:2 -:2 G3:2 | -:2 G3:2 -:2 G3:2 -:2 G3:2 -:2 G3:2 | -:2 G3:2 -:2 G3:2 -:2 G3:2 -:2 G3:2 | -:2 G3:2 -:12 | -:7 A#2:3 A#2:2 -:4 | -:4 F2:3 C3:3 C3:2 -:4 | -:2 F2:2 G2:3 D3:3 D3:2 D3:2 A#3:1 G3:2 | C4:1 F3:2 -:3 A2:3 A3:4 -:2 | -:7 A#2:3 A#2:2 -:4 | -:4 F2:4 C3:2 C3:2 C4:2 F3:2 | C3:2 C3:2 G2:2 G3:2 G3:2 -:2 D3:2 -:2 | -:7 D3:2 -:7 | -:7 A#2:3 A#2:2 -:4 | -:4 F2:3 C3:3 C3:2 -:4 | -:2 F2:2 G2:3 D3:3 D3:2 -:4 | -:7 A2:3 A3:2 A3:2 -:2 | -:7 A#2:3 A#2:2 -:4 | -:4 F2:4 F3:2 F3:2 -:4 | F3:2 G3:61 |  |  | -:1' },
      { wave: 'thin', volume: 0.12, pluck: true, notes: '-:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:4 G3:1 -:2 G3:3 G3:1 -:1 G3:3 G3:1 | G3:4 -:12 | -:4 G2:1 -:2 G2:3 G2:1 -:1 G2:3 G2:1 | G2:4 -:12 | -:16 | -:16 | -:16 | -:4 G3:3 G3:3 G3:2 G3:3 G3:3 | -:2 G3:15 | -:1 D#3:15 | -:1 F3:15 | -:1 A#3:15 | -:13 | -:16 | -:16 | -:12 A#5:4 | -:7 D#3:3 D#3:2 -:4 | -:7 F3:3 F3:2 -:4 | -:7 G3:3 G3:2 G3:2 -:2 | -:7 D3:3 D4:4 -:2 | -:7 D#3:3 D#3:2 -:4 | -:10 F3:2 -:4 | -:16 | -:16 | -:7 D#3:3 D#3:2 -:4 | -:7 F3:3 F3:2 -:4 | -:7 G3:3 G3:2 -:4 | -:7 D3:3 D4:2 -:4 | -:7 D#3:3 D#3:2 -:4 | -:16 | -:16 | -:16 | -:16 | -:16' },
    ],
  },
  /**
   * aLIEz, the second ending of the anime Aldnoah.Zero; converted here from a MIDI file linked with the YouTube video
   * EC7yNPoayh4; reduced to five chiptune voices and quantized.
   *
   * HOW IT WAS CONVERTED (the MIDI is not in the repository; the rules of always-in-my-heart and unravel above): its
   * one tempo, 99 a minute, as `bpm: 99`, a step a sixteenth (24 of the MIDI's 96 ticks a quarter), a bar of 4/4 16
   * steps; every onset and end of the MIDI is on that grid, so nothing is moved. The data starts at the MIDI's start
   * and ends on the whole bar after the last note. No note is under the 40 Hz floor. The right hand (track 2) and the
   * left (track 3) go to five voices one note at a time, as above: the right hand from the top to the melody, then the
   * second voice, then the inner voice; the left hand from the bottom to the bass, then the octave voice, then the
   * inner voice; 9 of 922 notes found no free voice. No velocities, pedal or pitch bends: `levelled` sets the
   * loudness. A bar line `|` every 16 steps; a long note stays in the bar where it starts (content/aliez.test.ts).
   */
  aliez: {
    bpm: 99,
    loop: false,
    voices: [
      { wave: 'pulse', volume: 0.2, pluck: true, notes: 'E4:2 E5:2 G5:1 E4:1 E5:2 G5:2 F#5:1 B4:2 B4:1 F#4:2 | E4:2 E5:2 G5:1 E4:1 E5:2 G5:2 F#5:1 B4:2 B4:1 F#4:2 | E4:2 E5:2 G5:1 E4:1 E5:2 G5:2 F#5:1 B4:2 B4:1 F#4:4 | E5:2 G5:1 E4:1 E5:2 G5:2 F#5:1 B4:2 B4:1 F#4:2 | E4:2 E5:2 G5:1 E4:1 E5:2 G5:2 F#5:1 B4:2 B4:1 F#4:2 | E4:2 E5:2 G5:1 E4:1 E5:2 G5:2 F#5:1 B4:2 B4:1 F#4:2 | E4:2 E5:2 G5:1 E4:1 E5:2 G5:2 F#5:1 B4:2 B4:1 F#4:4 | E5:2 G5:1 E4:1 E5:2 G5:2 F#5:1 B4:2 B4:1 F#4:2 | -:8 B4:1 B4:1 B4:2 B4:1 B4:1 D5:2 | E5:3 -:5 B4:1 B4:1 B4:2 B4:1 B4:1 D5:2 | E5:3 -:1 B4:2 D5:2 E5:3 -:1 B4:1 B4:1 D5:2 | E5:2 F#5:2 G5:2 F#5:2 G5:2 F#5:2 D5:2 D5:3 | -:7 B4:1 B4:1 B4:2 B4:1 B4:1 D5:2 | E5:3 -:3 G5:2 F#5:4 G5:2 E5:4 | -:4 E5:2 F#5:2 G5:2 E5:2 F#5:2 | G5:2 A5:2 G5:2 G5:2 F#5:2 F#5:3 B4:3 | -:2 E5:2 D5:2 E5:2 G5:1 E5:3 D5:2 E5:2 | G5:1 A5:3 G5:2 G5:2 E5:2 A5:3 E5:3 | -:2 E5:2 D5:2 E5:2 G5:1 E5:3 D5:2 E5:2 | G5:1 F#5:3 D5:2 D5:2 B4:2 F#5:2 -:1 D5:2 -:1 | -:2 E5:2 D5:2 E5:2 G5:1 E5:3 D5:2 E5:2 | G5:1 A5:3 G5:2 G5:2 E5:2 A5:3 E5:3 | -:2 B4:2 G5:2 F#5:2 D5:1 E5:3 G5:2 F#5:2 | E5:1 F#5:9 -:2 B5:3 E5:3 | B5:4 D6:2 B5:3 -:1 B5:3 E5:3 | B5:4 D6:2 B5:3 -:1 B5:3 E5:3 | B5:4 C6:2 B5:3 -:1 B5:3 E5:3 | A5:2 G5:2 A5:2 G5:2 B5:2 -:1 E5:1 -:1 E5:2 | -:1 B5:4 D6:2 B5:3 -:1 B5:3 E5:3 | B5:4 D6:2 B5:3 -:1 B5:3 E5:3 | B5:4 C6:2 B5:3 -:1 B5:3 E5:3 | A5:2 B5:2 A5:2 B5:2 A5:3 D6:3 | B5:3 -:1 D6:2 A5:4 G5:2 G5:3 E5:3 | -:2 D6:2 A5:4 G5:2 G5:3 E5:3 | -:2 D6:2 A5:4 G5:2 G5:4 | E5:2 E5:2 G5:2 E5:2 G5:2 F#5:3 B4:3 | -:4 D6:2 A5:4 G5:2 G5:3 E5:3 | -:2 D6:2 A5:4 G5:2 G5:3 E5:3 | -:2 D6:2 A5:4 G5:2 G5:4 | E5:2 E5:2 G5:2 E5:2 G5:2 F#5:3 B4:4 | -:15' },
      { wave: 'thin', volume: 0.18, pluck: true, notes: '-:16 | -:16 | -:16 | -:16 | -:2 B4:2 -:2 B4:2 E5:2 -:1 F#4:2 -:3 | -:2 B4:2 -:2 B4:2 E5:2 -:1 F#4:2 -:3 | -:2 B4:2 -:2 B4:2 E5:2 -:1 F#4:2 -:3 | -:2 B4:2 -:2 B4:2 E5:2 -:1 F#4:2 -:3 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:9 B4:3 -:4 | -:1 E5:3 -:6 E5:3 B4:3 | -:9 B4:3 -:4 | -:1 D5:3 -:6 D5:2 -:1 B4:2 -:1 | -:9 B4:3 -:4 | -:1 E5:3 -:6 E5:3 B4:3 | -:16 | -:1 B4:9 -:2 B4:3 E4:3 | E5:4 D5:2 E5:3 -:1 B4:3 E4:3 | E5:4 D5:2 E5:3 -:1 B4:3 E4:3 | E5:4 C5:2 E5:3 -:1 B4:3 E4:3 | A4:2 G4:2 A4:2 G4:2 B4:2 -:1 E4:1 -:1 E4:2 | -:1 E5:4 D5:2 E5:3 -:1 B4:3 E4:3 | E5:4 D5:2 E5:3 -:1 B4:3 E4:3 | E5:4 C5:2 E5:3 -:1 B4:3 E4:3 | A4:2 B4:2 A4:2 B4:2 A4:3 D5:3 | B4:3 -:1 D5:2 A4:4 G4:2 G4:3 E4:3 | -:2 D5:2 A4:4 G4:2 G4:3 E4:3 | -:2 D5:2 A4:4 G4:2 G4:4 | E4:2 B4:2 G4:2 B4:2 G4:2 F#4:3 F#4:3 | -:4 D5:2 E5:4 G4:2 G4:3 B4:3 | -:2 D5:2 E5:4 G4:2 G4:3 B4:3 | -:2 D5:2 E5:4 G4:2 G4:4 | B4:2 B4:2 G4:2 B4:2 G4:2 F#4:3 F#4:4 | -:15' },
      { wave: 'triangle', volume: 0.18, pluck: true, notes: '-:2 E2:3 E2:1 E2:2 E2:1 E2:2 E2:3 E2:4 | C2:3 C2:1 C2:2 C2:1 C2:2 C2:3 C2:4 | A2:3 A2:1 A2:2 A2:1 A2:2 A2:3 A2:4 | G2:3 G2:1 G2:2 G2:1 G2:2 G2:3 G2:4 | E2:3 E2:1 E2:2 E2:1 E2:2 E2:3 E2:4 | G2:3 G2:1 G2:2 G2:1 G2:2 G2:3 G2:4 | A2:3 A2:1 A2:2 A2:1 A2:2 A2:3 A2:4 | C3:3 C3:1 C3:2 C3:1 C3:2 C3:3 C3:4 | E2:3 F#3:3 B3:3 E3:3 F#3:4 | C2:3 F#3:3 B3:3 E3:3 F#3:2 | E3:2 A1:3 F#3:3 B3:3 E3:3 F#3:2 | E3:2 B1:3 F#3:3 B3:3 E3:3 F#3:2 | E3:2 E2:3 F#3:3 B3:3 E3:3 F#3:2 | E3:2 C2:3 F#3:3 B3:3 E3:3 F#3:2 | E3:2 A1:3 F#3:3 B3:3 E3:3 F#3:2 | E3:2 G1:3 F#3:3 B3:3 E3:3 F#3:2 | E3:2 C2:3 C2:1 C2:2 C2:1 C2:2 C2:1 C2:2 C2:2 | C2:2 D2:3 D2:1 D2:2 D2:1 D2:2 D2:1 D2:2 D2:2 | D2:2 A1:3 A1:1 A1:2 A1:1 A1:2 A1:1 A1:2 A1:2 | A1:2 G1:3 G1:1 G1:2 G1:1 G1:2 G1:1 G1:2 G1:2 | G1:2 C2:3 C2:1 C2:2 C2:1 C2:2 C2:1 C2:2 C2:2 | C2:2 D2:3 D2:1 D2:2 D2:1 D2:2 D2:1 D2:2 D2:2 | D2:2 G1:3 G1:1 G1:2 G1:1 G1:2 G1:1 G1:2 G1:2 | G1:2 A1:3 A1:1 A1:1 A1:1 A1:1 A1:2 -:5 | -:2 E2:3 E2:1 E2:2 E2:1 E2:2 E2:3 E2:4 | C2:3 C2:1 C2:2 C2:1 C2:2 C2:3 C2:4 | A1:3 A1:1 A1:2 A1:1 A1:2 A1:3 A1:4 | G1:3 G1:1 G1:2 G1:1 A1:2 B1:3 B1:2 | B1:2 E2:3 E2:1 E2:2 E2:1 E2:2 E2:3 E2:4 | C2:3 C2:1 C2:2 C2:1 C2:2 C2:3 C2:4 | G2:3 G2:1 G2:2 G2:1 G2:2 G2:3 G2:4 | A1:3 A1:1 A1:2 A1:2 B1:3 B1:3 | B1:2 E2:3 E2:1 E2:2 E2:1 E2:2 E2:3 E2:4 | C2:3 C2:1 C2:2 C2:1 C2:2 C2:3 C2:4 | A1:3 A1:1 A1:2 A1:1 A1:2 A1:3 A1:4 | G1:3 G1:1 G1:2 G1:2 B1:3 B1:3 | B1:2 E2:3 E2:1 E2:2 E2:1 E2:2 E2:3 E2:4 | C2:3 C2:1 C2:2 C2:1 C2:2 C2:3 C2:4 | G2:3 G2:1 G2:2 G2:1 G2:2 G2:3 G2:4 | A1:3 A1:1 A1:2 A1:2 B1:3 B1:1 B1:1 B1:1 | B1:1 B1:1 -:14' },

      // The left hand's second note, and what neither hand's first two voices take.
      { wave: 'triangle', volume: 0.14, pluck: true, notes: '-:2 E3:3 -:1 E3:2 -:1 E3:2 E3:3 E3:4 | C3:3 -:1 C3:2 -:1 C3:2 C3:3 C3:4 | A3:3 -:1 A3:2 -:1 A3:2 A3:3 A3:4 | G3:3 -:1 G3:2 -:1 G3:2 G3:3 G3:4 | E3:3 -:1 E3:2 -:1 E3:2 E3:3 E3:4 | G3:3 -:1 G3:2 -:1 G3:2 G3:3 G3:4 | A3:3 -:1 A3:2 -:1 A3:2 A3:3 A3:4 | C4:3 -:1 C4:2 -:1 C4:2 C4:3 C4:4 | E3:3 -:11 | -:2 C3:3 -:11 | -:2 A2:3 -:11 | -:2 B2:3 -:11 | -:2 B2:3 -:11 | -:2 G2:3 -:11 | -:2 E2:3 -:11 | -:2 D2:3 -:11 | -:2 C3:3 -:1 C3:2 -:1 C3:2 C3:1 C3:2 C3:2 | C3:2 D3:3 -:1 D3:2 -:1 D3:2 D3:1 D3:2 D3:2 | D3:2 A2:3 -:1 A2:2 -:1 A2:2 A2:1 A2:2 A2:2 | A2:2 G2:3 -:1 G2:2 -:1 G2:2 G2:1 G2:2 G2:2 | G2:2 C3:3 -:1 C3:2 -:1 C3:2 C3:1 C3:2 C3:2 | C3:2 D3:3 -:1 D3:2 -:1 D3:2 D3:1 D3:2 D3:2 | D3:2 G2:3 -:1 G2:2 -:1 G2:2 G2:1 G2:2 G2:2 | G2:2 A2:3 A2:1 A2:1 A2:1 A2:1 A2:2 -:5 | -:2 E3:3 -:1 B2:2 -:1 E3:2 E3:3 B2:4 | C3:3 -:1 G2:2 -:1 C3:2 C3:3 G2:4 | A2:3 -:1 E2:2 -:1 A2:2 A2:3 E2:4 | G2:3 -:1 D2:2 -:1 A2:2 B2:3 F#2:2 | F#2:2 E3:3 -:1 B2:2 -:1 E3:2 E3:3 B2:4 | C3:3 -:1 G2:2 -:1 C3:2 C3:3 G2:4 | G3:3 -:1 D3:2 -:1 G3:2 G3:3 D3:4 | A2:3 -:1 E2:2 -:2 B2:3 F#2:3 | F#2:2 E3:3 -:1 B2:2 -:1 E3:2 E3:3 B2:4 | C3:3 -:1 G2:2 -:1 C3:2 C3:3 G2:4 | A2:3 -:1 E2:2 -:1 A2:2 A2:3 E2:4 | G2:3 -:1 D2:2 -:2 B2:3 F#2:3 | F#2:2 E3:3 -:1 B2:2 -:1 E3:2 E3:3 B2:4 | C3:3 -:1 G2:2 -:1 C3:2 C3:3 G2:4 | G3:3 -:1 D3:2 -:1 G3:2 G3:3 D3:4 | A2:3 -:1 E2:2 -:2 B2:3 B2:1 B2:1 B2:1 | B2:1 B2:1 -:14' },
      { wave: 'thin', volume: 0.12, pluck: true, notes: '-:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:2 E3:3 -:11 | -:2 C3:3 -:11 | -:2 A2:3 -:11 | -:2 G2:3 -:11 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:2 B4:4 E3:2 B4:3 -:3 E3:4 | B4:4 C3:2 B4:3 -:3 C3:4 | B4:4 A2:2 B4:3 -:3 A2:4 | -:4 G2:2 -:6 B2:2 | B2:2 B4:4 E3:2 B4:3 -:3 E3:4 | B4:4 C3:2 B4:3 -:3 C3:4 | B4:4 G3:2 B4:3 -:3 G3:4 | -:4 A2:2 -:5 B2:3 | B2:2 -:4 E3:2 -:6 E3:4 | -:4 C3:2 -:6 C3:4 | -:4 A2:2 -:6 A2:4 | E4:2 -:2 E4:2 -:5 B3:3 | B2:2 -:4 A4:4 -:4 E3:4 | -:4 A4:4 -:4 C3:4 | -:4 A4:4 -:4 G3:4 | E4:2 -:2 E4:2 -:5 B3:4 | -:15' },
    ],
  },
  /**
   * Guren no Yumiya, the opening of the anime Shingeki no Kyojin (Attack on Titan); converted here from a MIDI file
   * linked from sheet.host (page L775Nx); reduced to five chiptune voices and quantized.
   *
   * HOW IT WAS CONVERTED (the MIDI is not in the repository; the rules of always-in-my-heart above): its main tempo,
   * 92 a minute, doubled to `bpm: 184`, so a step is a 32nd note (128 of the MIDI's 1,024 ticks a quarter); its
   * bars as its time signatures make them (4/4 is 32 steps, its two bars of 2/4 16). The MIDI slows a little three
   * times (to 88.5), speeds up to 121 near the end and takes the last note at 57; one bpm cannot follow that, so the
   * piece plays at 92 throughout (its length within a second of the MIDI's). Onsets rounded to the nearest step (40 ms
   * at most), every note 10 ticks late in the MIDI moved onto the grid. Track 1 is the right hand, track 2 the left;
   * the 31 notes under 40 Hz (A0 to D#1) are left out, a key struck twice at once by one hand counts once (6),
   * five voices one note at a time as for the other MIDI pieces; 79 notes found no free voice. No velocities or
   * pedal: `levelled` sets the loudness (content/guren.test.ts checks the result).
   */
  'guren-no-yumiya': {
    bpm: 184,
    loop: false,
    voices: [
      { wave: 'pulse', volume: 0.2, pluck: true, notes: 'C#5:2 C#5:2 E5:2 D#5:4 B4:2 B4:2 C#5:4 C#5:2 E5:2 D#5:4 B4:6 | G#5:4 E4:2 F#4:4 D#4:4 E4:4 C#4:4 D#4:4 B3:6 | G#5:4 E4:2 F#4:4 D#4:4 E4:4 D#4:4 C#4:4 B3:6 | B5:4 G4:2 A4:4 F#4:4 G4:4 E4:4 F#4:4 D4:6 | B5:4 G4:2 A4:4 F#4:4 G4:4 F#4:4 E4:4 D#4:10 | -:8 A4:4 | D#4:4 B3:2 C#4:2 -:2 A#3:2 -:2 B3:2 -:2 G#3:2 -:2 A#3:2 -:2 F#3:4 -:2 | D#4:4 B3:2 C#4:2 -:2 A#3:2 -:2 B3:2 -:2 A#3:2 -:2 G#3:2 -:2 F#3:4 -:2 | D#5:4 B3:2 C#4:2 -:2 A#3:2 -:2 B3:2 -:2 G#3:2 -:2 A#3:2 -:2 F#3:4 -:2 | D#5:4 B3:2 C#4:2 -:2 A#3:2 -:2 B3:2 -:2 A#3:2 -:2 G#3:2 -:2 F#3:4 -:2 | D#5:4 B4:2 C#5:2 -:2 A#4:2 -:2 B4:2 -:2 G#4:2 -:2 A#4:2 -:2 F#4:4 -:2 | D#5:4 B4:2 C#5:2 -:2 A#4:2 -:2 B4:2 -:2 A#4:2 -:2 G#4:2 -:2 F#4:4 -:2 | D#6:4 B5:2 C#6:2 -:2 A#5:2 -:2 B5:2 -:2 G#5:2 -:2 A#5:2 -:2 F#5:4 -:2 | D#6:4 B5:2 C#6:2 -:2 A#5:2 -:2 B5:2 -:2 A#5:2 -:2 G#5:2 -:2 G5:4 -:2 | G#4:6 G#5:2 G#5:2 G#5:2 A#5:2 B5:2 A#5:2 G#5:2 G5:8 D#5:2 D#5:2 | G#5:2 G#5:2 G#6:2 G#5:2 A#5:2 A#5:2 A#6:2 A#5:2 B5:2 B5:2 B6:2 B5:2 C6:2 D#6:2 D#7:2 C#6:4 | C#6:2 C#6:2 G#5:4 C#6:4 B5:4 B5:2 B5:2 F#5:4 B5:4 C#6:4 | C#6:2 C#6:2 C#6:2 A5:4 C#6:2 C#6:2 C#6:4 -:4 C4:1 -:1 D#4:1 -:1 G#4:1 -:1 C5:1 -:1 | C#5:2 C#5:2 E5:2 D#5:4 B4:2 B4:2 C#5:4 C#5:2 E5:2 D#5:4 B4:6 | C#5:2 C#5:2 E5:2 D#5:4 C#5:2 B4:2 C#5:6 B4:2 G#4:4 B4:6 | C#5:2 C#5:2 E5:2 D#5:4 B4:2 B4:2 C#5:4 C#5:2 E5:2 D#5:4 B4:6 | C#5:2 C#5:2 E5:2 D#5:4 C#5:2 B4:2 B4:4 G#5:6 F#5:4 C6:4 | C#6:4 E6:2 D#6:4 B5:2 B5:2 C#6:4 C#6:2 E6:2 D#6:4 B5:6 | C#6:2 C#6:2 E6:2 D#6:4 C#6:2 B5:2 C#6:6 B5:2 G#5:4 B5:6 | C#6:2 C#6:2 E6:2 D#6:4 B5:2 B5:2 C#6:4 C#6:2 E6:2 D#6:4 B5:6 | C#6:2 C#6:2 E6:2 D#6:4 C#6:2 B5:2 C#6:2 | G#5:4 E4:2 F#4:4 D#4:4 E4:4 C#4:4 D#4:4 B3:6 | G#5:4 E4:2 F#4:4 D#4:4 E4:4 D#4:4 C#4:4 B3:6 | B5:4 G4:2 A4:4 F#4:4 G4:4 E4:4 F#4:4 D4:6 | B5:4 G4:2 A4:4 F#4:4 G4:4 F#4:4 E4:4 D4:6 | B5:4 G5:2 A5:4 F#5:4 G5:4 E5:4 F#5:4 D5:6 | B5:4 G5:2 A5:4 F#5:4 G5:4 F#5:4 E5:4 D5:6 | D6:4 A#5:2 C6:4 A5:4 A#5:4 G5:4 A5:4 F5:6 | D6:4 A#5:1 -:1 C6:4 A5:1 -:1 A#5:16 -:4 | G3:2 A3:2 A#3:1 -:1 D4:1 -:1 G4:2 A4:2 A#4:1 -:1 D5:1 -:1 G5:2 A5:2 A#5:1 -:1 D6:1 -:1 G6:2 A6:2 A#6:1 -:1 D7:1 -:1 | G7:14 -:2 G5:16 | G3:29 -:3' },
      { wave: 'thin', volume: 0.18, pluck: true, notes: 'G#4:2 G#4:2 E4:2 D#4:4 B3:2 B3:2 E4:4 C#4:2 E4:2 D#4:4 B3:6 | E5:4 -:28 | E5:4 -:28 | G5:4 -:28 | G5:4 -:28 | -:12 F#4:4 | B3:4 -:28 | B3:4 -:28 | B4:4 -:28 | B4:4 -:28 | B4:4 B3:2 C#4:2 -:2 A#3:2 -:2 B3:2 -:2 G#3:2 -:2 A#3:2 -:2 F#3:4 -:2 | B4:4 B3:2 C#4:2 -:2 A#3:2 -:2 B3:2 -:2 A#3:2 -:2 G#3:2 -:2 F#3:4 -:2 | B5:4 B4:2 C#5:2 -:2 A#4:2 -:2 B4:2 -:2 G#4:2 -:2 A#4:2 -:2 F#4:4 -:2 | B5:4 B4:2 C#5:2 -:2 A#4:2 -:2 B4:2 -:2 A#4:2 -:2 G#4:2 -:2 G4:4 -:2 | B3:6 B4:2 B4:2 B4:2 A#4:2 B4:2 A#4:2 G#4:2 D#5:8 D#4:2 D#4:2 | D#5:8 F#5:8 F#5:8 F#5:8 | -:2 G#5:2 G#5:2 G#4:4 C#5:4 F#5:4 F#5:2 F#5:2 F#4:4 B4:4 E5:4 | E5:2 E5:2 E5:2 C#5:4 C#5:2 C#5:2 A#5:4 -:4 C3:1 -:1 D#3:1 -:1 G#3:1 -:1 C4:1 -:1 | G#4:2 G#4:2 E4:2 D#4:4 B3:2 B3:2 E4:4 C#4:2 E4:2 D#4:4 B3:6 | E4:2 E4:2 E4:2 D#4:4 C#4:2 B3:2 C#4:6 B3:2 G#3:4 B3:6 | G#4:2 G#4:2 E4:2 D#4:4 B3:2 B3:2 E4:4 C#4:2 E4:2 D#4:4 B3:6 | E4:2 E4:2 E4:2 D#4:4 C#4:2 B3:2 B3:4 E5:6 D#5:4 G#5:4 | G#5:4 E5:2 D#5:4 B4:2 B4:2 G#5:4 C#5:2 E5:2 D#5:4 B4:6 | E5:2 E5:2 E5:2 D#5:4 C#5:2 B4:2 C#5:6 B4:2 G#4:4 B4:6 | G#5:2 G#5:2 E5:2 D#5:4 B4:2 B4:2 E5:4 C#5:2 E5:2 D#5:4 B4:6 | C#5:2 C#5:2 E5:2 D#5:4 C#5:2 B4:2 C#5:18 | -:16 | E5:4 -:28 | G5:4 -:28 | G5:4 -:28 | G5:4 G4:2 A4:4 F#4:4 G4:4 E4:4 F#4:4 D4:6 | G5:4 G4:2 A4:4 F#4:4 G4:4 F#4:4 E4:4 D4:6 | A#5:4 A#4:2 C5:4 A4:4 A#4:4 G4:4 A4:4 F4:6 | A#5:4 A#4:1 -:1 C5:4 A4:1 -:1 A#4:16 -:4 | D3:7 -:1 D4:7 -:1 D5:7 -:1 D6:7 -:1 | D7:14 -:2 D5:16 | D3:29 -:3' },
      { wave: 'triangle', volume: 0.18, pluck: true, notes: 'C#2:14 A1:8 B1:4 B2:2 F#3:2 B3:2 | -:2 C#2:2 C#3:2 G#3:2 C#2:2 C#3:2 C#3:2 G#3:2 C#2:2 C#3:2 C#3:2 G#3:2 C#2:2 C#3:2 B1:2 B2:2 | A1:2 A2:2 A2:2 E3:2 A1:2 A2:2 A2:2 E3:2 A1:2 A2:2 A2:2 E3:2 A1:2 A2:2 B1:2 B2:2 | E2:2 E3:2 E3:2 G3:2 E2:2 E3:2 E3:2 G3:2 E2:2 E3:2 E3:2 G3:2 E2:2 E3:2 D2:2 D3:2 | C2:2 C3:2 C3:2 G3:2 C2:2 C3:2 C3:2 G3:2 C2:2 C3:2 C3:2 G3:2 B1:4 B2:8 | -:7 D#2:1 A#2:4 | G#2:2 D#3:2 G#2:2 D#3:2 G#2:2 D#3:2 G#2:2 D#3:2 G#2:2 D#3:2 G#2:2 D#3:2 G#2:2 D#3:2 F#2:2 C#3:2 | E2:2 B2:2 E2:2 B2:2 E2:2 B2:2 E2:2 B2:2 E2:2 B2:2 E2:2 B2:2 E2:2 B2:2 F#2:2 C#3:2 | G#2:2 D#3:2 G#2:2 D#3:2 G#2:2 D#3:2 G#2:2 D#3:2 G#2:2 D#3:2 G#2:2 D#3:2 G#2:2 D#3:2 F#2:2 C#3:2 | E2:2 B2:2 E2:2 B2:2 E2:2 B2:2 E2:2 B2:2 E2:2 B2:2 E2:2 B2:2 E2:2 B2:2 F#2:2 C#3:2 | G#1:2 D#2:2 G#1:2 D#2:2 G#1:2 D#2:2 G#1:2 D#2:2 G#1:2 D#2:2 G#1:2 D#2:2 G#1:2 D#2:2 F#1:2 F#2:2 | E1:2 B1:2 E1:2 B1:2 E1:2 B1:2 E1:2 B1:2 E1:2 B1:2 E1:2 B1:2 E1:2 B1:2 F#1:2 F#2:2 | G#1:2 D#2:2 G#1:2 D#2:2 G#1:2 D#2:2 G#1:2 D#2:2 G#1:2 D#2:2 G#1:2 D#2:2 G#1:2 D#2:2 F#1:2 F#2:2 | E1:2 B1:2 E1:2 B1:2 E1:2 B1:2 E1:2 B1:2 E1:2 B1:2 E1:2 B1:2 D#2:4 D#2:4 | E1:2 E2:2 E3:2 G#3:2 B3:2 E4:6 D#2:2 D#2:2 D#3:2 G3:2 A#3:2 D#4:6 | G#1:2 G#2:2 D#3:2 G#3:2 A#1:2 A#2:2 F#3:2 A#3:2 B1:2 B2:2 F#3:2 B3:2 C2:2 D#3:2 G#3:2 C#2:4 | C#3:2 G#3:2 C#4:4 C#4:2 G#3:2 B1:4 B2:2 F#3:2 B3:4 B3:2 F#3:2 B2:2 | A1:2 A2:2 E3:2 A3:2 C#4:2 A3:2 E3:2 A2:2 G#1:3 G#2:1 G#3:4 G#2:1 -:1 D#2:1 -:1 C2:1 -:1 G#1:1 -:1 | C#2:2 C#3:2 G#3:2 E4:4 C#4:2 G#3:2 A1:4 A2:2 E3:2 C#4:4 A3:2 E3:2 A2:2 | B1:2 B2:2 F#3:2 B3:4 B3:2 F#3:2 E2:4 B2:2 E3:2 D#2:4 B2:2 D#3:2 B2:2 | C#2:2 C#3:2 G#3:2 E4:4 C#4:2 G#3:2 A1:4 A2:2 E3:2 C#4:4 A3:2 E3:2 A2:2 | B1:2 B2:2 F#3:2 B3:4 B3:2 F#3:2 E1:3 E3:1 B3:6 D#2:4 C2:4 | C#2:2 C#3:2 G#3:2 E4:4 C#4:2 G#3:2 A1:4 A2:2 E3:2 C#4:4 A3:2 E3:2 A2:2 | B1:2 B2:2 F#3:2 D#4:4 B3:2 F#3:2 E1:4 E3:2 G#3:2 D#2:4 D#3:2 F#4:2 B3:2 | C#2:2 C#3:2 G#3:2 E4:4 C#4:2 G#3:2 A1:4 A2:2 E3:2 C#4:4 A3:2 E3:2 A2:2 | B1:2 B2:2 F#3:2 D#4:4 B3:2 F#3:2 B2:2 | -:2 C#2:2 C#3:2 G#3:2 C#2:2 C#3:2 C#3:2 G#3:2 C#2:2 C#3:2 C#3:2 G#3:2 C#2:2 C#3:2 B1:2 B2:2 | A1:2 A2:2 A2:2 E3:2 A1:2 A2:2 A2:2 E3:2 A1:2 A2:2 A2:2 E3:2 A1:2 A2:2 B1:2 B2:2 | E2:2 E3:2 E3:2 B3:2 E2:2 E3:2 E3:2 B3:2 E2:2 E3:2 E3:2 B3:2 E2:2 E3:2 D2:2 D3:2 | C2:2 C3:2 C3:2 G3:2 C2:2 C3:2 C3:2 G3:2 C2:2 C3:2 C3:2 G3:2 C2:2 C3:2 D2:2 D3:2 | E1:2 E2:2 E2:2 B2:2 E1:2 E2:2 E2:2 B2:2 E1:2 E2:2 E2:2 B2:2 E1:2 E2:2 -:2 D2:2 | -:2 C2:2 C2:2 G2:2 -:2 C2:2 C2:2 G2:2 -:2 C2:2 C2:2 G2:2 -:2 C2:2 -:2 D2:2 | G1:2 G2:2 G2:2 D3:2 G1:2 G2:2 G2:2 D3:2 G1:2 G2:2 G2:2 D3:2 G1:2 G2:2 F1:2 F2:2 | D#2:4 G3:1 -:1 D#2:4 G3:1 -:1 D#2:16 -:4 | G1:2 F1:2 -:4 G1:2 F1:2 -:4 G1:2 F1:2 -:4 G1:2 F1:2 -:4 | G1:14 -:1 D#2:1 A#3:16 | G1:29 -:3' },

      // The left hand's second note, and what neither hand's first two voices take.
      { wave: 'triangle', volume: 0.14, pluck: true, notes: 'C#3:14 A2:8 B2:4 -:6 | -:6 C#4:2 -:6 C#4:2 -:6 C#4:2 -:8 | -:6 A3:2 -:6 A3:2 -:6 A3:2 -:8 | -:6 B3:2 -:6 B3:2 -:6 B3:2 -:8 | -:6 C4:2 -:6 C4:2 -:6 C4:2 B2:4 D#3:8 | -:7 G2:5 | -:32 | -:32 | -:32 | -:32 | -:2 D#3:2 -:2 D#3:2 -:2 D#3:2 -:2 D#3:2 -:2 D#3:2 -:2 D#3:2 -:2 D#3:2 -:4 | -:2 B2:2 -:2 B2:2 -:2 B2:2 -:2 B2:2 -:2 B2:2 -:2 B2:2 -:2 B2:2 -:4 | -:2 D#3:2 -:2 D#3:2 -:2 D#3:2 -:2 D#3:2 -:2 D#3:2 -:2 D#3:2 -:2 D#3:2 -:4 | -:2 B2:2 -:2 B2:2 -:2 B2:2 -:2 B2:2 -:2 B2:2 -:2 B2:2 -:4 A#2:4 | E2:2 -:30 | G#2:4 -:4 A#2:4 -:4 B2:4 -:4 C3:8 | -:14 B2:4 -:14 | A2:2 -:14 G#2:4 -:12 | -:14 A2:6 -:12 | B2:4 -:10 E3:8 D#3:8 -:2 | -:14 A2:6 -:12 | B2:4 -:10 E2:10 D#3:4 C3:4 | -:32 | -:14 E2:8 -:10 | -:32 | -:16 | -:6 C#4:2 -:6 C#4:2 -:6 C#4:2 -:8 | -:6 A3:2 -:6 A3:2 -:6 A3:2 -:8 | -:6 E4:2 -:6 E4:2 -:6 E4:2 -:8 | -:6 C4:2 -:6 C4:2 -:6 C4:2 -:8 | -:6 E3:2 -:6 E3:2 -:6 E3:2 -:8 | -:6 C3:2 -:6 C3:2 -:6 C3:2 -:8 | -:6 G3:2 -:6 G3:2 -:6 G3:2 -:8 | -:4 A#3:1 -:5 A#3:1 -:21 | -:32 | -:16 D4:16 | -:32' },
      { wave: 'thin', volume: 0.12, pluck: true, notes: 'E4:2 E4:2 -:10 C#4:4 -:14 | C#5:4 -:28 | C#5:4 -:28 | E5:4 -:2 E4:2 -:6 E4:2 -:6 E4:2 -:8 | E5:4 -:24 F#3:8 | -:8 D#4:4 | G#3:4 -:28 | G#3:4 -:28 | G#4:4 -:28 | G#4:4 -:28 | G#4:4 -:28 | G#4:4 -:28 | G#5:4 -:28 | G#5:4 -:24 D#3:4 | G#3:6 G#4:2 G#4:2 G#4:2 -:8 A#4:8 -:4 | B4:8 C#5:8 D#5:8 D#5:8 | -:2 E5:2 E5:2 -:8 D#5:4 D#5:2 D#5:2 -:8 C#5:4 | C#5:2 C#5:2 C#5:2 A4:4 -:4 D#5:4 -:12 | E4:2 E4:2 -:10 C#4:4 -:14 | C#4:2 C#4:2 -:28 | E4:2 E4:2 -:10 C#4:4 -:14 | C#4:2 C#4:2 -:13 G#3:7 C5:4 D#5:4 | E5:4 -:10 E5:4 -:14 | C#5:2 C#5:2 -:16 B3:2 -:10 | E5:2 E5:2 -:10 C#5:4 -:14 | -:16 | G#4:4 -:28 | C#5:4 -:28 | E5:4 -:28 | E5:4 -:28 | E5:4 -:28 | E5:4 -:28 | G5:4 -:28 | G5:4 D#4:1 -:5 D#4:1 -:21 | A#2:5 -:1 D3:2 A#3:5 -:1 D4:2 A#4:5 -:1 D5:2 A#5:5 -:1 D6:2 | A#6:14 -:2 A#4:16 | A#2:29 -:3' },
    ],
  },
  /**
   * Ichiban no Takaramono, from the anime Angel Beats!, by ANANT-GARDE EYES & Maeda Jun (as the MIDI's text event
   * names them); converted here from a MIDI file linked from sheet.host (page mbqUWS); reduced to five chiptune
   * voices and quantized.
   *
   * HOW IT WAS CONVERTED (the MIDI is not in the repository; the rules of always-in-my-heart above): its tempo, 108
   * a minute, as `bpm: 108`, a step a sixteenth (240 of the MIDI's 960 ticks a quarter), its bars as its time
   * signatures make them (4/4 16 steps; the last bar is 6/4, padded to 32 steps for the multiple of 16). The MIDI
   * slows down over its last bars (to 82.6); one bpm cannot follow that, so the piece plays at 108 throughout (its
   * length within a second of the MIDI's). Onsets rounded to the nearest step (all but 10 exact, those within 65 ms).
   * The MIDI has one track for both hands: middle C and up is the right hand, below it the left; the 7 notes
   * under 40 Hz (D#1) are left out; five voices one note at a time as for the other MIDI pieces; 14 of 822
   * notes found no free voice. No velocities or pedal: `levelled` sets the loudness (content/ichiban.test.ts).
   */
  'ichiban-no-takaramono': {
    bpm: 108,
    loop: false,
    voices: [
      { wave: 'pulse', volume: 0.2, pluck: true, notes: 'C6:4 G5:2 F5:4 C6:6 | C6:4 G5:2 F5:4 C6:6 | C6:4 G5:2 F5:4 C6:6 | C6:4 G5:2 F5:10 | C6:4 G5:2 F5:4 C6:6 | C6:4 G5:2 F5:4 C6:6 | C6:4 G5:2 F5:4 C6:6 | C6:8 G5:8 | -:4 A4:2 A#4:2 C5:4 A#4:2 C5:4 | A4:2 G4:2 F4:10 | C4:2 -:2 A4:2 A#4:2 C5:4 A#4:2 C5:4 | E5:2 F5:2 E5:2 E4:8 | -:4 A4:2 A#4:2 C5:4 A#4:2 C5:4 | A4:2 G4:2 F4:8 F4:2 | G4:6 A4:10 | F#4:4 A4:4 F#4:1 D5:1 A4:2 A#4:2 A4:2 | C5:4 D5:2 C5:2 D4:2 E5:4 F5:4 | C5:4 F5:4 G5:4 A5:4 | A#5:4 A5:4 F5:4 C5:4 | F5:2 F5:6 A5:2 A#5:4 | C6:4 G5:2 F5:2 F4:2 D5:4 C5:4 | F5:2 F5:6 A5:2 A#5:4 | C6:4 G5:2 F5:4 D#5:4 F5:4 | A5:2 A#5:6 A5:2 A#5:4 | D5:1 C6:5 D4:2 F4:2 D4:4 -:2 | -:2 C5:2 A4:2 A#4:2 F4:2 D4:4 -:2 | -:2 C5:2 A4:2 A#4:2 F4:2 D4:4 -:2 | F4:8 G4:2 A5:4 G#5:2 | A5:4 E5:2 D5:2 C#4:2 A5:4 B5:4 | C#6:6 E4:2 A5:4 G#5:2 | A5:4 E5:2 D5:2 E4:2 A5:4 B5:4 | C#6:6 C#4:2 A5:4 G#5:2 | A5:4 E5:2 D5:2 C#4:2 A5:4 B5:4 | C#6:6 A5:2 B5:4 A5:4 | D5:4 C#5:4 B4:4 B4:4 | A4:2 A4:6 A5:4 G#5:2 | A5:4 E5:2 D5:2 C#4:2 A5:4 B5:4 | C#6:6 E4:2 A5:2 D4:2 G#5:2 | A5:4 E5:2 D5:2 E4:2 A5:4 B5:4 | C#6:2 A5:6 A5:4 G#5:2 | A5:4 E5:2 D5:2 C#4:2 A5:4 B5:4 | C#6:6 A5:2 B5:2 D4:2 A5:4 | D5:4 C#5:4 B4:4 B4:4 | A4:2 A4:4 C#4:2 A4:4 G#4:2 | A4:4 E4:2 D4:4 A4:4 B4:4 | C#5:8 A4:4 G#4:2 | A4:4 E4:2 D4:4 A4:4 B4:4 | C#5:8 A4:4 G#4:2 | A4:4 E4:2 D4:4 A4:4 B4:4 | C#5:6 A4:2 B4:4 A4:4 | D4:4 C#4:4 -:6 | -:10 A#5:4 A5:2 | A#5:4 F5:2 D#5:2 G4:2 A#5:4 C6:4 | D6:6 D4:2 A#5:4 A5:2 | A#5:4 F5:2 D#5:2 C4:2 A#5:4 C6:4 | D6:8 A#5:4 A5:2 | A#5:4 F5:2 D#5:2 G4:2 A#5:4 C6:4 | D6:6 A#5:2 C6:4 A#5:4 | D#5:4 D5:4 C5:4 C5:4 | A#4:2 A#4:6 A#5:4 A5:2 | A#5:4 F5:2 D#5:2 G4:2 A#5:4 C6:4 | D6:6 D4:2 A#5:4 A5:2 | A#5:4 F5:2 D#5:4 A#5:4 C6:4 | D6:2 A#5:6 A#5:4 A5:2 | A#5:4 F5:2 D#5:2 G4:2 A#5:4 C6:4 | D6:6 A#5:2 C6:4 A#5:4 | D#5:4 D5:2 C4:2 C5:4 C5:4 | A#4:2 A#4:6 A#4:4 A4:2 | A#4:4 F4:2 D#4:2 D4:2 F4:2 D#4:2 C5:2 | D4:2 D5:8 A#4:3 C5:3 | A#4:4 D#4:4 D4:4 C4:4 | -:32' },
      { wave: 'thin', volume: 0.18, pluck: true, notes: 'F5:4 -:12 | G5:4 -:12 | F5:4 -:12 | F5:4 -:12 | F5:4 -:12 | G5:4 -:12 | F5:4 -:12 | F5:8 E5:8 | -:4 F4:2 -:10 | -:16 | -:4 F4:12 | -:8 C4:8 | -:4 F4:2 -:10 | -:2 F4:2 -:12 | D4:6 E4:10 | D4:4 D4:4 -:1 A4:1 -:6 | F4:4 -:2 F4:4 -:6 | -:2 F4:4 -:8 D5:4 | -:4 D5:4 -:6 | -:16 | F5:4 -:4 D4:8 | -:16 | F5:4 -:12 | -:16 | -:1 F5:15 | -:6 D4:2 -:8 | -:6 D4:2 -:8 | D4:8 E4:2 A4:4 G#4:2 | A4:4 -:10 E5:4 | -:8 A4:4 G#4:2 | A4:4 -:10 E5:4 | -:8 A4:4 G#4:2 | A4:4 -:10 E5:4 | -:6 E4:8 | -:16 | -:10 A4:4 G#4:2 | A4:4 -:10 E5:4 | -:8 A4:4 G#4:2 | A4:4 -:10 E5:4 | -:2 C#4:2 -:4 A4:4 G#4:2 | A4:4 -:10 E5:4 | -:6 E4:4 -:4 | -:16 | -:16 | -:14 E4:4 | -:8 D4:4 -:2 | D4:4 -:10 E4:4 | -:8 C#4:4 -:2 | C#4:4 -:10 E4:4 | -:14 | -:16 | -:10 A#4:4 A4:2 | A#4:4 A#4:2 A#4:4 A#4:4 C5:4 | A#5:8 A#4:4 A4:2 | A#4:4 A#4:2 A#4:4 A#4:4 C5:4 | D5:8 A#4:4 A4:2 | A#4:4 A#4:2 A#4:4 A#4:4 C5:4 | A#5:6 A#4:2 C5:4 A#4:4 | A#4:4 A#4:4 -:6 | -:2 F4:2 F4:6 A#4:4 A4:2 | A#4:4 A#4:2 A#4:4 A#4:4 C5:4 | A#5:8 A#4:4 A4:2 | A#4:4 A#4:2 A#4:4 A#4:4 C5:4 | D5:2 A#4:6 A#4:4 A4:2 | A#4:4 A#4:2 A#4:4 A#4:4 C5:4 | A#5:6 A#4:2 C5:4 A#4:4 | A#4:4 A#4:4 -:6 | -:2 F4:2 F4:6 -:6 | -:14 D#4:4 | -:14 | D#4:4 C4:4 -:8 | -:32' },
      { wave: 'triangle', volume: 0.18, pluck: true, notes: '-:16 | -:16 | -:16 | F3:12 F3:4 | A#2:16 | C3:16 | D3:16 | D3:8 C3:8 | A#2:4 F3:4 A3:8 | C3:12 A#2:4 | A2:2 A3:2 A3:12 | F2:4 C3:4 F3:8 | A#2:2 F3:2 A3:12 | C3:2 A#3:14 | D3:4 A3:12 | D2:2 A2:2 D3:2 E3:2 F#3:4 A3:4 | F3:8 F3:8 | A2:2 F3:6 A3:8 | A#2:4 F3:4 A#3:8 | A2:8 A3:8 | G2:4 F3:4 A#3:8 | A2:4 F3:4 A3:8 | G#2:4 F3:4 F3:8 | A#2:8 C3:8 | A#2:2 F3:2 A#3:2 -:8 A#3:2 | A#2:2 F3:2 A#3:2 -:8 A#3:2 | A#2:2 F3:2 A#3:2 -:8 A#3:2 | A#2:8 C3:4 C2:4 | F#1:4 C#3:4 F#3:8 | D2:4 D3:4 D3:8 | E2:4 E3:4 G#3:8 | A2:4 E3:4 -:4 G#2:4 | F#2:4 C#3:4 F#3:8 | D2:4 D3:4 D3:8 | E2:4 B2:4 E3:8 | A1:2 E2:2 A2:2 B2:2 C#3:4 G#1:4 | F#1:4 C#3:4 F#3:8 | D2:4 D3:4 D3:4 D3:4 | E2:4 E3:4 G#3:4 E3:4 | A2:2 E3:2 -:2 A3:2 G#2:2 E3:2 G#3:2 G#3:2 | F#2:4 C#3:4 F#3:4 F#3:2 F#2:2 | D2:4 D3:4 D3:4 D3:4 | E2:4 B2:4 E3:8 | A2:2 E3:2 A3:2 B3:2 -:4 A3:4 | F#2:4 F#3:4 A3:8 | D3:16 | E2:4 B2:4 E3:8 | A2:12 G#2:4 | F#2:4 C#3:4 C#3:8 | D2:4 A2:4 D3:8 | E2:4 B2:4 E3:2 B3:4 B3:2 | A1:2 E2:2 A2:2 B2:2 C#3:4 A1:4 | G1:4 G3:4 A#3:8 | D#2:4 D#3:4 D#3:8 | F1:4 C3:4 F3:4 C3:4 | A#1:2 F2:2 A#2:2 D3:2 A1:2 F2:2 A2:2 C3:2 | G1:4 G3:4 A#3:4 G1:4 | D#2:4 D#3:2 A#3:2 D#3:4 D#2:2 -:2 | F1:2 C2:2 F2:2 A2:2 C3:4 F3:4 | A#1:2 F2:2 A#2:2 D3:2 F3:2 A#3:2 A#1:2 A1:2 | G1:4 G3:4 A#3:4 G2:2 G1:2 | D#2:4 D#3:2 A#3:2 D#3:4 D#2:2 -:2 | F1:2 C2:2 F2:4 F2:4 C3:4 | A#1:2 F2:2 A#2:2 D3:2 A1:2 F2:2 A2:2 C3:2 | G1:4 G3:4 A#3:4 G1:4 | D#2:4 D#3:2 A#3:2 D#3:4 D#2:2 -:2 | F1:8 C3:8 | A#1:2 F2:2 A#2:2 D3:2 F3:4 A#3:4 | G2:8 -:2 A#3:6 | D#3:16 | F2:8 A#3:4 -:4 | A#1:1 A#2:1 D3:1 A#3:21 -:8' },

      // The left hand's second note, and what neither hand's first two voices take.
      { wave: 'triangle', volume: 0.14, pluck: true, notes: '-:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | A#3:12 -:4 | -:16 | -:8 A3:8 | -:16 | A#3:4 -:12 | -:16 | A3:4 -:12 | A#3:8 A#3:8 | -:16 | -:16 | F3:8 -:8 | F3:4 -:12 | -:16 | -:16 | F3:8 G3:8 | -:16 | -:16 | -:16 | -:16 | F#2:4 -:4 A3:8 | D3:4 -:4 F#3:8 | -:8 B3:8 | -:16 | -:8 A3:8 | D3:4 -:4 F#3:8 | -:16 | -:12 G#2:4 | F#2:4 -:4 A3:8 | D3:4 -:4 F#3:4 F#3:4 | -:8 B3:4 -:4 | -:14 B3:2 | -:8 A3:4 -:4 | D3:4 -:4 F#3:4 F#3:4 | -:8 G#3:8 | -:16 | -:16 | F#3:16 | -:8 G#3:8 | E3:12 E3:4 | -:8 F#3:8 | -:16 | -:16 | -:2 A3:2 A3:6 -:2 A2:4 | G2:4 -:12 | -:8 A#3:8 | -:8 A3:4 -:4 | -:16 | G2:4 -:8 G2:4 | -:8 A#3:4 -:4 | -:16 | -:12 A#2:2 A2:2 | G2:4 -:12 | -:8 A#3:4 -:4 | -:8 A2:4 F3:4 | -:16 | G2:4 -:8 G2:4 | -:8 A#3:4 -:4 | F2:8 F3:8 | -:16 | D3:8 -:8 | G3:16 | C3:16 | F2:24 -:8' },
      { wave: 'thin', volume: 0.12, pluck: true, notes: 'D5:4 -:12 | E5:4 -:12 | D5:4 -:12 | D5:4 -:12 | D5:4 -:12 | E5:4 -:12 | D5:4 -:12 | D5:8 C5:8 | -:4 D4:2 -:10 | -:16 | -:4 C4:12 | -:16 | -:4 D4:2 -:10 | -:16 | -:6 C4:10 | -:16 | D4:8 -:8 | -:16 | -:16 | A3:8 -:8 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:8 C4:2 -:6 | -:16 | -:8 A3:8 | -:16 | -:16 | -:16 | -:8 A3:8 | -:16 | -:16 | -:16 | -:8 A3:4 A3:4 | -:16 | -:16 | -:16 | -:8 A3:4 A3:4 | -:8 B3:8 | -:16 | -:16 | -:16 | -:8 B3:8 | -:16 | -:8 A3:8 | -:16 | -:16 | -:16 | -:8 D4:8 | -:2 G5:8 -:6 | -:16 | -:16 | -:8 D4:4 -:4 | -:2 G5:6 D4:4 -:4 | -:16 | -:2 D4:2 D4:6 -:6 | -:8 D4:4 -:4 | -:2 G5:8 -:6 | -:8 C3:4 -:4 | -:16 | -:8 D4:4 -:4 | -:2 G5:6 D4:4 -:4 | -:8 A3:8 | -:2 D4:2 D4:6 -:6 | G3:8 -:8 | A#3:16 | C4:4 -:12 | -:1 C3:23 -:8' },
    ],
  },
  /**
   * Bauklotze, full piano version, by Hiroyuki Sawano (as the user states); converted here from a MIDI file linked
   * from sheet.host (page ZBNZH5); reduced to five chiptune voices and quantized.
   *
   * HOW IT WAS CONVERTED (the MIDI is not in the repository; the rules of always-in-my-heart above): the MIDI keeps
   * 90 a minute but slows many times, some of them deeply to hold a chord; the format takes one bpm, so every note's
   * time is worked out in seconds through that tempo map and rounded to a fixed grid, `bpm: 180`, a step of 83.3 ms,
   * a 32nd note at 90, so the steady parts sit on the grid exactly (41 ms at most elsewhere). A bar line `|` every 32
   * steps, a bar of 4/4 at 90: a line of the data that drifts from the music's bars after a slowing. The MIDI has one
   * track for both hands: middle C and up is the right hand, below it the left; five voices one note at a time as for
   * the other MIDI pieces; 0 of 1468 notes found no free voice. No velocities or pedal: `levelled` sets the
   * loudness (content/bauklotze.test.ts checks the result).
   */
  'bauklotze': {
    bpm: 180,
    loop: false,
    voices: [
      { wave: 'pulse', volume: 0.2, pluck: true, notes: 'D5:4 D5:4 C#5:2 B4:2 F#4:2 D5:4 D5:4 C#5:4 B4:2 F#4:4 | D5:4 D5:4 C#5:2 B4:2 F#4:2 D5:4 D5:4 C#5:4 B4:2 F#4:4 | D5:4 D5:4 C#5:2 B4:2 F#4:2 D5:4 D5:4 C#5:4 B4:2 F#4:4 | D5:4 D5:4 C#5:2 B4:2 F#4:2 D5:4 D5:4 C#5:4 B4:2 F#4:4 | B4:8 B4:2 D5:2 D5:2 C#5:2 C#4:2 C#5:4 B4:2 C#5:4 B4:2 C#5:2 | C#5:16 C#4:4 -:4 B4:2 C#5:4 D5:2 | C#5:8 B4:12 B4:2 C#5:4 B4:4 C#5:2 | C#5:8 F#4:16 -:8 | B4:9 B4:1 -:1 D5:2 D5:1 C#5:2 C#4:3 C#5:3 B4:2 C#5:4 B4:2 C#5:2 | C#5:16 C#4:4 -:4 B4:8 | G5:9 D5:4 D5:3 C#5:8 B4:8 | F#5:9 D5:3 -:1 E5:3 -:2 C#5:6 A#4:9 | F#5:8 G5:8 F#5:12 B4:3 | -:1 C#5:8 D5:8 G5:8 -:7 | -:1 F#5:16 B4:4 C#5:4 D5:4 F#4:3 | -:1 G4:18 F#4:30 | -:5 F#5:4 C#6:6 | D4:2 F#4:2 B4:2 F#4:2 D4:2 -:8 D6:4 C#6:10 | C#4:2 E4:2 A4:2 E6:2 C#4:2 E6:4 D6:8 C#6:14 | D4:2 A5:2 D4:2 -:4 F#5:8 D6:8 B5:2 | C#4:2 D6:2 C#4:2 -:8 C#6:8 D6:5 C#6:4 B5:2 | D4:2 C#6:2 B4:2 F#4:2 D4:2 D6:8 F#5:3 -:1 D6:4 E6:4 C#6:2 | C#4:2 B5:2 A4:2 E4:2 C#4:2 F#5:8 E5:3 -:1 F#5:4 B5:4 D6:2 | D4:2 G4:2 -:2 C#6:8 B5:4 C#6:3 -:1 C#6:4 D6:2 E4:2 C#6:2 | E4:2 C#4:2 -:2 A5:8 C#6:62 |  | D5:4 D5:4 C#5:2 B4:2 F#4:2 D5:4 D5:3 | -:1 C#5:3 -:1 B4:1 -:1 F#4:3 -:1 D5:4 D5:4 C#5:2 B4:2 F#4:2 D5:4 D5:3 | -:1 C#5:3 -:1 B4:1 -:1 F#4:3 -:1 D5:4 D5:4 C#5:2 B4:2 F#4:2 D5:4 D5:3 | -:1 C#5:3 -:1 B4:1 -:1 F#4:3 -:1 D5:4 D5:4 C#5:2 B4:2 F#4:2 D5:5 | D5:4 -:1 C#5:5 B4:2 F#4:17 -:3 | -:4 E4:4 F#4:6 C#5:6 D5:3 -:1 C#5:8 | A4:4 A4:32 | E4:4 F#4:6 C#5:6 D5:4 C#5:8 | B4:4 B4:32 | B4:5 B4:6 A4:5 E4:4 A4:8 | F#4:4 -:1 F#4:32 | F#4:4 F#4:6 A4:6 F#4:4 A4:8 | B4:4 B4:32 | C#5:4 C#5:6 A4:6 F#4:4 C#5:8 | A4:4 A4:32 | E4:4 -:1 F#4:6 C#5:6 D5:3 -:1 E5:8 | D5:4 D5:32 | E4:4 E4:6 A4:6 E4:4 E4:8 | F#4:4 F#4:32 | F#4:9 D4:8 C#4:15 | D4:17 E5:5 A5:6 | E5:4 A5:7 B5:6 B5:15 | -:4 D5:5 D5:4 C#5:1 -:1 B4:1 -:1 F#4:1 D5:5 D5:3 C#5:4 | B4:2 F#4:4 D5:5 D5:3 -:1 C#5:1 -:1 B4:1 -:1 F#4:1 D5:5 D5:3 C#5:4 | B4:2 F#4:4 D5:5 D5:3 -:1 C#5:1 -:1 B4:1 -:1 F#4:1 D5:5 D5:3 C#5:4 | B4:2 F#4:4 D5:5 D5:3 -:1 C#5:1 -:1 B4:1 -:1 F#4:1 D5:5 D5:3 C#5:4 | -:1 B4:1 -:1 F#4:3 -:1 B4:8 B4:2 D5:2 D5:2 C#5:2 C#4:2 C#5:4 B4:2 C#5:4 | B4:2 C#5:2 C#5:16 C#4:4 -:4 B4:2 | C#5:4 D5:2 C#5:8 B4:12 B4:2 C#5:4 | B4:4 C#5:2 C#5:8 F#4:8 F#4:2 F#5:2 F#5:2 F#6:2 F#6:8 | B5:8 B5:2 D6:2 D6:2 C#6:2 C#6:2 C#6:4 B5:2 C#6:4 | B5:2 C#6:2 C#6:16 C#4:4 -:4 B5:8 | G6:8 D6:4 D6:4 C#6:8 B5:8 | F#6:9 D6:4 E6:5 -:1 C#6:9 | A#5:21 -:5 F#6:4 | D4:2 F#4:2 G6:2 F#4:2 D4:2 -:2 F#6:4 D4:2 F#4:2 B4:2 F#4:2 B5:4 C#6:4 | C#4:2 E4:2 D6:2 E4:2 C#4:2 -:2 G6:4 C#4:2 E4:2 A4:2 E4:2 C#4:2 -:2 F#6:6 | D4:2 G4:2 D4:3 -:3 B5:4 C#6:2 D4:2 D6:2 D4:2 F#5:4 G5:19 | F#5:30 | -:5 F#5:4 C#6:6 D4:2 F#4:2 | B4:2 F#4:2 D4:2 -:8 D6:4 C#6:10 C#4:2 E4:2 | A4:2 E6:2 C#4:2 E6:4 D6:8 C#6:14 | D4:2 A5:2 D4:2 -:4 F#5:8 D6:8 B5:2 C#4:2 D6:2 | C#4:2 -:8 C#6:8 D6:4 C#6:4 B5:2 D4:2 C#6:2 | B4:2 F#4:2 D4:2 D6:8 F#5:4 D6:4 E6:4 C#6:2 C#4:2 B5:2 | A4:2 E4:2 C#4:2 F#5:8 E5:4 F#5:4 B5:4 D6:2 D4:2 G4:2 | -:2 C#6:8 B5:4 C#6:4 C#6:4 D6:2 E4:2 C#6:2 E4:2 C#4:2 | -:2 A5:8 C#6:63 |  | D5:4 D5:4 C#5:2 B4:2 F#4:2 D5:4 D5:3 -:1 | C#5:4 B4:1 -:1 F#4:3 -:1 D5:4 D5:4 C#5:2 B4:2 F#4:2 D5:4 D5:3 -:1 | C#5:4 B4:1 -:1 F#4:3 -:1 D5:4 D5:4 C#5:2 B4:2 F#4:2 D5:4 D5:3 -:1 | C#5:4 B4:1 -:1 F#4:3 -:1 D5:4 D5:4 C#5:2 B4:2 F#4:2 D5:4 D5:3 -:1 | C#5:4 B4:1 -:1 F#4:2 E4:2 D5:4 D5:4 C#5:2 B4:2 F#4:2 D5:4 D5:3 -:1 | C#5:4 B4:1 -:1 F#4:3 -:1 D5:4 D5:4 C#5:2 B4:2 F#4:2 D5:4 D5:3 -:1 | C#5:4 B4:1 -:1 F#4:3 -:1 D5:4 D5:4 C#5:2 B4:2 F#4:2 D5:4 D5:3 -:1 | C#5:4 B4:1 -:1 F#4:3 -:1 D5:4 D5:4 C#5:2 B4:2 F#4:2 D5:4 D5:3 -:1 | C#5:4 B4:1 -:1 F#4:2 E4:2 -:22' },
      { wave: 'thin', volume: 0.18, pluck: true, notes: '-:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:22 F#4:4 C#5:24 | D5:4 C#5:16 | E5:4 E5:4 D5:8 C#5:16 | A4:8 F#4:8 D5:8 B4:4 | D5:12 C#5:8 D5:5 C#5:3 -:1 B4:3 | -:1 C#5:8 D5:8 F#4:3 -:1 D5:4 E5:3 -:1 C#5:3 | -:1 B4:8 F#4:8 E4:3 -:1 F#4:4 B4:3 -:1 D5:8 | C#5:8 B4:3 -:1 C#5:3 -:1 C#5:3 -:1 D5:3 -:1 C#5:8 | A4:8 C#5:62 |  | -:19 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:23 E4:5 A4:6 | E4:4 A4:7 B4:6 B4:15 | -:30 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:31 F#5:8 | B4:8 B4:2 D5:2 D5:2 C#5:4 C#5:4 B4:2 C#5:4 | B4:2 C#5:2 C#5:24 B4:8 | G5:8 D5:4 D5:5 -:7 B4:8 | F#5:9 D5:4 E5:4 -:2 C#5:9 | A#4:21 -:5 F#5:8 | G5:8 F#5:12 B4:4 C#5:8 | D5:8 G5:8 -:8 F#5:16 | B4:4 C#5:4 D5:4 F#4:4 G4:19 | F#4:30 | -:5 F#4:4 C#5:24 | D5:3 -:1 C#5:16 | E5:4 E5:4 D5:8 C#5:16 | A4:8 F#4:8 D5:8 B4:4 D5:12 | C#5:8 D5:4 C#5:4 B4:4 C#5:8 | D5:8 F#4:4 D5:4 E5:4 C#5:4 B4:8 | F#4:8 E4:4 F#4:4 B4:4 D5:8 | C#5:8 B4:4 C#5:4 C#5:4 D5:4 C#5:8 | A4:8 C#5:63 |  | -:22 | -:32 | -:32 | -:32 | -:4 C#4:2 -:26 | -:32 | -:32 | -:32 | -:4 C#4:2 -:26' },
      { wave: 'triangle', volume: 0.18, pluck: true, notes: 'B1:8 B1:8 B1:8 B1:8 | B1:8 B1:8 B1:8 B1:8 | G1:8 G1:8 G1:8 G1:8 | A1:8 A1:8 A1:8 A1:8 | B1:4 B2:4 F#3:4 B2:4 F#3:4 B2:4 F#3:4 B2:4 | A1:4 A2:4 E3:4 A2:4 E3:4 A2:4 E3:4 A2:4 | G1:4 G2:4 D3:4 G2:4 G3:4 G2:4 D3:4 G2:4 | F#1:4 F#2:4 F#3:4 F#2:4 F#3:4 F#2:4 C#3:4 -:4 | B1:4 -:1 B2:3 -:1 F#3:3 -:1 B2:3 F#3:4 B2:4 F#3:4 B2:4 | A1:4 -:1 A2:3 -:1 E3:3 -:1 A2:3 E3:4 A2:4 E3:4 A2:4 | G1:4 -:1 G2:3 -:1 D3:3 -:1 G2:3 G3:4 G2:4 D3:4 G2:4 | F#1:16 F#2:1 F#3:16 | B1:2 B2:2 D3:2 B2:2 B1:2 B2:2 D3:2 B2:2 B1:2 B2:2 D3:2 B2:2 B1:2 B2:2 D3:2 B2:2 | A1:2 A2:2 C#3:2 A2:2 A1:2 A2:2 C#3:2 A2:2 A1:2 A2:2 C#3:2 A2:2 A1:2 A2:2 C#3:2 A2:2 | G1:2 G2:2 D3:2 G2:2 G1:2 G2:2 D3:2 G2:2 G1:2 G2:2 D3:2 G2:2 G1:2 G2:2 D3:2 G2:2 | F#1:2 F#2:2 C#3:2 F#2:2 F#1:3 F#2:2 C#3:2 F#2:3 F#2:35 | B1:2 B2:2 D3:2 F#3:2 B3:2 | -:10 B3:2 B3:2 F#3:2 D3:2 B2:2 B1:2 A1:2 A2:2 C#3:2 E3:2 A3:2 | -:10 A3:2 A3:2 E3:2 C#3:2 A2:2 A2:2 G1:2 G2:2 B2:2 D3:2 G3:2 | G3:2 B3:2 -:6 B3:2 G3:2 D3:2 B2:2 G2:2 B1:2 F#1:2 F#2:2 C#3:2 F#3:2 F#3:2 | -:6 F#3:2 F#3:2 C#3:2 F#2:2 F#2:2 F#1:6 B1:3 B2:2 D3:2 F#3:2 B3:2 | -:10 B3:2 B3:2 F#3:2 D3:2 B2:2 -:2 A1:2 A2:2 C#3:2 E3:2 A3:2 | -:10 A3:2 E3:2 C#3:2 A2:2 G1:1 G2:3 B2:2 D3:2 G3:2 G3:2 B3:2 | -:4 G3:2 G3:2 D3:2 B2:2 G2:2 B1:2 G2:2 A1:1 C#3:3 E3:2 A3:2 -:5 | -:5 A3:2 A3:2 E3:2 C#3:2 A2:2 B1:2 B2:2 D3:2 F#3:2 B3:2 F#3:2 D3:2 B2:2 B1:3 | B2:2 D3:2 F#3:2 B3:3 F#3:2 D3:3 B2:22 | -:7 B1:8 B2:8 B1:8 | B2:8 A1:8 A2:8 A1:8 | A2:8 G1:8 G2:8 G1:8 | G2:8 F#1:54 |  | -:21 B2:4 B3:4 | F#3:4 B2:4 B3:4 F#3:4 B2:4 B3:4 B2:4 B3:4 | F#3:4 B2:4 B3:4 F#3:4 B2:4 B3:4 A2:4 A3:4 | E3:4 A2:4 A3:4 E3:4 A2:4 A3:4 A2:4 A3:4 | E3:4 A2:5 A3:4 E3:3 A2:4 A3:4 F#2:4 F#3:4 | C#3:5 F#2:4 F#3:4 C#3:4 F#2:4 F#3:4 F#2:4 F#3:4 | C#3:4 F#2:4 F#3:4 C#3:4 F#2:4 F#3:4 E2:4 E3:4 | B2:4 E2:4 E3:4 B2:4 E2:4 E3:4 E2:4 E3:4 | B2:4 E2:4 E3:4 B2:4 E2:4 E3:4 B2:4 B3:4 | F#3:4 B2:4 B3:4 F#3:4 B2:4 B3:4 B2:4 B3:4 | F#3:4 B2:5 B3:4 F#3:4 B2:4 B3:4 A2:4 A3:4 | E3:4 A2:4 A3:4 E3:4 A2:4 A3:4 A2:4 A3:4 | E3:4 A2:4 A3:4 E3:4 A2:4 A3:4 G2:4 G3:4 | D3:4 G2:4 G3:4 D3:4 G2:4 G3:4 G2:4 G3:4 | D3:4 G2:5 G3:4 D3:4 G2:4 F#2:15 | F#2:16 -:1 A1:15 | A1:7 B2:6 B2:15 | -:4 B1:9 B2:8 B1:7 B2:8 | A1:9 A2:8 A1:7 A2:8 | G1:9 G2:8 G1:7 G2:8 | F#1:33 | B1:4 B2:4 F#3:4 B2:4 F#3:4 B2:4 F#3:4 | B2:4 A1:4 A2:4 E3:4 A2:4 E3:4 A2:4 E3:4 | A2:4 G1:4 G2:4 D3:4 G2:4 G3:4 G2:4 D3:4 | G2:4 F#1:4 F#2:4 F#3:4 F#2:4 F#3:4 F#2:4 C#3:4 | -:4 B1:4 B2:4 F#3:4 B2:4 F#3:4 B2:4 F#3:4 | B2:4 A1:4 A2:4 E3:4 A2:4 E3:4 A2:4 E3:4 | A2:4 G1:4 G2:4 D3:4 G2:4 G3:4 G2:4 D3:4 | G2:4 F#1:16 F#2:1 C#3:1 F#3:36 | B1:3 | B3:2 -:9 B3:2 B1:2 B3:2 -:10 B3:2 A1:3 | A3:2 -:9 A3:2 A1:2 A3:2 -:10 A3:2 G1:3 | G3:1 B3:3 -:5 B3:2 G3:2 G1:2 G3:2 B3:2 -:6 B3:2 G3:2 F#1:19 | F#1:35 | B1:2 B2:2 D3:2 F#3:2 B3:2 -:3 | -:7 B3:2 B3:2 F#3:2 D3:2 B2:2 B1:2 A1:2 A2:2 C#3:2 E3:2 A3:2 -:3 | -:7 A3:2 A3:2 E3:2 C#3:2 A2:2 A2:2 G1:2 G2:2 B2:2 D3:2 G3:2 G3:2 B3:2 | -:6 B3:2 G3:2 D3:2 B2:2 G2:2 B1:2 F#1:2 F#2:2 C#3:2 F#3:2 F#3:2 -:3 | -:3 F#3:2 F#3:2 C#3:2 F#2:2 F#2:2 F#1:6 B1:2 B2:2 D3:2 F#3:2 B3:2 -:3 | -:7 B3:2 B3:2 F#3:2 D3:2 B2:2 -:2 A1:2 A2:2 C#3:2 E3:2 A3:2 -:3 | -:7 A3:2 E3:2 C#3:2 A2:2 G1:2 G2:2 B2:2 D3:2 G3:2 G3:2 B3:2 -:3 | -:1 G3:2 G3:2 D3:2 B2:2 G2:2 B1:2 G2:2 A1:2 C#3:2 E3:2 A3:2 -:9 | -:1 A3:2 A3:2 E3:2 C#3:2 A2:2 B1:2 B2:2 D3:2 F#3:2 B3:3 F#3:2 D3:2 B2:2 B1:2 B2:2 | D3:2 F#3:3 B3:2 F#3:3 D3:3 B2:27 | -:2 B1:8 B2:8 B1:8 | B2:8 A1:8 A2:8 A1:8 | A2:8 G1:8 G2:8 G1:8 | G2:8 F#1:2 F#2:2 A1:2 A2:2 C#2:2 C#3:2 E2:2 E3:2 F#2:2 F#3:2 A2:2 | A3:2 C#3:2 -:2 E3:2 -:2 B1:8 B2:8 B1:8 | B2:8 A1:8 A2:8 A1:8 | A2:8 G1:8 G2:8 G1:8 | G2:8 F#1:2 F#2:2 A1:2 A2:2 C#2:2 C#3:2 E2:2 E3:2 F#2:2 F#3:2 A2:2 | A3:2 C#3:2 -:2 E3:2 -:24' },

      // The left hand's second note, and what neither hand's first two voices take.
      { wave: 'triangle', volume: 0.14, pluck: true, notes: 'B2:8 B2:8 B2:8 B2:8 | B2:8 B2:8 B2:8 B2:8 | G2:8 G2:8 G2:8 G2:8 | A2:8 A2:8 A2:8 A2:8 | B2:4 -:4 B3:4 -:12 B3:4 -:4 | A2:4 -:4 A3:4 -:12 A3:4 -:4 | G2:4 -:4 G3:4 -:4 B3:4 -:4 G3:4 -:4 | F#2:4 -:12 A3:4 -:4 F#3:4 -:4 | B2:5 -:4 B3:4 -:11 B3:4 -:4 | A2:5 -:4 A3:4 -:11 A3:4 -:4 | G2:5 -:4 G3:4 -:3 B3:4 -:4 G3:4 -:4 | F#2:15 -:1 C#3:17 | -:31 | -:32 | -:32 | -:32 | -:22 B2:2 -:8 | -:22 A2:2 -:8 | -:22 G2:2 -:8 | -:20 B2:2 F#2:2 -:8 | -:22 B2:3 -:7 | -:23 A2:2 -:7 | -:19 G2:1 -:12 | -:19 A2:1 -:12 | -:15 B2:2 -:14 B2:3 | -:30 | -:13 B2:8 F#3:8 B2:8 | F#3:8 A2:8 E3:8 A2:8 | E3:8 G2:8 D3:8 G2:8 | D3:8 F#2:54 |  | -:29 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:23 F#3:15 | F#3:17 A2:15 | A2:7 B3:6 B3:15 | -:4 B2:9 F#3:8 B2:7 F#3:8 | A2:9 E3:8 A2:7 E3:8 | G2:9 D3:8 G2:7 D3:8 | F#2:33 | B2:4 -:4 B3:4 -:12 B3:4 | -:4 A2:4 -:4 A3:4 -:12 A3:4 | -:4 G2:4 -:4 G3:4 -:4 B3:4 -:4 G3:4 | -:4 F#2:4 -:12 A3:4 -:4 F#3:4 | -:4 B2:4 -:4 B3:4 -:12 B3:4 | -:4 A2:4 -:4 A3:4 -:12 A3:4 | -:4 G2:4 -:4 G3:4 -:4 B3:4 -:4 G3:4 | -:4 F#2:16 -:9 | -:29 B2:3 | -:13 B2:2 -:14 A2:3 | -:13 A2:2 -:14 G2:3 | -:13 G2:2 -:14 F#2:19 | F#2:35 | B2:2 -:11 | -:19 A2:2 -:11 | -:19 G2:2 -:11 | -:17 B2:2 F#2:2 -:11 | -:19 B2:2 -:11 | -:19 A2:2 -:11 | -:15 G2:2 -:15 | -:15 A2:2 -:15 | -:11 B2:2 -:15 B2:2 -:2 | -:32 | -:10 B2:8 F#3:8 B2:8 | F#3:8 A2:8 E3:8 A2:8 | E3:8 G2:8 D3:8 G2:8 | D3:8 -:22 | -:10 B2:8 F#3:8 B2:8 | F#3:8 A2:8 E3:8 A2:8 | E3:8 G2:8 D3:8 G2:8 | D3:8 -:22 | -:32' },
      { wave: 'thin', volume: 0.12, pluck: true, notes: '-:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:6 E4:2 -:24 | -:6 G4:2 -:24 | -:2 F#4:2 -:28 | -:3 F#4:2 -:27 | -:3 E4:2 -:27 | -:27 C#4:2 -:2 A4:2 | -:31 | -:32 | -:21 B3:8 -:3 | -:5 B3:8 -:8 A3:8 -:3 | -:5 A3:8 -:8 G3:8 -:3 | -:5 G3:8 -:19 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:32 | -:15 B3:8 -:7 B3:8 | -:9 A3:8 -:7 A3:8 | -:9 G3:8 -:7 G3:8 | -:26 | -:32 | -:32 | -:32 | -:32 | -:23 C#4:4 -:5 | -:32 | -:23 C#5:8 -:1 | -:32 | -:32 | -:5 B4:3 -:17 D4:2 -:5 | -:5 A4:3 -:24 | -:21 G4:2 -:9 | -:32 | -:32 | -:32 | -:3 E4:2 -:27 | -:3 G4:2 -:26 F#4:2 | -:30 F#4:2 | -:30 E4:2 | -:31 | -:23 C#4:2 -:2 A4:2 -:3 | -:32 | -:32 | -:18 B3:8 -:6 | -:2 B3:8 -:8 A3:8 -:6 | -:2 A3:8 -:8 G3:8 -:6 | -:2 G3:8 -:22 | -:18 B3:8 -:6 | -:2 B3:8 -:8 A3:8 -:6 | -:2 A3:8 -:8 G3:8 -:6 | -:2 G3:8 -:22 | -:32' },
    ],
  },
  /**
   * My Soul, Your Beats!, from the anime Angel Beats!; converted here from a piano and vocals MIDI file linked from
   * sheet.host (page zuICKd), its copyright event naming www.youtube.com/ZackyAnimePiano; reduced to five chiptune
   * voices and quantized.
   *
   * HOW IT WAS CONVERTED (the MIDI is not in the repository; the rules of always-in-my-heart above): its one tempo,
   * 145 a minute, as `bpm: 145`, a step a sixteenth (64 of the MIDI's 256 ticks a quarter), bars of 4/4 16 steps;
   * onsets rounded to the nearest step (all but 14 exact, those within 48 ms); the MIDI's lead-in rest before its first
   * note (14 steps, 1.4 s) is left out, so the piece sounds at once: bar 1 is 2 steps, and the end is padded with a
   * rest of 14 steps to a multiple of 16 (864 steps, as long as before). Its
   * vocal track is the melody voice alone; the piano's right hand takes the second and inner voices from the top, its
   * left hand the bass, octave and inner voices from the bottom, one note at a time as for the other MIDI pieces;
   * 28 of 1065 notes found no free voice. No lyrics, velocities or pedal: `levelled` sets the loudness
   * (content/my-soul.test.ts checks the result).
   */
  'my-soul-your-beats': {
    bpm: 145,
    loop: false,
    voices: [
      { wave: 'pulse', volume: 0.2, pluck: true, notes: '-:2 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | F#4:2 A4:2 D5:2 D5:4 C#5:2 E5:4 | D5:2 E5:2 F#5:2 C#5:6 -:4 | F#4:4 A4:2 C#5:2 D5:4 C#5:2 D5:6 | -:10 B4:2 | B4:4 C#5:4 D5:4 E5:4 | B4:8 -:6 B4:2 | C#5:4 A4:4 B4:4 B4:8 | -:12 | F#4:2 A4:2 D5:2 D5:4 C#5:2 E5:2 E5:2 | D5:2 E5:2 F#5:2 C#5:6 -:4 | F#4:4 A4:2 C#5:2 D5:4 C#5:2 D5:6 | -:10 B4:2 | B4:4 C#5:4 D5:4 E5:4 | B4:12 -:2 B4:2 | C#5:4 D5:4 E5:4 F#5:4 | F#5:8 -:4 F#5:4 | A5:2 F#5:4 A5:4 G5:2 F#5:4 | D5:12 D5:4 | E5:2 D5:4 B4:4 E5:2 F#5:4 | F#5:12 -:4 | G#5:2 F#5:4 E5:6 G#5:2 B5:6 | G#5:2 B5:6 -:4 | G#5:2 F#5:2 F#5:2 E5:6 G#5:2 B5:6 | G#5:2 B5:6 C#6:2 B5:14 | -:4 | -:10 G#5:2 F#5:2 E5:2 | F#5:2 G#5:8 G#5:2 F#5:2 E5:2 | F#5:4 G#5:4 B5:4 F#5:4 | G#5:2 F#5:4 E5:6 G#5:2 B5:6 | G#5:2 B5:6 -:4 | G#5:2 F#5:2 F#5:2 E5:6 G#5:2 B5:6 | G#5:2 B5:6 C#6:2 B5:14 | -:2 B5:2 | D#6:2 B5:2 B5:8 G#5:2 B5:10 | -:6 G#5:2 | F#5:4 E5:4 C#5:4 B4:16 | -:2 G#5:2 | F#5:4 E5:4 C#5:4 B4:16 | -:2 G#5:2 | F#5:4 E5:4 B4:4 C#5:16 | -:18' },
      { wave: 'thin', volume: 0.18, pluck: true, notes: 'F#5:2 | E5:4 D5:4 B4:2 D4:2 A4:16 | -:2 F#5:2 | E5:4 D5:4 B4:2 D4:2 A4:16 | -:2 F#5:2 | E5:4 D5:4 E5:4 A5:4 | B6:12 -:2 F#5:2 | E5:4 D5:4 A4:4 B4:20 |  | B3:4 C#4:4 D4:4 E4:4 | F#6:2 F#6:2 F#6:2 F#6:2 F#6:2 F#6:2 F#6:2 F#6:2 | B6:2 B6:2 -:2 E7:2 E7:2 -:2 D6:2 E6:2 | -:2 A6:2 E6:2 -:3 E6:1 D6:1 A5:1 E5:1 D5:1 A4:2 | -:4 F#5:2 B4:2 -:2 E5:2 A4:2 -:2 | -:6 E4:2 A4:2 E5:2 -:4 | A5:2 -:10 B5:2 F#5:2 | -:2 A5:2 E5:2 -:2 F#5:2 D5:2 -:2 E5:2 | B4:2 -:14 | -:4 F#5:2 B4:2 -:2 E5:2 A4:2 -:2 | -:6 E4:2 A4:2 E5:2 -:4 | A4:1 D5:1 E5:1 F#5:1 A5:1 F#5:1 E5:1 D5:1 A4:1 D5:1 E5:1 F#5:1 A5:4 | -:8 F#5:2 B4:2 -:2 E5:2 | -:12 F#5:2 B4:2 | -:2 E5:2 A4:2 -:8 E4:2 | A4:2 E5:2 -:4 A5:2 -:6 | -:4 B5:2 F#5:2 -:2 A5:2 E5:2 -:2 | F#5:2 D5:2 -:2 E5:2 -:4 F#5:2 B4:2 | -:2 E5:2 A4:2 -:10 | -:4 A5:1 D6:1 E6:1 F#6:1 A6:1 F#6:1 E6:1 D6:1 A5:4 | F#4:2 F#4:2 F#4:2 F#4:2 F#4:2 F#4:2 F#4:2 F#4:2 | E4:2 E4:2 E4:2 E4:2 E4:2 E4:2 E4:2 E4:2 | C#4:2 E4:2 E4:2 E4:2 E4:2 E4:2 E4:2 E4:2 | D#4:2 F#4:2 F#4:2 F#4:2 D#6:2 E6:2 F#6:2 G#6:2 | A5:1 G#6:1 F#6:2 F#6:2 E6:2 A5:2 C#6:2 G#6:2 B6:2 | A5:2 C#6:2 G#6:2 B6:2 A5:2 C#6:2 E6:2 B6:2 | A5:1 G#6:1 F#6:2 F#6:2 E6:2 A5:2 C#6:2 G#6:2 B6:2 | A5:2 C#6:2 G#6:2 B6:2 B6:1 D#7:1 B7:2 -:4 | F#5:2 D#5:4 E5:4 C#5:4 D#5:4 | B4:4 C#5:4 G#5:2 F#5:2 E5:2 | F#5:2 G#5:2 C#5:2 E5:2 G#5:2 G#5:2 F#5:2 E5:2 | C#6:2 C#5:2 E5:2 G#5:2 B5:2 B4:2 D#5:2 F#5:2 | A5:1 G#6:1 F#6:2 F#6:2 E6:2 A5:2 C#6:2 G#6:2 B6:2 | A5:2 C#6:2 G#6:2 B6:2 A5:2 C#6:2 E6:2 B6:2 | A5:1 G#6:1 F#6:2 F#6:2 E6:2 A5:2 C#6:2 G#6:2 B6:2 | A5:2 C#6:2 G#6:2 B6:2 B6:1 D#7:1 B7:2 -:4 | -:4 F#5:2 B4:2 F#5:2 E5:4 D#5:4 | E5:4 B3:2 D#4:2 F#4:2 B3:4 | D#5:4 E5:2 B4:2 E5:2 G#5:4 G#6:2 | F#6:4 E6:4 C#6:4 B5:6 | B4:2 E5:2 G#5:2 B5:2 E6:2 G#6:2 G#6:2 | F#6:4 E6:4 C#6:4 B5:6 | B4:2 E5:2 G#5:2 B5:2 E6:2 G#6:2 G#6:2 | F#6:4 E6:4 B5:4 C#6:2 C#5:2 | E5:2 G#5:2 C#6:2 E6:2 G#6:2 C#7:4 -:16' },
      { wave: 'triangle', volume: 0.18, pluck: true, notes: '-:2 | B2:2 F#3:2 G2:2 D3:2 G3:4 F#2:20 |  | B2:2 F#3:2 G2:2 D3:2 G3:4 F#2:16 | -:4 | B2:2 F#3:2 G2:2 D3:2 B3:2 D4:2 A4:4 | B4:16 | B2:2 F#3:2 G2:2 D3:2 A3:4 B2:16 | -:2 F#3:2 | B2:2 F#3:2 F#3:2 F#3:2 F#3:2 F#3:2 F#3:2 F#3:2 | G2:2 D3:2 G3:2 B3:2 D4:2 G3:2 B3:2 D4:2 | G3:2 B3:2 D4:2 A2:2 E3:2 A3:2 E3:2 A3:2 | C#4:2 B2:2 F#3:2 B3:2 D4:8 | G1:2 G2:2 G2:2 G2:2 G2:2 G2:2 G2:2 G2:2 | D2:2 D3:2 D3:2 D3:2 A1:2 A2:2 A2:2 A2:2 | B1:2 B2:2 B2:2 B2:2 B2:2 B2:2 B2:2 B2:2 | D2:2 D3:2 D3:2 D3:2 A1:2 A2:2 A2:2 A2:2 | G1:2 G2:2 G2:2 G2:2 G2:2 G2:2 G2:2 G2:2 | E2:2 E3:2 E3:2 E3:2 E3:2 E3:2 E3:2 E3:2 | F#1:2 F#2:2 F#2:2 F#2:2 F#2:2 F#2:2 F#2:2 F#2:2 | B1:2 F#2:2 B2:2 F#2:2 A1:2 E2:2 A2:2 E2:2 | G1:2 G2:2 G2:2 G2:2 G2:2 G2:2 G2:2 G2:2 | D2:2 D3:2 D3:2 D3:2 A1:2 A2:2 A2:2 A2:2 | B1:2 B2:2 B2:2 B2:2 B2:2 B2:2 B2:2 B2:2 | D2:2 D3:2 D3:2 D3:2 A1:2 A2:2 A2:2 A2:2 | G1:2 G2:2 G2:2 G2:2 G2:2 G2:2 G2:2 G2:2 | E2:2 E3:2 E3:2 E3:2 E3:2 E3:2 E3:2 E3:2 | F#1:2 F#2:2 F#2:2 F#2:2 F#2:2 F#2:2 F#2:2 F#2:2 | D3:2 A3:2 D4:2 A3:2 A2:2 E3:2 A3:2 E3:2 | G2:2 G3:2 G3:2 G3:2 G3:2 G3:2 G3:2 G3:2 | G#2:2 G#3:2 G#3:2 G#3:2 G#3:2 G#3:2 G#3:2 G#3:2 | A#2:2 F#3:2 F#3:2 F#3:2 F#3:2 F#3:2 F#3:2 F#3:2 | C3:2 G#3:2 G#3:2 G#3:2 G#3:2 G#3:2 G#3:2 G#3:2 | A1:2 E2:2 A2:2 C#3:2 E3:2 A3:2 E3:2 C#3:2 | A1:2 E2:2 A2:2 C#3:2 E3:2 A3:2 E3:2 C#3:2 | A1:2 E2:2 A2:2 C#3:2 E3:2 A3:2 E3:2 C#3:2 | A1:2 E2:2 A2:2 C#3:2 E3:2 A3:2 E3:2 C#3:2 | C#2:2 G#2:2 C#3:2 E3:2 G#3:2 C#4:2 G#3:2 E3:2 | C#2:2 G#2:2 C#3:2 E3:2 G#3:2 C#4:2 G#3:2 E3:2 | C#2:2 G#2:2 C#3:2 E3:2 G#3:2 C#4:2 G#3:2 E3:2 | C#2:2 C#3:2 E3:2 C#3:2 B1:2 B2:2 D#3:2 B2:2 | A1:2 E2:2 A2:2 E2:2 C#3:2 A2:2 E3:2 C#3:2 | A1:2 E2:2 A2:2 E2:2 C#3:2 A2:2 E3:2 C#3:2 | A1:2 E2:2 A2:2 E2:2 C#3:2 A2:2 E3:2 C#3:2 | A1:2 E2:2 A2:2 E2:2 C#3:2 A2:2 E3:2 C#3:2 | B1:2 F#2:2 B2:2 F#2:2 D#3:2 B2:2 F#3:2 D#3:2 | B1:2 F#2:2 B2:2 F#2:2 D#3:2 B2:2 F#3:2 D#3:2 | B1:2 F#2:2 B2:2 F#2:2 D#3:2 B2:2 F#3:2 D#3:2 | C#2:2 C#3:2 A1:2 A2:2 A2:2 A2:2 G#1:2 G#2:2 | G#2:2 G#2:2 G#2:2 G#2:2 G#2:2 G#2:2 G#2:2 G#2:2 | C#2:2 C#3:2 A1:2 A2:2 A2:2 A2:2 G#1:2 G#2:2 | G#2:2 G#2:2 G#2:2 G#2:2 G#2:2 G#2:2 G#2:2 G#2:2 | C#2:2 C#3:2 A1:2 A2:2 G#1:2 G#2:2 C#2:2 C#3:2 | C#3:2 C#3:2 C#3:2 C#3:2 C#3:2 C#2:4 -:16' },

      // The left hand's second note, and what neither hand's first two voices take.
      { wave: 'triangle', volume: 0.14, pluck: true, notes: '-:2 | -:12 F#3:20 |  | -:12 F#3:16 | -:4 | -:16 | F#5:16 | -:12 F#3:16 | -:4 | -:16 | -:16 | -:16 | -:8 F#4:8 | G2:2 -:14 | D3:2 -:6 A2:2 -:6 | B2:2 -:14 | D3:2 -:6 A2:2 -:6 | G2:2 -:14 | E3:2 -:14 | F#2:2 -:14 | B2:2 -:6 A2:2 -:6 | G2:2 -:14 | D3:2 -:6 A2:2 -:6 | B2:2 -:14 | D3:2 -:6 A2:2 -:6 | G2:2 -:14 | E3:2 -:14 | F#2:2 -:14 | -:16 | D3:2 B3:2 B3:2 B3:2 B3:2 B3:2 B3:2 B3:2 | E3:2 B3:2 B3:2 B3:2 B3:2 B3:2 B3:2 B3:2 | F#3:2 A#3:2 A#3:2 A#3:2 A#3:2 A#3:2 A#3:2 A#3:2 | G#3:2 C4:2 C4:2 C4:2 C4:2 C4:2 C4:2 C4:2 | A2:2 -:14 | A2:2 -:14 | A2:2 -:14 | A2:2 -:14 | C#3:2 -:14 | C#3:2 -:14 | C#3:2 -:14 | C#3:2 -:2 G#3:2 -:2 B2:2 -:2 F#3:2 -:2 | A2:2 -:14 | A2:2 -:14 | A2:2 -:14 | A2:2 -:14 | B2:2 -:14 | B2:2 -:14 | B2:2 -:14 | C#3:2 -:2 A2:2 -:6 G#2:2 -:2 | -:16 | C#3:2 -:2 A2:2 -:6 G#2:2 -:2 | -:16 | C#3:2 -:2 A2:2 -:2 G#2:2 -:2 C#3:2 -:2 | -:10 C#3:4 -:16' },
      { wave: 'thin', volume: 0.12, pluck: true, notes: '-:2 | -:8 B3:2 -:2 A3:16 | -:4 | -:8 B3:2 -:2 A3:16 | -:4 | -:16 | F#6:12 -:4 | -:12 F#4:20 |  | -:4 B3:4 B3:4 B3:4 | B5:2 B5:2 B5:2 B5:2 B5:2 B5:2 B5:2 B5:2 | F#6:2 F#6:2 -:2 A6:2 A6:2 -:2 D5:2 E5:2 | -:2 A5:2 -:4 A4:8 | -:4 F#4:2 F#4:2 -:2 E4:2 F#4:2 -:2 | -:8 F#4:2 -:6 | E5:2 -:10 B4:2 C#5:2 | -:2 A4:2 C#5:2 -:2 F#4:2 B4:2 -:2 E4:2 | G4:2 -:14 | -:4 F#4:2 F#4:2 -:2 E4:2 F#4:2 -:2 | -:8 F#4:2 -:6 | -:16 | -:8 B4:2 G4:2 -:2 A4:2 | -:12 F#4:2 F#4:2 | -:2 E4:2 F#4:2 -:10 | F#4:2 -:6 E5:2 -:6 | -:4 B4:2 C#5:2 -:2 A4:2 C#5:2 -:2 | F#4:2 B4:2 -:2 B4:2 -:4 F#4:2 F#4:2 | -:2 E4:2 F#4:2 -:10 | -:16 | D4:2 D4:2 D4:2 D4:2 D4:2 D4:2 D4:2 D4:2 | D4:2 D4:2 D4:2 D4:2 D4:2 D4:2 D4:2 D4:2 | A#3:2 C#4:2 C#4:2 C#4:2 C#4:2 C#4:2 C#4:2 C#4:2 | C4:2 D#4:2 D#4:2 D#4:2 D#5:2 E5:2 F#5:2 G#5:2 | -:1 C#6:1 -:14 | -:16 | -:1 C#6:1 -:14 | -:10 F#7:2 -:4 | B4:2 B4:4 B4:4 B4:4 B4:4 | G#4:4 G#4:4 G#4:2 F#4:2 E4:2 | F#4:2 G#4:2 -:6 G#4:2 F#4:2 E4:2 | G#5:2 -:2 C#4:2 -:2 F#5:2 -:2 B3:2 -:2 | -:1 C#6:1 -:14 | -:16 | -:1 C#6:1 -:14 | -:10 F#7:2 -:4 | -:4 B4:2 -:2 B4:2 B4:4 B4:4 | -:14 | B4:4 B4:2 -:8 G#5:2 | F#5:4 E5:4 C#5:4 B4:6 | -:12 G#5:2 | F#5:4 E5:4 C#5:4 B4:6 | -:12 G#5:2 | F#5:4 E5:4 B4:4 C#5:2 -:2 | -:10 G#6:4 -:16' },
    ],
  },
  /**
   * Lilium, from the anime Elfen Lied ("Elfen Lied OP" and "Original by Noma Kumiko", as printed on the score);
   * written out here from a piano arrangement by Ismael Ramos (TehIshter), as printed on the score, published on
   * sheet.host (page b1V0Dh); reduced to five chiptune voices.
   *
   * HOW IT WAS WRITTEN OUT (the PDF is not in the repository): bar by bar from the score's 7 pages, 46 bars, no
   * repeats. The score prints no tempo number (Dolente); it plays at 60 quarter notes a minute, and a step is a
   * twelfth of a quarter note, `bpm: 180`, so eighths (6 steps), sixteenths (3), sextuplet sixteenths (2) and triplet
   * eighths (4) are exact. rit., a tempo and accel. are left out (one bpm); each of the two fermatas (bars 22 and 33)
   * adds a beat to its bar; the accelerando of bar 44, which holds more than its 4/4 as engraved, is fitted into the
   * bar, and the last chords of bar 45 end with it. A bar line `|` stands at every bar of the score (4/4 is 48 steps,
   * 3/4 36, 2/4 24, 5/4 60, 6/4 72). The leading rests of the printed first bar (three beats, before the pickup
   * F#4 C#5) are left out, so the piece sounds at once: bar 1 is 12 steps, and the end is padded with a rest of 4
   * steps to a multiple of 16 (2,176 steps). Pitches carry their own accidentals as printed (three sharps; E#, B#, D#, A#,
   * G and C natural); a tie is one note in the bar where it starts. Reduced on purpose, so it stays calm: the melody
   * is the tune; the second voice the right hand's next chord tone; the bass the lowest line of the left hand, held to
   * its next note; the octave voice the rest of the left hand's figure (in the sextuplet arpeggios their second,
   * fourth and sixth notes only); the inner voice one more chord tone; other chord notes are left out. Notes under
   * 40 Hz (the low C#1 and D1 octaves) and the grace note of bar 32 are left out; in bars 37 and 45 the chords
   * doubled an octave higher (A7, F#7, C#7) keep the lower octave. No dynamics or pedal: `levelled` sets the
   * loudness (content/lilium.test.ts checks every bar).
   */
  lilium: {
    bpm: 180,
    loop: false,
    voices: [
      { wave: 'pulse', volume: 0.2, pluck: true, notes: 'F#4:6 C#5:6 | G#4:18 A4:6 A4:12 F#4:6 C#5:6 | G#4:18 A4:6 B4:6 A4:6 | F#4:24 G#3:6 G#4:6 E4:6 D4:6 | E4:30 F#4:6 D4:6 C#4:6 | D4:6 E4:6 F#4:18 G#4:6 A4:6 B4:6 | A4:24 G#4:12 F#4:6 C#5:6 | G#4:18 A4:6 A4:12 F#4:6 C#5:6 | G#4:18 A4:6 B4:6 A4:6 | F#4:24 -:6 G#4:6 E4:6 D4:6 | E4:24 -:6 F#4:6 D4:6 C#4:6 | D4:6 B4:6 A4:6 G#4:6 F#4:6 E#4:6 D#4:6 E#4:6 | F#4:6 A#4:6 B4:6 C#5:6 | D5:6 A4:6 G#4:6 D5:6 C#5:6 E5:6 A4:6 C#5:6 | B#4:6 A4:6 G#4:6 F#4:6 A4:21 B4:3 | G#4:36 F#4:6 C#5:6 | G#4:18 A4:6 A4:12 F#4:6 C#5:6 | G#4:18 A4:6 B4:6 A4:6 | -:6 D6:6 C#6:6 A5:6 B5:12 -:12 | -:6 C#6:6 B5:6 G#5:6 A#5:12 -:12 | D4:6 B4:6 A4:6 G#4:6 F#4:6 E#4:6 D#4:6 E#4:6 | -:6 A4:6 B4:6 G#4:6 A4:36 A5:6 B5:6 | C#6:18 B5:6 D6:6 C#6:6 B5:6 A5:6 | G#5:12 A5:6 B5:6 C#6:18 D#6:6 | B5:6 C#6:6 C#6:24 -:12 A5:6 B5:6 | C#6:12 A5:6 B5:6 D6:6 C#6:6 B5:6 C#6:6 | A5:12 G#5:6 A5:6 F#5:12 G#5:6 A5:6 | C#6:6 E6:6 D#6:6 B5:6 C#6:24 | A3:12 G#3:12 F#5:24 | E5:6 D5:6 C#5:12 D#5:6 B4:6 C#5:30 | A4:6 G#4:6 E4:6 F#4:12 | G#4:6 A4:6 C#5:6 E5:6 D#5:6 B4:6 -:12 | G#5:6 E5:6 F#5:6 C#5:6 B4:6 G#4:6 A4:30 A#5:6 B5:6 C#6:6 | D6:6 A5:6 G#5:6 D6:6 C#6:6 E6:6 A5:6 C#6:6 | G5:6 A5:6 G#5:4 E#5:4 D5:4 C#5:6 A#5:6 B5:6 C#6:6 | D6:6 A5:6 G#5:6 D6:6 C#6:6 E6:6 A5:6 C#6:6 | B#5:6 A5:6 G#5:6 F#5:6 A5:6 A4:2 A5:2 A6:2 A6:3 A6:3 A5:3 A4:3 | G#4:2 E#4:2 C#4:2 B3:2 G#3:2 E#3:2 -:24 F#5:6 C#6:6 | G#5:18 A5:6 A5:12 F#5:6 C#6:6 | G#5:18 A5:6 B5:6 A5:6 | -:6 F#6:6 C#7:6 D7:6 B6:6 G#5:6 E5:6 D5:6 | -:6 E6:6 B6:6 C#7:6 A#6:6 F#5:6 D5:6 C#5:6 | D5:6 B5:6 A5:6 G#5:6 F#5:6 E#5:6 D#5:6 E#5:6 | F#5:48 | C#6:6 A6:3 A6:3 A6:18 A4:12 -:6 | F#3:36 -:16' },
      { wave: 'thin', volume: 0.18, pluck: true, notes: '-:12 | E#4:24 F#4:12 -:12 | E#4:24 -:12 | D4:24 -:6 B3:6 B3:6 -:6 | G#3:24 A#3:6 C#4:6 A#3:6 A#3:6 | -:48 | -:24 E#4:12 -:12 | E#4:24 C#4:12 -:12 | E#4:24 -:12 | D4:24 -:6 B3:6 B3:6 -:6 | G#3:24 -:6 C#4:6 A#3:6 A#3:6 | B3:6 -:42 | C#4:6 F#4:6 G#4:6 A#4:6 | A4:6 -:18 G#4:6 -:6 F#4:6 C#4:6 | G#4:6 -:18 C#4:21 -:3 | E#4:36 -:12 | E#4:18 -:6 C#4:12 -:12 | E#4:18 -:18 | -:6 D5:6 C#5:6 A4:6 B4:6 G#4:6 E4:6 D4:6 | -:6 C#5:6 B4:6 G#4:6 C#5:6 F#4:6 D4:6 C#4:6 | B3:6 -:42 | F#4:24 -:36 A4:6 B4:6 | C#5:18 B4:6 D5:6 C#5:6 B4:6 A4:6 | G#4:12 A4:6 B4:6 C#5:18 D#5:6 | B4:6 C#5:6 A5:24 -:12 A4:6 B4:6 | E5:12 A4:6 B4:6 D5:6 C#5:6 B4:6 C#5:6 | C#5:12 G#4:6 A4:6 A4:12 G#4:6 A4:6 | E5:6 E5:6 B5:6 B4:6 A5:24 | -:24 D5:24 | E4:6 D4:6 A4:12 F#4:6 B3:6 A4:30 | A3:6 G#3:6 E3:6 D4:12 | G#3:6 A3:6 A4:6 E4:6 D#4:6 B3:6 C#5:60 | -:18 F#5:6 G#5:6 A5:6 | D5:6 A4:6 G#4:6 D5:6 C#5:6 E5:6 A4:6 C#5:6 | B4:6 A4:6 G#4:4 E#4:4 D4:4 C#4:6 A#4:6 B4:6 C#5:6 | D5:6 A4:6 G#4:6 D5:6 C#5:6 E5:6 A4:6 C#5:6 | G#5:6 A4:6 G#4:6 F#4:6 F#5:6 F#4:2 F#5:2 F#6:2 F#6:3 F#6:3 F#5:3 F#4:3 | E#4:2 E#3:2 C#3:2 B2:2 G#2:2 E#2:2 -:24 F#4:6 C#5:6 | G#4:18 A4:6 A4:12 F#4:6 C#5:6 | G#4:18 A4:6 B4:6 A4:6 | -:6 F#5:6 C#6:6 D6:6 B5:6 G#4:6 E4:6 D4:6 | -:6 E5:6 B5:6 C#6:6 A#5:6 A#4:6 D4:6 C#4:6 | D4:6 B4:6 A4:6 G#4:6 F#4:6 E#4:6 D#4:6 E#4:6 | C#5:6 -:2 A3:2 A3:2 -:2 F#4:2 F#4:2 -:2 A4:2 A4:2 -:2 F#5:2 F#5:2 -:2 A5:2 A5:2 -:2 F#6:2 F#6:2 -:2 A6:2 A6:2 | C#5:6 F#6:3 F#6:3 F#6:18 F#4:12 -:6 | C#3:36 -:16' },
      { wave: 'triangle', volume: 0.18, pluck: true, notes: '-:12 | E#2:24 F#2:24 | E#2:24 F#2:12 | D2:24 D2:24 | C#2:24 F#2:24 | B2:18 B2:6 B#2:24 | C#3:21 C#3:15 -:12 | E#2:24 F#2:24 | E#2:24 F#2:12 | D2:24 D2:18 D2:6 | C#2:24 F#2:18 A#1:6 | B1:12 B#2:12 C#3:12 C#2:12 | F#2:6 F#2:6 G#2:6 A#2:6 | B2:12 E2:12 A2:12 F#2:12 | G#2:24 C#2:24 | C#3:12 -:36 | E#1:18 -:6 F#1:18 F#1:6 | E#1:18 -:6 F#1:12 | D2:6 D2:18 D2:6 D2:6 B2:6 D2:6 | C#2:6 C#2:18 F#1:6 F#2:12 A#1:6 | B1:12 B#2:12 C#3:12 C#2:12 | F#1:24 -:48 | A2:24 G#2:12 F#2:12 | E2:12 F#2:6 G#2:6 A2:18 B2:6 | F#3:6 D#4:6 F#2:6 C#3:6 G#3:6 B3:6 F#2:6 C#3:6 F#2:6 G#2:6 | A1:24 G#1:12 F#1:12 | C#3:12 E1:12 D2:6 D2:18 | A1:12 B1:12 F#1:24 | F#2:12 E2:12 D2:6 D2:18 | D2:6 G#1:6 A1:12 B1:12 F#1:12 | G#3:6 B3:6 F#2:12 E1:12 D2:6 D2:6 | A2:6 D2:6 A1:12 B1:12 F#1:60 | -:12 F#1:12 G#1:6 A#1:6 | B1:12 E2:12 A1:12 F#1:12 | G1:12 C#2:12 F#1:12 G#1:6 A#1:6 | B1:12 E1:12 A1:12 F#1:12 | G#1:12 B#2:2 G#2:2 D#2:2 G#1:2 G#2:2 G#1:2 C#2:6 F#2:12 F#3:3 F#2:3 | C#2:12 C#2:36 | C#2:24 F#1:24 | E#1:24 F#1:12 | D2:24 E1:20 E1:2 D2:2 | C#2:24 F#1:22 F#1:2 | B1:12 C2:12 C#2:12 C#2:6 C#2:2 C#2:2 -:2 | F#1:6 F#1:6 C#2:6 F#2:6 C#3:6 F#3:6 C#4:6 F#4:6 | -:30 F#2:12 F#1:6 | C#2:36 -:16' },

      // The rest of the left hand's figure, and one more chord tone.
      { wave: 'triangle', volume: 0.14, pluck: true, notes: '-:12 | G#3:24 A3:24 | G#3:24 A3:12 | F#3:24 G#3:24 | E3:24 F#3:24 | B3:12 B3:6 -:6 B#3:12 F#4:12 | C#4:12 C#4:3 A3:3 F#3:3 -:3 C#4:12 -:12 | G#3:6 C#3:6 C#4:12 A3:6 C#3:6 C#4:6 F#3:6 | G#3:6 C#3:6 C#4:12 A3:6 C#3:6 | -:6 D3:6 C#4:6 D3:6 B3:18 -:6 | E3:6 C#3:6 B3:6 C#3:6 A#3:18 A#2:6 | -:2 D3:4 B3:4 D3:4 D#3:4 B#3:4 D#3:4 C#4:4 F#3:4 G#2:4 G#2:4 E#3:4 C#4:2 | F#3:6 F#3:6 G#3:6 A#3:6 | -:2 D3:4 B3:4 D3:4 B2:4 G#3:4 G#3:4 E3:4 C#4:4 C#4:4 C#3:4 A3:4 A3:2 | -:2 G#3:2 D#3:4 G#3:2 D#3:4 G#3:2 D#3:4 G#3:2 D#3:2 -:6 C#3:2 F#3:2 A3:2 C#4:4 F#3:4 C#4:4 | -:2 G#3:4 C#3:4 E#2:2 -:36 | -:6 C#3:6 G#3:6 -:12 F#3:6 C#4:6 -:6 | -:6 C#3:6 G#3:6 -:12 F#3:6 | -:6 A2:6 A3:6 D3:6 -:6 D3:6 -:12 | -:6 G#2:6 C#3:6 G#3:6 F#2:6 F#3:6 C#3:6 A#2:6 | -:2 D3:4 B3:4 D3:4 D#3:4 B#3:4 D#3:4 C#4:4 F#3:4 G#2:4 G#2:4 G#2:4 -:2 | -:6 A3:6 B3:6 G#3:6 A3:36 -:12 | B3:6 E3:6 C#4:12 B3:6 E3:6 A3:6 C#3:6 | G#3:12 F#3:6 G#3:6 B3:6 E3:6 C#4:6 B3:6 | -:36 A3:12 F#3:6 G#3:6 | A2:6 E3:6 A3:6 E4:6 G#2:6 B3:6 F#2:6 C#3:6 | A3:6 F#3:6 E2:6 G#3:6 -:6 A2:6 D3:6 A3:6 | A2:6 A3:6 B2:6 F#3:6 F#2:6 C#3:6 G#3:6 B3:6 | F#3:6 C#3:6 E3:6 C#3:6 -:6 A2:6 D3:6 A3:6 | -:6 G#2:6 A2:6 A3:6 B2:6 F#3:6 F#2:6 C#3:6 | -:12 A3:6 C#3:6 E2:6 C#3:6 -:6 A2:6 | D3:6 -:6 A2:6 A3:6 B2:6 F#3:6 F#2:60 | -:24 G#2:6 A#2:6 | -:2 D3:4 B3:4 D3:4 E3:4 B3:4 B3:4 A2:4 E3:4 E3:4 F#2:4 C#3:4 C#3:2 | -:2 G2:4 B2:4 D3:2 -:3 C#3:3 C#4:3 C#3:3 -:2 F#2:4 F#3:4 F#2:2 -:4 G#2:2 -:4 A#2:2 | -:2 D3:4 B3:4 D3:4 E2:4 E3:4 B3:4 A2:4 A3:4 E4:4 F#2:4 F#3:4 C#4:2 | -:2 G#4:4 B#3:4 D#3:2 -:18 F#3:2 F#4:4 -:6 F#4:3 F#3:3 | G#3:12 -:36 | -:2 E#2:4 C#3:4 G#3:2 C#4:4 E#3:4 G#2:4 -:2 F#2:4 C#3:4 A3:2 C#4:4 F#3:4 A2:4 | -:2 E#2:4 C#3:4 G#3:2 C#4:4 E#3:4 G#2:4 -:2 F#2:4 C#3:4 C#3:2 | -:2 D2:4 D3:4 A3:2 D4:4 F#3:4 A2:4 -:2 E2:4 E3:4 B3:2 G#3:4 B2:4 E2:4 | -:2 C#2:4 C#3:4 G#3:2 C#4:4 E3:4 G#2:4 -:2 F#2:4 F#3:4 C#4:2 A#3:4 C#3:4 F#2:4 | -:2 B2:4 D3:4 F#3:2 -:2 C3:4 D#3:4 F#3:2 -:2 C#4:4 C#3:4 G#2:2 -:2 C#3:2 G#2:2 -:6 | F#2:6 F#2:6 C#3:6 F#3:6 C#4:6 F#4:6 C#5:6 F#5:6 | -:30 C#3:12 -:6 | F#2:36 -:16' },
      { wave: 'thin', volume: 0.12, pluck: true, notes: '-:12 | C#3:24 -:24 | -:36 | A3:24 -:24 | -:12 C#3:12 C#3:24 | D3:12 F#3:6 -:6 D#3:12 D#4:12 | A3:12 -:12 E#3:12 -:12 | -:48 | -:36 | -:12 A3:6 -:6 G#3:18 -:6 | -:12 G#3:6 -:6 F#3:18 -:6 | B2:12 -:36 | A3:6 -:18 | F#4:6 -:30 C#4:6 -:6 | B#3:24 -:24 | C#4:12 -:36 | -:6 G#2:6 E#3:6 -:12 C#3:6 A3:6 -:6 | -:6 G#2:6 E#3:6 -:12 C#3:6 | F#4:30 B3:6 B3:6 -:6 | E4:30 A#3:6 A#3:6 A#3:6 | B2:12 -:36 | -:6 C#4:6 D4:6 B3:6 C#4:36 -:12 | E5:18 -:30 | -:24 E5:18 B5:6 | -:12 F#5:24 -:24 | C#5:12 -:36 | A4:12 -:12 F#4:12 -:12 | C#5:6 -:6 D#5:6 -:6 F#5:24 | -:24 A4:24 | -:12 E4:12 D#4:6 -:6 F#4:30 | -:18 B3:12 | -:12 E4:6 -:18 C#4:12 | -:36 F#4:30 C#5:6 D#5:6 F#5:6 | F#5:6 -:6 D5:6 -:6 G#5:6 -:6 F#5:6 -:6 | E5:6 D5:6 -:12 F#4:6 F#5:6 G#5:6 A5:6 | F#5:6 -:6 D5:6 -:6 G#5:6 -:6 F#5:6 -:6 | D#5:6 -:18 C#5:6 C#4:2 C#5:2 C#6:2 F#5:3 C#6:3 C#5:3 C#4:3 | C#4:12 -:36 | E#5:18 -:6 F#5:12 -:12 | E#5:18 -:18 | D5:30 B4:6 -:12 | E5:30 C#5:6 -:12 | A4:6 F#5:6 D5:6 -:30 | A4:6 -:2 F#3:2 F#3:2 -:2 C#4:2 C#4:2 -:2 F#4:2 F#4:2 -:2 C#5:2 C#5:2 -:2 F#5:2 F#5:2 -:2 C#6:2 C#6:2 -:2 F#6:2 F#6:2 | -:12 F#5:18 C#4:12 -:6 | A2:36 -:16' },
    ],
  },
  /**
   * My Dearest, from the anime Guilty Crown ("My Dearest", "Guilty Crown Opening Theme" and "supercell", as printed on
   * the score); written out here from a piano arrangement by TehIshter ("arr. TehIshter" on the score, "tehishter" in
   * the file name), published on sheet.host (page aWakMb); reduced to five chiptune voices.
   *
   * HOW IT WAS WRITTEN OUT (the PDF is not in the repository): bar by bar from the score's 6 pages, 117 bars, no
   * repeats. The score prints no tempo; it plays at 120 quarter notes a minute and a step is a sixteenth, `bpm: 120`,
   * so every value from the whole note to the sixteenth is exact. The sixteenth triplets of bar 76 are two sixteenths
   * a triplet (each triplet's third note is the next one's first pitch and is left out; the second comes at most a
   * third of a step late). rit. and animato are left out (one bpm); the fermata on the whole notes of bar 8 adds two
   * beats, those of bars 41 and 113 one. A bar line `|` stands at every bar of the score (16 steps; 24 in bar 8, 20
   * in bars 41 and 113). The leading rests of the printed first bar (three beats, before the pickup G3) are left out,
   * so the piece sounds at once: bar 1 is 4 steps, and the end is padded with a rest of 12 steps to a multiple of 16
   * (1,888 steps, as long as before). No key signature: pitches carry the accidentals printed in their bar (G#, C#, Ab); the 8vb
   * of bars 17 and 18 and the 8va of bars 76 and 77 are written out; a tie is one note in the bar where it starts.
   * Reduced on purpose: the melody is the tune (the left hand's upper line in bars 1 to 5, else the top of the right
   * hand); the second voice the right hand's next line (the intro's eighth figure, the lower octave or the lower
   * voice); the bass the lowest line of the left hand, held to its next note (in the verse on the first and third
   * beat only); the octave voice one tone of the left hand's chords, its arpeggios on the beat and its repeated
   * eighth chords on the off-beats; the inner voice one more chord tone; other chord notes are left out. Notes under
   * 40 Hz (the low C1, C#1 and D1 octaves, and B0 and A0 under the 8vb) are left out. No dynamics or pedal:
   * `levelled` sets the loudness (content/guilty-crown.test.ts checks every bar).
   */
  'guilty-crown': {
    bpm: 120,
    loop: false,
    voices: [
      { wave: 'pulse', volume: 0.2, pluck: true, notes: 'G3:4 | C4:4 B3:2 A3:4 G3:4 G3:4 | D3:4 E3:6 F3:4 | E3:4 F3:2 E3:4 F3:4 E3:4 | D3:2 C3:6 B2:6 | -:16 | -:16 | C6:24 | -:4 C4:4 D4:4 C4:4 | C6:16 | C6:6 B5:6 A5:4 | G5:16 | G5:6 F5:6 E5:4 | D5:16 | D5:6 E5:6 F5:4 | E5:16 | -:4 G4:1 A4:1 B4:1 C5:1 D5:1 E5:1 F5:1 G5:1 A5:1 B5:1 C6:1 D6:1 | E6:16 | C6:6 B5:6 C6:4 | G6:16 | G6:6 F6:6 E6:4 | D6:16 | -:4 F5:4 A5:4 C6:4 | D6:16 | E6:16 | E4:28 | C4:2 G4:2 | G4:6 F4:6 E4:8 | C4:4 D4:4 C4:4 | D4:6 C4:1 D4:1 C4:20 | B3:2 C4:2 | B3:8 C4:4 B3:8 | G3:8 G3:4 | G3:4 A3:2 A3:22 | C4:4 | G3:28 | G3:2 E4:2 | E4:4 F4:2 F4:24 | E4:2 | D4:14 C4:2 | B3:16 C4:2 C4:30 | | C5:2 G5:2 | G5:6 F5:6 E5:8 | C5:4 D5:4 C5:4 | D5:6 C5:22 | B4:2 C5:2 | A4:8 C#5:4 D5:8 | E5:8 F5:4 | E5:4 D5:2 C5:22 | B4:2 C5:2 | G4:28 | G4:2 E5:2 | E5:4 F5:2 F5:24 | E5:2 | D5:16 | -:4 C5:4 E5:4 D5:4 | C5:4 C6:2 C6:4 C6:4 C6:4 | C6:4 C6:4 C6:4 C6:6 | B5:2 A5:4 G5:4 G5:14 | C5:2 D5:2 | E5:4 F5:2 E5:6 C5:2 D5:2 | E5:4 F5:2 E5:6 C5:2 D5:2 | E5:4 F5:2 E5:4 F5:4 E5:4 | D5:4 C5:4 D5:6 | -:6 C4:2 F4:2 A4:2 C5:2 F5:2 | C6:8 C6:2 C6:2 C6:2 C6:2 | A5:4 G5:12 | G6:4 -:2 C6:2 D6:2 E6:6 | E6:12 F6:2 E6:14 | C6:4 | E6:8 -:8 | F4:2 Ab4:2 C5:2 F5:2 Ab5:2 C6:2 D6:4 | F6:8 B5:8 | D6:8 F6:8 | G6:8 G3:1 D4:1 G4:1 D5:1 G5:1 D6:1 G6:1 D7:1 | G7:8 -:6 C5:2 | C6:4 B5:2 A5:4 G5:4 G5:4 | D5:4 E5:4 F5:4 F5:2 | E5:4 F5:2 E5:4 F5:4 E5:4 | D5:2 C5:10 C5:2 | C6:4 B5:2 A5:4 G5:4 G5:4 | D5:4 E5:4 F5:4 F5:2 | E5:4 F5:2 E5:4 F5:4 E5:4 | D5:2 C5:10 C5:2 | C6:4 B5:2 A5:4 G5:4 G5:4 | D5:4 E5:4 F5:4 F5:2 | E5:4 F5:2 E5:4 F5:4 E5:4 | D5:2 C5:8 G5:4 | C6:4 B5:2 C6:6 G5:4 | D6:4 C6:2 D6:6 G5:4 | E6:4 F6:2 E6:4 F6:4 E6:4 | D6:2 C6:4 -:6 C5:2 | C6:4 B5:2 A5:4 G5:4 G5:4 | D5:4 E5:4 F5:4 F5:2 | E5:4 F5:2 E5:4 F5:4 E5:4 | D5:2 C5:4 -:6 C5:2 | C6:4 B5:2 A5:4 G5:4 G5:4 | D5:4 E5:4 F5:4 F5:2 | E5:4 F5:2 E5:4 F5:4 G5:4 | A5:2 G5:4 -:6 C5:2 | C6:4 B5:2 A5:4 G5:4 G5:4 | D5:4 E5:4 F5:4 F5:2 | E5:4 F5:2 E5:4 F5:4 E5:4 | D5:2 C5:8 B4:4 | C5:6 F4:6 A4:4 | G4:6 E4:6 C5:4 | Ab4:6 F4:6 Ab4:4 | F4:4 C4:4 D4:4 C4:4 | C5:6 B4:6 C5:6 | D5:6 E5:4 G5:4 | A5:2 A4:2 A5:2 B5:2 B4:2 B5:2 C6:2 C5:2 | C6:2 E6:2 Ab5:2 E5:2 F5:1 Ab5:1 C6:1 F6:2 F6:6 -:1 | -:4 C4:2 C4:2 C4:2 C4:2 C4:2 C4:2 | C4:2 C4:2 C4:2 C4:2 C4:2 C4:2 C4:2 C4:2 | C4:2 C4:2 C4:28 | -:12' },
      { wave: 'thin', volume: 0.18, pluck: true, notes: '-:4 | C5:2 G4:2 C5:2 G5:2 C5:2 G4:2 C5:2 G5:2 | C5:2 G4:2 C5:2 G5:2 C5:2 G4:2 C5:2 G5:2 | C5:2 G4:2 C5:2 G5:2 C5:2 G4:2 C5:2 G5:2 | C5:2 G4:2 C5:2 G5:2 C5:2 G4:2 C5:2 G5:2 | C5:2 G4:2 C5:2 G5:2 C5:2 G4:2 C5:2 G5:2 | C5:2 G4:2 C5:2 G5:2 C5:2 G4:2 C5:2 G5:2 | -:24 | -:16 | A5:16 | A5:6 B4:6 A4:4 | C5:16 | G4:6 F4:6 E4:4 | B4:16 | D4:6 E4:6 F4:4 | C5:16 | D5:16 | A5:16 | A5:6 B4:6 C5:4 | E6:16 | G5:6 F5:6 E5:4 | A5:16 | -:4 F4:4 A4:4 C5:4 | Ab5:16 | G#5:16 | C4:28 | -:4 | C4:6 B3:18 | -:8 | B3:6 -:10 | -:16 | G3:8 -:8 | -:16 | -:4 F3:2 F3:22 | -:4 | E3:28 | -:4 | -:6 C4:24 | -:2 | -:16 | -:20 | G3:28 | -:4 | C5:6 B4:18 | -:8 | B4:6 A4:22 | -:4 | -:8 A4:4 A4:8 | C#5:8 -:4 | A4:8 -:8 | -:16 | E4:28 | -:4 | -:4 C5:2 C5:24 | -:2 | -:16 | -:16 | -:4 F5:2 F5:4 F5:4 F5:4 | F5:4 C5:4 C5:4 C5:6 | B4:2 A4:4 G4:4 D5:2 | C5:4 B4:2 A4:4 G4:6 | C5:8 -:8 | C5:8 -:8 | G4:8 -:8 | -:16 | C5:24 | -:8 | A4:4 G4:12 | G5:4 -:2 C5:2 D5:2 E5:6 | E5:12 F5:2 E5:14 | C5:4 | Ab5:8 -:8 | -:8 C5:2 F4:2 C5:2 Ab4:2 | F5:8 B4:8 | D5:8 F5:8 | G5:8 -:8 | -:16 | F5:4 -:10 D5:4 | -:14 | C5:4 -:12 | -:16 | F5:4 -:10 D5:4 | -:4 G#4:4 -:6 | C5:4 -:10 C5:4 | -:14 | A5:4 B4:2 A4:4 G4:4 D5:4 | D4:4 E4:4 F4:4 F4:2 | E4:4 F4:2 E4:4 F4:4 E4:4 | D4:2 C4:8 G4:4 | C5:4 B4:2 C5:6 G4:4 | D5:4 C5:2 D5:6 G4:4 | E5:4 F5:2 E5:4 F5:4 E5:4 | D5:2 C5:4 -:8 | A5:4 B4:2 A4:4 G4:4 C5:4 | D4:4 E4:4 F4:4 F4:2 | E4:4 F4:2 E4:4 F4:4 E4:4 | D4:2 C4:4 -:8 | A5:4 B4:2 A4:4 G4:4 E5:4 | D4:4 E4:4 F4:4 F4:2 | E4:4 F4:2 E4:4 F4:4 E5:4 | A4:2 G4:4 -:8 | A5:4 B4:2 A4:4 G4:4 C5:4 | D4:4 E4:4 F4:4 F4:2 | E4:4 F4:2 E4:4 F4:4 E4:4 | D4:2 C4:8 B3:4 | A4:6 D4:6 D4:4 | E4:6 C4:6 G4:4 | C4:6 C4:6 C4:4 | Ab3:4 -:12 | E4:6 D4:6 E4:6 | D4:6 E4:4 G4:4 | F5:4 F5:2 G5:4 G5:2 A5:4 | A5:2 C6:2 -:7 F5:2 F5:6 -:1 | -:16 | -:16 | -:4 E3:28 | -:12' },
      { wave: 'triangle', volume: 0.18, pluck: true, notes: '-:4 | C3:14 G2:18 | | A2:14 E2:18 | | F2:56 | | | -:8 G1:8 | A1:14 A1:2 | A1:16 | F1:14 F1:2 | F1:16 | G1:14 G1:2 | G1:16 | C2:16 | B1:16 | A1:14 A1:2 | A1:16 | E1:14 E1:2 | E1:16 | F1:14 F1:2 | F1:16 | F1:16 | G1:8 D3:8 | C2:8 E2:8 | E2:8 C3:8 | E1:8 G#2:8 | G#2:8 D3:8 | A1:8 C3:8 | C3:8 A3:8 | G1:8 B2:8 | G3:4 E3:4 E3:4 B2:4 | F1:8 A2:8 | A2:8 F3:8 | E1:8 G2:8 | G2:8 E3:8 | F1:8 Ab2:8 | Ab2:8 F3:8 | G1:8 F3:8 | G1:20 | C2:8 E2:8 | C3:8 G3:8 | E1:8 G#2:8 | D3:4 G#3:12 | A1:8 C3:8 | A3:8 E4:8 | C#2:8 E2:8 | C#3:8 G3:8 | D2:8 F2:8 | D3:8 A3:8 | E1:8 G2:8 | E3:8 C4:8 | F1:8 Ab2:8 | F3:8 F3:8 | G1:8 F3:8 | G1:8 G2:8 | F1:30 | F1:2 | G1:30 | G1:2 | A1:16 | A1:16 | E1:30 | C2:2 | F1:30 | F1:2 | E1:28 | C2:4 | F1:30 | F1:2 | F1:4 Ab1:2 C2:2 F2:2 Ab2:2 C3:2 F3:2 | -:16 | -:16 | -:14 F1:2 | G1:6 G2:1 D3:1 -:8 | -:16 | F1:16 | D3:16 | E2:16 | A2:16 | F1:16 | G2:6 G#2:6 E2:4 | A2:16 | C3:8 G2:2 E2:2 C2:4 | F1:16 | G1:16 | A1:16 | E1:16 | F1:16 | G1:14 G#1:2 | A1:16 | -:8 A1:2 A1:2 G1:2 G1:2 | F1:8 F2:8 | F1:8 F2:8 | G1:8 G2:8 | G1:8 G2:8 | A1:8 A2:8 | A1:8 A2:8 | C2:8 C3:8 | E1:8 C3:8 | F1:8 F2:8 | F1:8 F2:8 | A1:8 A2:8 | G1:8 G2:8 | D2:6 D2:6 F2:4 | E1:6 E2:6 G2:4 | F1:6 F2:6 F2:4 | G1:16 | A2:6 G2:6 A2:6 | A2:6 E1:4 C2:4 | D2:2 A1:2 D2:2 E1:2 C2:2 E1:2 F1:2 C2:2 | F1:2 F1:2 C2:2 F1:5 G1:2 G1:6 -:1 | -:4 C2:4 C2:4 C2:4 | C2:4 C2:4 C2:4 C2:4 | C2:4 C2:28 | -:12' },

      // The left hand's chord tones, and one more chord tone.
      { wave: 'triangle', volume: 0.14, pluck: true, notes: '-:4 | F3:14 D3:18 | | C3:14 G2:18 | | A2:56 | | | -:8 G2:8 | A2:4 E3:4 A3:4 E3:2 A2:2 | A2:4 C4:4 E4:4 C4:4 | F2:4 C3:4 F3:4 C3:2 F2:2 | F2:4 A3:4 C4:4 A3:4 | G2:4 D3:4 G3:4 D3:2 G2:2 | G2:4 B3:4 D4:4 B3:4 | -:4 C4:4 E4:4 C4:4 | -:4 B3:4 D4:4 B3:4 | -:4 E3:4 A3:4 E3:2 A2:2 | A2:4 C4:4 E4:4 C4:4 | E2:4 B2:4 E3:4 B2:2 E2:2 | E2:4 G3:4 B3:4 G3:4 | F2:4 C3:4 F3:4 C3:2 F2:2 | F2:4 A3:4 C4:4 A3:4 | F2:4 Ab3:2 C4:4 Ab3:2 C4:4 | G2:8 B3:8 | -:4 G2:4 C3:4 G2:4 | C3:4 E3:4 G3:4 E3:4 | E2:4 B2:4 E3:4 B2:4 | E3:4 G#3:4 B3:4 G#3:4 | A2:4 E3:4 A3:4 E3:4 | A3:4 C4:4 E4:4 C4:4 | G2:4 E3:4 G3:4 E3:4 | -:8 B3:4 G3:4 | F2:4 C3:4 F3:4 C3:4 | F3:4 A3:4 C4:4 A3:4 | E2:4 C3:4 E3:4 C3:4 | E3:4 G3:4 C4:4 G3:4 | F2:4 C3:4 F3:4 C3:4 | F3:4 Ab3:4 C4:4 Ab3:4 | G2:4 Ab3:4 B3:4 Ab3:4 | G2:20 | -:4 G2:4 C3:4 E3:4 | G3:4 C4:4 E4:4 C4:4 | E2:4 B2:4 E3:4 G#3:4 | B3:4 D4:4 C4:4 B3:4 | A2:4 E3:4 B3:4 C4:4 | E4:4 A4:4 C5:4 A4:4 | -:4 A2:4 C#3:4 E3:4 | A3:4 C#4:4 D4:4 E4:4 | -:4 A2:4 E3:4 F3:4 | A3:4 D4:4 F4:4 D4:4 | E2:4 C3:4 E3:4 G3:4 | C4:4 E4:4 G4:4 E4:4 | F2:4 C3:4 F3:4 Ab3:4 | C4:4 Ab3:4 C4:4 F4:4 | G2:4 Ab3:4 B3:4 Ab3:4 | G2:8 G3:8 | -:2 F2:2 A2:4 F3:4 C4:4 | F4:4 A3:4 C3:4 F2:4 | -:2 G2:2 B2:4 G3:4 D4:4 | G4:4 B3:4 D3:4 G2:4 | -:2 A2:2 C3:4 A3:4 C3:4 | -:2 A2:2 C3:4 A3:4 C3:4 | -:2 E2:6 G2:4 C3:4 | E3:4 G3:4 C3:4 E2:4 | -:2 F2:2 A2:4 F3:4 C4:4 | F4:4 A3:4 C3:4 F2:4 | -:2 E2:6 E3:4 G3:4 | C4:4 E3:4 G2:8 | -:2 F2:2 A2:4 F3:4 C4:4 | F4:4 A3:4 C3:4 F2:4 | -:16 | Ab3:2 C4:2 F4:2 Ab4:2 -:8 | D5:4 Ab4:4 D4:4 Ab3:4 | D3:4 Ab2:4 D2:4 Ab1:4 | G2:6 -:10 | -:16 | F2:4 C3:4 F3:4 A3:4 | C4:6 B3:6 A3:4 | G3:8 C4:4 E3:4 | G3:6 F3:6 E3:4 | F2:4 C3:4 F3:4 A2:4 | D3:6 E3:6 F3:4 | E3:8 A3:4 C3:4 | C4:8 -:8 | F2:4 A3:4 A3:4 A3:4 | G2:4 B3:4 B3:4 B3:4 | A2:4 C4:4 C4:4 C4:4 | E2:4 G3:4 G3:4 G3:4 | F2:4 F3:4 A3:4 F3:4 | G2:4 G3:4 B3:4 G#2:4 | A2:4 A3:2 C4:14 | -:4 A2:2 A2:2 G2:2 G2:2 | -:2 F3:2 -:2 F3:2 -:2 F3:2 -:2 F3:2 | -:2 F3:2 -:2 F3:2 -:2 F3:2 -:2 F3:2 | -:2 G3:2 -:2 G3:2 -:2 G3:2 -:2 G3:2 | -:2 G3:2 -:2 G3:2 -:2 G3:2 -:2 G3:2 | -:2 A3:2 -:2 A3:2 -:2 A3:2 -:2 A3:2 | -:2 A3:2 -:2 A3:2 -:2 A3:2 -:2 A3:2 | -:2 C4:2 -:2 C4:2 -:2 C4:2 -:2 C4:2 | -:2 C4:2 -:2 C4:2 -:2 C4:2 -:2 C4:2 | -:2 F3:2 -:2 F3:2 -:2 F3:2 -:2 F3:2 | -:2 F3:2 -:2 F3:2 -:2 F3:2 -:2 F3:2 | -:2 A3:2 -:2 A3:2 -:2 A3:2 -:2 A3:2 | -:2 G3:2 -:2 G3:2 -:2 G3:2 -:2 G3:2 | -:6 A2:6 D3:4 | E2:6 C3:6 E3:4 | F2:6 C3:6 F3:4 | G2:16 | A3:6 G3:6 A3:6 | B3:6 E2:4 -:4 | -:16 | F2:2 F2:2 -:2 F2:5 G2:2 G2:6 -:1 | -:16 | -:16 | -:16 | -:28' },
      { wave: 'thin', volume: 0.12, pluck: true, notes: '-:4 | A3:14 -:2 | -:16 | -:14 C3:18 | | C3:56 | | | -:16 | E5:16 | C5:6 -:10 | A4:16 | C5:6 -:10 | G4:16 | B4:6 -:10 | G4:16 | G4:16 | -:16 | C5:6 -:10 | B5:16 | B5:6 -:10 | F5:16 | -:4 A4:4 C5:4 -:4 | F5:16 | B5:16 | G3:28 | -:4 | G#3:6 -:10 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:6 Ab3:24 | -:2 | -:16 | -:20 | E3:28 | -:4 | G#4:6 -:10 | -:16 | -:16 | -:16 | -:16 | -:4 A4:8 -:4 | F4:8 -:8 | -:16 | -:16 | -:16 | -:4 Ab4:2 Ab4:24 | -:2 | -:16 | -:8 D3:8 | -:4 C5:2 C5:4 C5:4 C5:4 | -:14 | -:14 B4:14 | -:4 | A4:8 -:8 | A4:8 -:8 | E4:8 -:8 | -:16 | F4:24 | -:8 | -:10 G4:2 C5:2 E5:2 | -:16 | A5:12 -:2 A5:14 | -:4 | E5:8 -:8 | -:12 D5:4 | Ab5:8 D5:8 | F5:8 -:8 | -:16 | -:16 | -:14 B4:4 | -:14 | G4:4 -:12 | -:16 | -:14 B4:4 | -:14 | A4:4 -:10 G4:4 | -:14 | F5:4 -:10 B4:4 | -:14 | C5:4 -:10 G4:4 | -:14 | A5:8 -:8 | B5:8 -:8 | C6:4 -:10 A5:4 | -:14 | F5:4 -:10 A4:4 | -:14 | G4:4 -:12 | -:16 | E5:4 -:10 C5:4 | -:14 | G4:4 -:10 C5:4 | -:14 | F5:4 -:10 A4:4 | -:14 | A4:4 -:10 G4:4 | -:14 | F4:6 -:10 | C4:6 -:10 | Ab3:6 -:10 | -:16 | -:16 | -:16 | -:16 | -:20 | -:16 | -:16 | -:4 C3:28 | -:12' },
    ],
  },
  /**
   * Idol, the opening of the anime Oshi no Ko ("Idol" and '"Oshi no Ko" OP', performed by YOASOBI (ikura) and
   * composed by Ayase, as printed on the score); written out here from a piano arrangement by FlattenSharp
   * ("Arranged by FlattenSharp" on the score), published on sheet.host (page MnQsUg); reduced to five chiptune voices.
   *
   * HOW IT WAS WRITTEN OUT (the PDF is not in the repository): bar by bar from the score's 9 pages, 73 bars, no
   * repeats. The score marks quarter = 83, then 75 (bar 44), 80 (the end of bar 52) and 83 again (bar 57); the format
   * takes one bpm, so it all plays at 83 and a step is a sixteenth, `bpm: 83`: eighths and sixteenths are exact (the
   * 75 and 80 sections come about 3 s shorter than marked). A bar line `|` stands at every bar of the score (16 steps;
   * bars 52 and 57 are 2/4, 8 steps). Pitches carry the accidentals of their key and bar (five flats, four sharps, none,
   * four sharps, seven sharps; E#, B#, F##, Fb, Cb); the double flats (bars 1 to 4 and 44 to 46: Abb5, Bbb1) are
   * written as the notes they sound, G5 and A1; the 8va of bars 35 and 53 to 57 is written out; a tie is one note in
   * the bar where it starts. Reduced on purpose, so the tune stays clear: the melody is the tune (the right hand's top
   * line; in the chorus the top of its chords; in the intro riffs its sixteenth line); the second voice one more
   * right-hand tone on the main beats; the bass the lowest note of the left hand on the beats and on the anticipations
   * tied over them; the octave voice a left-hand figure, sampled, where it has a line of its own; the inner voice now
   * and then a chord tone. Triplets are one or two notes, the 32nd runs (bars 5, 7 to 10, 17, 35, 69, 70 and 73) two
   * notes a beat or fewer, grace notes and other chord notes are left out. No notes under 40 Hz. No dynamics or pedal:
   * `levelled` sets the loudness (content/idol.test.ts checks every bar).
   */
  idol: {
    bpm: 83,
    loop: false,
    voices: [
      { wave: 'pulse', volume: 0.2, pluck: true, notes: '-:2 Ab4:1 Fb4:1 Ab4:1 Eb4:1 Gb4:1 F4:1 Ab4:1 Fb4:1 C5:1 G4:1 Ab4:1 Eb4:1 G5:2 | -:2 Ab4:1 Fb4:1 Ab4:1 Eb4:1 Fb4:1 Eb4:1 F4:1 Eb4:1 Ab4:1 F4:1 C5:1 Eb4:1 Ab5:2 | Eb4:1 B4:1 B4:1 Ab4:1 G4:1 Fb4:1 D4:1 Eb4:1 Ab4:1 Eb4:1 Ab4:1 Fb4:1 Ab4:1 Eb4:1 G5:2 | -:2 G4:2 Ab4:1 Eb4:1 Ab4:1 Eb4:1 Ab4:1 Eb4:1 Bb4:1 Eb4:1 C5:1 Eb4:1 Ab5:2 | Ab4:2 Ab4:2 Ab4:2 Gb4:1 Ab4:2 Ab4:2 Gb4:1 Ab4:2 -:2 | Eb5:2 Db5:2 Eb5:2 Fb5:2 Eb5:2 Db5:2 Eb5:2 Fb5:2 | G#4:1 B4:1 F#4:1 G#4:1 D#4:3 D#4:1 G#4:1 B4:1 F#4:1 C#4:1 D#4:3 D#4:1 | G#4:1 B4:1 F#4:1 G#4:1 D#4:1 F#4:1 C#4:1 G#3:1 C#4:1 D#4:1 C#4:1 D#4:1 G#3:2 -:1 D#4:1 | G#4:1 B4:1 F#4:1 C#4:1 D#4:3 D#4:1 G#4:1 B4:1 F#4:1 G#4:1 G#4:3 D#4:1 | G#4:1 B4:1 F#4:1 G#4:1 D#4:1 F#4:1 C#4:1 G#3:1 C#4:1 D#4:1 C#4:1 D#4:1 G#3:3 G#3:1 | G#4:2 G#4:2 B4:1 C#5:2 D#5:2 -:4 G#3:1 B3:1 C#4:1 | B4:2 G#4:2 A4:1 B4:2 A4:2 F#4:1 D#4:1 F#4:1 G#4:1 G#3:1 B3:1 C#4:1 | G#4:2 G#4:2 B4:1 C#5:2 D#5:2 -:4 G#3:1 B3:1 C#4:1 | B4:2 G#4:2 A4:1 B4:2 A4:2 F#4:1 G#4:1 D#5:1 G#4:2 B4:1 C#5:1 | D#5:2 B5:1 A5:1 -:1 F#5:1 -:1 C#5:1 -:1 B4:1 C#5:1 B4:1 D#5:1 -:1 G#4:1 D#5:1 | C#5:1 -:1 G#4:1 D#5:1 C#5:1 -:1 D#5:1 F#5:1 B5:1 A5:1 F#5:1 C#5:1 D#5:1 -:1 B4:1 C#5:1 | D#5:2 B5:1 A5:1 -:1 F#5:1 -:1 C#5:1 -:1 B4:1 C#5:1 F#5:1 D#5:2 G#4:1 D#5:1 | C#5:2 C#5:2 C#5:2 C#5:1 C#5:1 -:1 B4:1 C#5:1 B4:1 C#5:1 B4:1 C#5:1 E5:1 | D#5:3 E5:1 D#5:2 G#5:1 F##5:1 -:1 G#5:1 F##5:1 G#5:1 A5:2 E5:1 G5:1 | A5:2 E6:2 A5:2 G5:1 A5:2 E6:1 A5:1 G5:1 A5:2 E5:1 G5:1 | A5:2 C6:2 B5:2 G5:1 A5:2 B5:1 C6:1 D6:1 F6:2 E6:2 | A5:2 E6:2 A5:2 G5:1 A5:2 E6:1 A5:1 G5:1 A5:2 E5:1 G5:1 | A5:2 C6:2 B5:2 G5:1 A5:2 A5:2 G5:1 A5:2 C6:2 | A5:2 -:1 G5:1 A5:1 C6:1 D6:1 E6:1 A5:2 -:1 G5:1 A5:1 C6:1 D6:1 E6:1 | A5:2 C6:2 D6:1 C6:1 D6:1 C6:1 D6:1 E6:1 A5:1 C6:1 G5:1 A5:1 E5:1 G5:1 | A5:2 -:1 G5:1 A5:1 C6:1 D6:1 E6:1 A5:2 -:1 G5:1 A5:1 C6:1 D6:1 E6:1 | D6:1 E6:1 D6:1 E6:1 G5:1 A5:1 E5:1 A5:2 A5:2 G5:1 A5:2 -:2 | -:2 E4:2 E4:2 F4:1 Db4:1 Gb4:1 Db4:1 F4:1 Db4:1 F4:1 Db4:1 Bb4:2 | -:2 Gb4:1 C4:1 F4:1 Db4:1 E4:1 F4:1 Ab4:1 F4:1 A4:1 Gb4:1 A4:1 Gb4:1 Db5:2 | F4:1 B3:1 F4:1 C4:1 Ab4:1 Db4:1 Ab4:1 Db4:1 Ab4:1 Db4:1 Ab4:1 Db4:1 Bb4:2 D5:2 | -:2 A4:1 Eb4:1 Ab4:1 D4:1 Gb4:1 C4:1 F4:1 B3:1 Eb4:1 A3:1 Db4:2 C4:2 | A3:2 G#3:2 A3:2 G#3:2 A3:2 A3:2 A3:2 A3:2 | A3:2 A3:1 B3:1 C4:2 C4:2 C4:2 C4:1 C#4:1 C#4:2 C#4:2 | C#4:2 D4:2 Eb4:2 F4:2 F#4:1 G4:1 G4:2 A4:2 B4:2 | C#6:2 D6:2 E6:2 F#6:2 G6:2 G#6:2 A6:2 E5:1 G5:1 | A5:2 E6:2 A5:2 G5:1 A5:2 E6:1 A5:1 G5:1 A5:2 E5:1 G5:1 | A5:2 C6:2 B5:2 G5:1 A5:2 B5:1 C6:1 D6:1 F6:2 E6:2 | A5:2 E6:2 A5:2 G5:1 A5:2 E6:1 A5:1 G5:1 A5:2 E5:1 G5:1 | A5:2 C6:2 B5:2 G5:1 A5:2 A5:2 G5:1 A5:2 -:1 G5:1 | A5:2 C6:2 D6:2 E6:1 A5:2 A5:1 C6:1 A5:1 D6:1 E6:1 D6:1 E6:1 | A5:2 C6:2 B5:2 G5:1 E5:2 G5:1 D5:1 E5:1 C5:1 D5:1 E5:1 G5:1 | A5:2 C6:2 D6:2 E6:1 A5:2 A5:1 C6:1 A5:1 D6:1 E6:1 D6:1 E6:1 | A5:2 D6:2 B5:2 G5:1 A5:2 A5:1 A5:1 G5:1 A5:4 | -:2 G4:1 C4:1 Ab4:1 C4:1 Ab4:1 Db4:1 Ab4:1 Db4:1 Ab4:1 Db4:1 Bb4:1 E4:1 G5:2 | -:2 A4:1 E4:1 A4:1 E4:1 A4:1 D4:1 E4:1 Bb4:1 E4:1 Bb4:1 Bb4:1 G4:1 E6:2 | C5:2 A4:1 E4:1 C5:1 -:1 A4:1 E4:1 A4:1 E4:1 A4:1 E4:1 Bb4:1 E4:1 G5:2 | -:2 Bb4:1 E4:1 A4:1 E4:1 Bb4:1 E4:1 Bb4:1 F4:1 C5:1 F#4:1 C#5:1 G4:1 C#6:2 | -:2 Ab5:1 E5:1 Ab5:1 E5:1 Gb5:1 D5:1 Ab5:1 E5:1 G5:1 D5:1 G5:1 C5:1 C6:2 | -:2 A5:1 E5:1 A5:1 E5:1 G#5:1 D5:1 A5:1 F5:1 G#5:1 F5:1 A5:1 E5:1 D6:2 | C6:3 B5:1 B5:1 F5:1 G5:1 E5:1 G5:1 D#5:1 G5:1 D5:1 G5:1 D5:1 E6:2 | -:2 E5:2 G5:1 E5:1 B5:1 F5:1 A#5:1 G5:1 A5:1 F5:1 A#5:1 F5:1 A6:2 | F3:1 D3:1 B2:1 C3:1 A2:2 C6:1 D6:1 | E6:2 C7:1 B6:2 G6:2 D6:1 -:1 C6:1 D6:1 C6:1 E6:2 A5:1 E6:1 | D6:2 A5:1 E6:1 D6:2 E6:1 G6:1 C7:1 B6:1 G6:1 D6:1 E6:2 B4:1 C#5:1 | D#6:2 B6:1 A6:1 -:1 F#6:2 C#6:2 B5:1 C#6:1 F#6:1 D#6:2 G#5:1 D#6:1 | C#6:2 G#5:1 D#6:1 C#6:2 F#5:1 G#5:1 -:1 G#5:2 F#5:1 G#5:2 -:1 G#6:2 | F#6:1 G#6:1 D#7:1 G#6:1 C#5:1 E#5:1 G#5:1 | A#5:2 E#6:2 A#5:2 G#5:1 A#5:2 E#6:1 A#5:1 G#5:1 A#5:2 E#5:1 G#5:1 | A#5:2 C#6:2 B#5:2 G#5:1 A#5:2 B#5:1 C#6:1 D#6:1 F#6:2 E#6:2 | A#5:2 E#6:2 A#5:2 G#5:1 A#5:2 E#6:1 A#5:1 G#5:1 A#5:2 E#5:1 G#5:1 | A#5:2 C#6:2 B#5:2 G#5:1 A#5:1 -:1 A#5:2 G#5:1 A#5:2 C#6:2 | A#5:2 -:1 G#5:1 A#5:1 C#6:1 D#6:1 E#6:1 A#5:2 -:1 G#5:1 A#5:1 C#6:1 D#6:1 E#6:1 | A#5:2 C#6:2 D#6:1 C#6:1 D#6:1 C#6:1 D#6:1 E#6:1 A#5:1 C#6:1 G#5:1 E#5:1 D#6:2 | C#6:2 -:1 G#5:1 A#5:1 C#6:1 D#6:1 E#6:1 A#5:2 -:1 G#5:1 A#5:1 C#6:1 D#6:1 E#6:1 | D#6:1 E#6:1 D#6:1 E#6:1 G#5:1 A#5:1 E#5:1 A#5:1 -:1 A#5:2 G#5:1 A#5:2 -:2 | A#5:3 A#5:2 C#6:1 D#6:1 E#6:1 A#5:3 G#5:1 G#5:1 A#5:1 C#6:1 D#6:1 | E#6:2 D#6:1 E#6:1 B#5:1 G#5:1 E#5:1 A#5:1 -:1 A#5:2 G#5:1 A#5:2 C#5:1 E#5:1 | G#5:1 A#5:2 A#4:5 C#5:1 D#5:1 D##5:1 E#5:1 -:1 G#4:1 A#4:1 C#5:1 | G#5:1 A#5:2 A#4:5 C#6:1 D#6:1 D##6:1 E#6:1 -:1 D#6:1 C#6:1 -:1 | G#5:1 A#5:2 A#4:5 C#5:1 D#5:1 D##5:1 E#5:1 -:1 G#4:1 A#4:1 C#5:1 | G#5:1 A#5:2 A#4:5 C#5:1 G#4:1 D#5:1 C#5:1 -:1 C#5:1 C#6:1 -:1 | A#5:2 G#5:2 A#5:2 B5:2 A#5:2 G#5:2 A#5:2 B5:2 | A#5:2 G#5:2 A#5:2 B5:2 -:8' },
      { wave: 'thin', volume: 0.18, pluck: true, notes: '-:16 | -:16 | -:16 | -:16 | Eb4:7 Eb4:7 -:2 | Cb5:8 C5:8 | -:16 | -:16 | -:16 | -:2 B3:4 D#3:3 F#3:7 | D#4:3 D#4:5 D#4:3 D#4:5 | D#4:8 -:8 | D#4:3 D#4:5 D#4:3 D#4:5 | D#4:16 | B4:7 G#4:9 | G#4:8 G#5:8 | B4:7 G#4:9 | G#4:2 F#4:4 F##4:10 | A#4:16 | F5:7 E5:9 | F5:16 | F5:7 E5:9 | F5:7 E5:9 | F5:8 E5:8 | F5:16 | F5:8 E5:8 | A5:7 E5:7 -:2 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | F5:7 E5:9 | F5:16 | F5:7 E5:9 | F5:7 E5:9 | F5:16 | F5:7 C5:9 | F5:16 | F5:7 E5:9 | -:16 | -:16 | -:16 | -:16 | E5:8 D5:8 | C#5:16 | E5:8 D5:8 | C#5:16 | -:8 | C6:3 G6:4 A5:9 | A5:8 G6:8 | B5:7 G#5:9 | G#5:4 F#5:8 D#5:3 D#6:2 | -:2 D#6:2 -:1 D#5:1 E#5:1 | F#5:7 E#5:9 | F#5:16 | F#5:7 E#5:9 | F#5:7 E#5:9 | F#5:8 E#5:8 | F#5:16 | A#5:8 E#5:8 | A#5:16 | A#4:7 E#5:3 C#5:6 | A#5:16 | -:16 | -:16 | -:16 | -:16 | E#5:8 F5:8 | E#5:8 -:8' },
      { wave: 'triangle', volume: 0.18, pluck: true, notes: 'Ab1:10 A1:3 Gb1:3 | Ab1:10 A1:3 Db2:3 | Ab1:10 A1:3 Gb1:3 | Ab1:10 A1:3 Db2:3 | Ab1:4 C3:8 Ab1:4 | Ab2:3 Eb3:5 A2:3 E3:5 | G#2:8 G#2:8 | E2:8 D#2:8 | G#2:8 B2:2 F#2:6 | E2:8 D#2:4 D#3:1 C#3:1 B2:1 A#2:1 | G#2:4 G2:4 F#2:4 E#2:4 | E2:4 D#2:4 C#2:4 D#2:4 | G#2:4 G2:4 F#2:4 E#2:4 | E2:4 D#2:8 D#3:4 | E3:4 D#3:3 C#3:5 G##2:4 | C#3:4 D#3:4 B2:2 A2:6 | E2:4 D#2:4 G#2:4 B2:4 | G#2:4 C#3:4 C#3:4 B2:4 | D#3:4 D#3:3 C#3:5 D#3:4 | F3:4 E3:3 A2:5 G3:4 | D3:4 E3:3 A2:9 | F3:4 E3:3 A2:5 G3:4 | D3:4 E3:3 A2:5 B2:4 | F2:4 E2:3 A1:9 | D2:4 E2:3 A1:9 | F2:4 E2:3 A1:9 | D2:4 E2:3 A2:9 | A1:16 | A2:16 | A1:16 | A2:3 G3:4 Eb3:5 B2:4 | A1:8 A1:4 E2:4 | A1:8 A1:4 A2:4 | -:2 A2:6 A2:4 E2:4 | A1:4 G2:4 F#3:4 E4:4 | F3:4 E3:3 A2:5 G3:4 | D3:4 E3:3 A2:9 | F3:4 E3:3 A2:5 G3:4 | D3:4 D3:3 A2:5 B2:4 | F2:4 E2:3 A1:5 G3:4 | D2:4 E2:3 A1:5 Bb2:4 | F2:4 E2:3 A1:5 G3:4 | D2:4 E2:3 A2:9 | A1:4 C3:8 Bb1:4 | A1:8 C#3:4 Bb1:4 | A1:4 C3:8 Bb1:4 | A1:8 C#3:4 Bb1:4 | A2:4 F3:4 E3:4 Bb2:4 | A2:4 A2:2 E3:6 Bb2:4 | A2:4 A2:4 F3:4 Bb2:4 | A2:4 A2:4 F3:4 A2:4 | B2:4 A1:4 | F4:4 E4:3 D4:5 A#3:4 | D4:4 E4:4 C4:4 Bb3:4 | E4:4 D#4:3 C#4:4 A3:5 | C#4:4 D#4:3 G#3:5 G#4:12 | | F#3:4 E#3:4 A#2:4 C#3:4 | D#3:4 E#3:4 A#3:4 G#3:4 | F#3:4 E#3:3 A#2:5 G#3:4 | D#3:4 E#3:3 A#2:5 A#2:4 | F#2:4 E#2:3 A#2:5 G#2:4 | F#3:4 B#2:3 A#1:5 G#3:4 | F#2:4 E#2:3 A#2:5 G#2:4 | D#3:4 D#3:3 A#2:5 E#3:4 | G#3:4 F#3:3 E#3:5 D#3:4 | D#3:4 E#3:8 C##4:4 | F#2:3 E#3:4 A#2:5 C#3:4 | F#3:3 E#3:4 A#2:4 D#3:5 | F#2:4 E#2:3 A#2:5 B3:4 | D#2:4 E#2:3 C#3:4 C#3:5 | A#2:3 E#3:5 B2:3 F3:5 | A#2:3 E#3:5 A#1:4 -:4' },

      // The left hand's figure, sampled, and one more chord tone.
      { wave: 'triangle', volume: 0.14, pluck: true, notes: '-:4 Ab3:2 -:10 | -:7 Ab3:2 -:7 | -:4 Ab3:2 -:10 | -:7 Ab3:2 -:7 | -:4 Gb3:3 Ab3:9 | -:2 Ab3:6 -:2 A3:6 | -:4 G#3:7 G#3:5 | -:4 G#3:7 D#3:5 | -:16 | -:16 | -:16 | -:1 B3:4 B3:7 -:4 | -:16 | -:1 B3:5 D#4:6 A3:4 | -:2 B3:8 B3:6 | -:16 | -:12 C#4:4 | -:16 | C#4:4 C#4:8 F##3:4 | -:16 | -:12 A4:4 | -:16 | -:16 | -:12 G3:4 | -:12 Bb3:4 | -:12 G3:4 | -:16 | -:16 | -:16 | -:16 | -:16 | -:4 A4:3 G3:9 | -:4 A4:3 Gb3:5 Gb3:4 | -:16 | -:12 B4:2 -:2 | -:16 | -:12 A4:4 | -:16 | -:16 | -:2 C4:4 B3:10 | -:16 | -:2 C4:4 B3:10 | -:12 C#4:4 | -:8 E5:2 -:6 | -:4 C#5:4 E3:8 | -:8 Eb5:2 -:6 | -:4 C#5:4 F3:8 | -:16 | -:16 | -:16 | -:16 | -:8 | -:16 | -:16 | -:16 | -:16 | -:1 C#5:1 D#5:1 F#5:1 G#5:2 -:2 | -:16 | -:12 A#4:4 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:2 A#3:8 B3:6 | -:8 A#2:1 D#3:1 G#3:1 A#3:1 -:4' },
      { wave: 'thin', volume: 0.12, pluck: true, notes: '-:16 | -:16 | -:16 | -:16 | -:16 | -:14 D#4:2 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:2 G5:6 A5:6 -:2 | -:2 G5:6 A5:8 | -:2 G5:6 A5:6 -:2 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:8 | -:16 | -:16 | -:16 | -:16 | -:8 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16' },
    ],
  },
  /** The cafe: light and easy, with a brush on the hi-hat. */
  cafe: {
    bpm: 104,
    loop: true,
    voices: [
      lead(
        [
          'B4:2 D5:2 G5:4 E5:2 D5:2 B4:4',
          'G4:2 B4:2 E5:4 D5:2 B4:2 G4:4',
          'E5:2 G5:2 C6:4 B5:2 G5:2 E5:4',
          'F#5:4 A5:4 D5:6 -:2',
          'B4:2 D5:2 G5:4 B5:2 A5:2 G5:4',
          'E5:2 G5:2 B5:4 A5:2 G5:2 E5:4',
          'C5:2 E5:2 A5:4 F#5:2 A5:2 D5:4',
          'G5:10 -:6',
        ],
        0.34,
      ),
      ...backing('G Em C D G Em Am+D G', { bass: 'walk', chords: 'quarters', drums: 'h:4 h:2 h:2 h:4 h:2 h:2' }),
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

  /** The last fight, against what Wesley sends out: the boss tune's bigger sibling, in a minor key, with a hook. */
  final: {
    bpm: 168,
    loop: true,
    voices: [
      lead([
        'A5:2 A5:2 E5:2 A5:2 C6:4 B5:2 A5:2',
        'G5:2 G5:2 D5:2 G5:2 B5:4 A5:2 G5:2',
        'F5:2 A5:2 C6:2 F6:2 E6:4 C6:4',
        'E6:2 D6:2 C6:2 B5:2 G#5:2 B5:2 E6:4',
        'A5:4 C6:2 E6:2 A6:4 G6:2 E6:2',
        'G6:4 D6:2 B5:2 G5:4 B5:2 D6:2',
        'F6:2 E6:2 D6:2 C6:2 A5:2 C6:2 F6:4',
        'E6:6 G#5:2 B5:4 E6:4',
      ]),
      ...backing('Am G F E Am G F E', { bass: 'pump', chords: 'fast', drums: DRIVING }),
    ],
  },

  /**
   * A rest in the cafe: a calm little tune of six notes over the music, up to the top and down again to a long held
   * note, with a second voice a third under it and a slow bass. It is played through before the barista speaks
   * (REST_TICKS below).
   */
  rest: {
    bpm: 168,
    loop: false,
    voices: [
      lead(['F5:3 A5:3 C6:6 Bb5:3 G5:3 A5:14'], 0.4),
      { wave: 'thin', volume: 0.22, notes: 'C5:3 F5:3 A5:6 G5:3 E5:3 F5:14' },
      { wave: 'triangle', volume: 0.55, notes: 'F3:12 C3:6 F3:14' },
    ],
  },

  /** A new level: one rising bar over the music. */
  levelup: {
    bpm: 150,
    loop: false,
    voices: [
      lead(['G5 B5 D6 G6 B6:2 G6 B6 D7:6 -:2'], 0.45),
      { wave: 'thin', volume: 0.25, notes: 'D5 G5 B5 D6 G6:2 D6 G6 B6:6 -:2' },
      { wave: 'triangle', volume: 0.6, notes: 'G3:6 D4:2 G4:6 -:2' },
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

/**
 * How loud the pieces of the player piano are. HOW TO EDIT: nothing per piece. A piece's voices are written at the
 * levels they have to each other (their balance); `levelled` then scales all of them together by one gain, the
 * smaller of: PIANO_LOUDNESS over the piece's own level (`loudnessOf`: its mean power, with the plucked notes
 * dying away), and PIANO_PEAK over its loudest step (`peakOf`). So a piece is as loud as the cafe tune it replaces,
 * or as loud as it can be with its loudest step no louder than the loudest tune's (as the cries, round 21); never
 * louder, and never quiet by accident. A test holds the rule (content/pieces.test.ts).
 */
export const PIANO_LOUDNESS = loudnessOf(TRACKS.cafe!);
export const PIANO_PEAK = Math.max(...Object.values(TRACKS).filter((track) => track.loop).map(trackPeak));

/** A piece with all its voices scaled together to the level of the pieces (above). */
export function levelled(track: Track): Track {
  const gain = Math.min(PIANO_LOUDNESS / loudnessOf(track), PIANO_PEAK / trackPeak(track));
  return { ...track, voices: track.voices.map((voice) => ({ ...voice, volume: voice.volume * gain })) };
}

for (const name of new Set(PIECES.map((piece) => piece.track))) TRACKS[name] = levelled(TRACKS[name]!);

/** Which track plays where. */
export const MUSIC: NonNullable<World['music']> = {
  title: 'title',
  ending: 'ending',
  wild: 'battle',
  boss: 'boss',
  victory: 'victory',
  indoors: 'indoors',
  maps: { town: 'town', east: 'route', west: 'route', hills: 'hills', cave: 'cave', deep: 'cave', cafe: 'cafe' },
};

// --- the sound effects ---------------------------------------------------------------------------------------------

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
  // Coins change hands: two bright clinks.
  coin: { tones: [beep(1568, 0.04, 0.24), beep(2093, 0.12, 0.24, 0.05)], gap: 0.05 },
  star: { tones: [beep(1976, 0.05, 0.28), beep(2637, 0.22, 0.28, 0.05)] },
  bump: { tones: [beep(95, 0.07, 0.3, 0, 60, 'triangle')], gap: 0.28 },
  // A hop over a ledge: a quick whistle up, and a soft thud on landing.
  jump: { tones: [beep(330, 0.14, 0.2, 0, 700), hiss(0.3, 0.05, 0.2, 0.22, 0.1)] },
  // The puzzles of the deep cave. A boulder grinds a cell on; a slide over slick rock; a plate or a lever clicks;
  // a gate rolls open: a low rumble, then two notes up.
  push: { tones: [hiss(0.18, 0.16, 0.3, 0, 0.1), beep(80, 0.16, 0.25, 0, 60, 'triangle')], gap: 0.1 },
  slide: { tones: [hiss(0.9, 0.22, 0.14, 0, 0.5)], gap: 0.1 },
  switch: { tones: [beep(1400, 0.02, 0.2, 0, undefined, 'thin'), beep(700, 0.04, 0.22, 0.03)] },
  gate: { tones: [hiss(0.12, 0.45, 0.3, 0, 0.06), beep(70, 0.45, 0.28, 0, 50, 'triangle'), beep(523, 0.08, 0.25, 0.45), beep(784, 0.16, 0.25, 0.53)] },
  heal: { tones: [beep(523, 0.08, 0.25, 0, 784), beep(784, 0.08, 0.25, 0.08, 1047), beep(1047, 0.2, 0.25, 0.16, 1568)] },
  hit: { tones: [hiss(0.8, 0.09, 0.4, 0, 0.3), beep(260, 0.12, 0.3, 0, 90)] },
  hurt: { tones: [hiss(0.4, 0.16, 0.45, 0, 0.1), beep(160, 0.18, 0.3, 0, 55, 'triangle')] },
  miss: { tones: [beep(900, 0.14, 0.14, 0, 300, 'thin')] },
  // A fighter slides down out of sight: one falling sweep, the same for every enemy, and short.
  fall: { tones: [{ wave: 'pulse', from: 900, to: 120, duration: 0.4, volume: 0.25 }] },
  faint: { tones: [beep(620, 0.5, 0.3, 0, 70), hiss(0.2, 0.3, 0.2, 0.3, 0.05)] },
  low: { tones: [beep(1000, 0.07, 0.2, 0.25), beep(1000, 0.07, 0.2, 0.42)] },
  run: { tones: [beep(400, 0.05, 0.25), beep(600, 0.05, 0.25, 0.05), beep(800, 0.05, 0.25, 0.1), beep(1200, 0.08, 0.25, 0.15)] },
  // Walking on to the next map: two soft steps. Into or out of the cave: a low, hollow breath.
  path: { tones: [hiss(0.5, 0.05, 0.22, 0, 0.3), hiss(0.5, 0.05, 0.22, 0.13, 0.3)] },
  cave: { tones: [hiss(0.15, 0.4, 0.3, 0, 0.05), beep(110, 0.35, 0.25, 0.02, 70, 'triangle')] },
  // The settings: the sound switch (heard when it goes on) and the screen switch.
  sound: { tones: [beep(660, 0.04, 0.22), beep(990, 0.06, 0.22, 0.04)] },
  screen: { tones: [beep(520, 0.03, 0.2), beep(780, 0.05, 0.2, 0.03)] },
  // Game Boy and Game Boy Color: a little chime up.
  mode: { tones: [beep(660, 0.04, 0.2), beep(880, 0.04, 0.2, 0.04), beep(1320, 0.08, 0.2, 0.08)] },
  // The light of the screen, bright or dim: the screen switch going down.
  light: { tones: [beep(780, 0.03, 0.2), beep(520, 0.05, 0.2, 0.03)] },
  // The volume wheel: one step down, one step up. They sound at the new volume, so the step can be heard.
  quieter: { tones: [beep(740, 0.05, 0.25), beep(587, 0.07, 0.25, 0.05)] },
  louder: { tones: [beep(740, 0.05, 0.25), beep(988, 0.07, 0.25, 0.05)] },
  // The way into a battle. The music is silent meanwhile, and the battle tune starts when they are over, so each
  // must end within its transition (WILD_TICKS and BOSS_TICKS in engine/transition.ts, 60 ticks a second: 0.8 and
  // 1.8 seconds). A wild enemy: three quick sweeps up and a last one that climbs higher.
  encounter: {
    tones: [hiss(0.1, 0.7, 0.3, 0, 1), beep(300, 0.15, 0.25, 0, 1200), beep(300, 0.15, 0.25, 0.15, 1200), beep(300, 0.15, 0.25, 0.3, 1200), beep(300, 0.3, 0.25, 0.45, 1800)],
  },
  // A boss: two low alarm calls (the screen blinks with them), then a long climb while the dark closes in.
  showdown: {
    tones: [
      beep(880, 0.2, 0.25, 0.03, 440),
      beep(220, 0.2, 0.3, 0.03, 110, 'triangle'),
      beep(880, 0.2, 0.25, 0.43, 440),
      beep(220, 0.2, 0.3, 0.43, 110, 'triangle'),
      hiss(0.1, 0.9, 0.3, 0.83, 1),
      beep(200, 0.9, 0.25, 0.83, 1600),
      beep(100, 0.9, 0.3, 0.83, 400, 'triangle'),
    ],
  },
  // The next boss of a fight that goes on: one alarm call and a short climb. It must end within QUICK_TICKS (0.6 seconds).
  round: {
    tones: [
      beep(880, 0.15, 0.25, 0.03, 440),
      beep(220, 0.15, 0.3, 0.03, 110, 'triangle'),
      hiss(0.1, 0.35, 0.3, 0.2, 1),
      beep(200, 0.35, 0.25, 0.2, 1600),
      beep(100, 0.35, 0.3, 0.2, 400, 'triangle'),
    ],
  },
};

/**
 * The cry of every enemy, heard when it is on the screen (the cue `cry:<enemy id>`). HOW TO EDIT: `wave` and a sweep
 * of the pitch from `from` to `to` (Hz) over `duration` seconds; `trill` splits it into that many short calls going
 * back and forth; `noise` lays a hiss of that brightness (0.05 a rumble, 1 a hiss) under it. Keep them short (a test
 * wants under 0.75 s) and every one different: a test fails for an enemy without a cry, or for two that sound the same.
 */
export type Cry = { wave: Wave; from: number; to: number; duration: number; trill?: number; noise?: number };
export const CRIES: Record<string, Cry> = {
  bug: { wave: 'pulse', from: 900, to: 1400, duration: 0.2, trill: 2 },
  typo: { wave: 'thin', from: 1200, to: 700, duration: 0.18 },
  lint: { wave: 'pulse', from: 600, to: 650, duration: 0.25, trill: 3 },
  todo: { wave: 'triangle', from: 300, to: 500, duration: 0.3 },
  popup: { wave: 'pulse', from: 1500, to: 1800, duration: 0.2, trill: 2 },
  spam: { wave: 'thin', from: 800, to: 800, duration: 0.3, trill: 4 },
  lag: { wave: 'triangle', from: 500, to: 200, duration: 0.45 },
  update: { wave: 'pulse', from: 400, to: 900, duration: 0.35 },
  flaky: { wave: 'thin', from: 1000, to: 600, duration: 0.25, trill: 3 },
  debt: { wave: 'triangle', from: 180, to: 120, duration: 0.4, noise: 0.1 },
  meeting: { wave: 'pulse', from: 350, to: 300, duration: 0.5 },
  memleak: { wave: 'triangle', from: 220, to: 440, duration: 0.4, trill: 2 },
  nullptr: { wave: 'thin', from: 1300, to: 200, duration: 0.3 },
  race: { wave: 'pulse', from: 1100, to: 1300, duration: 0.2, trill: 4 },
  droptable: { wave: 'triangle', from: 260, to: 90, duration: 0.45, noise: 0.2 },
  error500: { wave: 'pulse', from: 500, to: 250, duration: 0.3, noise: 0.4 },
  friday: { wave: 'thin', from: 700, to: 1400, duration: 0.3, trill: 2 },
  diskfull: { wave: 'triangle', from: 150, to: 150, duration: 0.35, noise: 0.3 },
  exam: { wave: 'pulse', from: 700, to: 500, duration: 0.4, trill: 2 },
  legacy: { wave: 'triangle', from: 120, to: 90, duration: 0.55, noise: 0.15 },
  scope: { wave: 'thin', from: 600, to: 1000, duration: 0.4, trill: 3 },
  deadline: { wave: 'pulse', from: 1000, to: 1000, duration: 0.3, trill: 4 },
  interview: { wave: 'pulse', from: 440, to: 330, duration: 0.5, trill: 2 },
  review: { wave: 'thin', from: 523, to: 392, duration: 0.5, trill: 3 },
  impostor: { wave: 'triangle', from: 300, to: 150, duration: 0.6, noise: 0.05 },
  outage: { wave: 'pulse', from: 200, to: 100, duration: 0.6, noise: 0.5 },
};

/**
 * How loud a cry may be at its peak: the loudest battle tune's own (1.46, all its voices together), and no more, as
 * a monster's cry stands up to the music in Pokémon Gold. A tone is never written above half, so a cry gets there
 * by a gain of its own. A test holds every cry at or under the tunes' peak, most within a tenth under it.
 */
const CRY_PEAK = 1.46;

/**
 * How loud a cry is over its length (an RMS level: the mean power of its tones, each wave's RMS at full scale
 * below). At the same peak a square is about 5 dB fuller than a triangle or the thin pulse, so the square cries
 * sounded louder than the rest; a cry is turned down to this level when its peak alone would make it fuller.
 * It is what a plain triangle or thin cry has at CRY_PEAK; a test keeps every cry within 3 dB of the loudest.
 */
const CRY_LOUDNESS = 0.84;
/** The RMS of each wave at full scale: a square 1; the browser-normalised 25% pulse, a triangle and white noise about 0.577. */
const WAVE_RMS: Record<Wave, number> = { pulse: 1, thin: Math.sqrt(1 / 3), triangle: Math.sqrt(1 / 3), noise: Math.sqrt(1 / 3) };

/** The RMS level of a list of tones over its length (unrelated sources: their powers add). */
function levelOf(tones: Tone[]): number {
  const length = Math.max(...tones.map((tone) => (tone.at ?? 0) + tone.duration));
  return Math.sqrt(tones.reduce((sum, tone) => sum + (tone.volume * WAVE_RMS[tone.wave]) ** 2 * tone.duration, 0) / length);
}

/** The most a list of tones adds up to at one moment: those that overlap, checked where each one starts. */
function peakOf(tones: Tone[]): number {
  return Math.max(...tones.map((tone) => tones.filter((other) => (other.at ?? 0) <= (tone.at ?? 0) && (tone.at ?? 0) < (other.at ?? 0) + other.duration).reduce((sum, other) => sum + other.volume, 0)));
}

/** A cry as an effect: the calls of the sweep (back and forth when it trills), the hiss under them, and the pause of the music. */
function cryEffect(cry: Cry): Effect {
  const calls = cry.trill ?? 1;
  const each = cry.duration / calls;
  const tones: Tone[] = Array.from({ length: calls }, (_, i) => {
    const [from, to] = i % 2 === 0 ? [cry.from, cry.to] : [cry.to, cry.from];
    return { wave: cry.wave, at: i * each, from, to, duration: each * (calls > 1 ? 0.8 : 1), volume: cry.wave === 'triangle' ? 0.35 : 0.25 };
  });
  if (cry.noise !== undefined) tones.push({ wave: 'noise', at: 0, from: cry.noise, to: cry.noise, duration: cry.duration, volume: 0.15 });
  // The music pauses for the cry, as long as the cry is, and carries on after it. The cry is as loud as its peak
  // may be, or as its fullness may be, whichever is less. Asked for again while it sounds (CRY in the DEX), it is
  // skipped, pause and all: the `gap`.
  return { tones, hush: cry.duration, gap: cry.duration, gain: Math.min(CRY_PEAK / peakOf(tones), CRY_LOUDNESS / levelOf(tones)) };
}

for (const [id, cry] of Object.entries(CRIES)) EFFECTS[`cry:${id}`] = cryEffect(cry);

/** Cues that play a track of TRACKS once, over the music, instead of an effect. */
export const JINGLES: Partial<Record<Cue, string>> = { badge: 'badge', levelup: 'levelup', rest: 'rest' };

/**
 * How long the rest in the cafe waits before the barista speaks, in ticks of the game (60 a second): as long as the
 * jingle `rest` above (two bars at 168 bpm, 2.86 s), and a breath. A test keeps the two together.
 */
export const REST_TICKS = 176;
