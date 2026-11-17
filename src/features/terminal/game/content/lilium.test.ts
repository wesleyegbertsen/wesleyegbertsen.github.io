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
 * Lilium, written out by hand from the PDF score of a piano arrangement (see the credit above the track in music.ts);
 * the PDF is not in the repository. Each bar of the score is a bar here (46, no repeats), reduced to five voices: the
 * melody (the tune), the second voice (the right hand's next chord tone, the lower octave in octave passages), the
 * bass (the lowest line of the left hand, held to its next note), the octave voice (the rest of the left hand's
 * figure; in the sextuplet arpeggios only their second, fourth and sixth notes) and one inner chord tone. A step is a
 * twelfth of a quarter note at 60 a minute, so eighths (6), sixteenths (3), sextuplet sixteenths (2) and triplet
 * eighths (4) are exact. The fermatas of bars 22 and 33 add a beat to their bar; bar 44's accelerando is fitted into
 * its bar. A tied note stays in the bar where it starts, so a bar can be longer or shorter in a voice.
 */
const BARS: { bar: number; melody: string; second: string; bass: string; octave: string; inner: string }[] = [
  { bar: 1, melody: '-:36 F#4:6 C#5:6', second: '-:48', bass: '-:48', octave: '-:48', inner: '-:48' },
  { bar: 2, melody: 'G#4:18 A4:6 A4:12 F#4:6 C#5:6', second: 'E#4:24 F#4:12 -:12', bass: 'E#2:24 F#2:24', octave: 'G#3:24 A3:24', inner: 'C#3:24 -:24' },
  { bar: 3, melody: 'G#4:18 A4:6 B4:6 A4:6', second: 'E#4:24 -:12', bass: 'E#2:24 F#2:12', octave: 'G#3:24 A3:12', inner: '-:36' },
  { bar: 4, melody: 'F#4:24 G#3:6 G#4:6 E4:6 D4:6', second: 'D4:24 -:6 B3:6 B3:6 -:6', bass: 'D2:24 D2:24', octave: 'F#3:24 G#3:24', inner: 'A3:24 -:24' },
  { bar: 5, melody: 'E4:30 F#4:6 D4:6 C#4:6', second: 'G#3:24 A#3:6 C#4:6 A#3:6 A#3:6', bass: 'C#2:24 F#2:24', octave: 'E3:24 F#3:24', inner: '-:12 C#3:12 C#3:24' },
  { bar: 6, melody: 'D4:6 E4:6 F#4:18 G#4:6 A4:6 B4:6', second: '-:48', bass: 'B2:18 B2:6 B#2:24', octave: 'B3:12 B3:6 -:6 B#3:12 F#4:12', inner: 'D3:12 F#3:6 -:6 D#3:12 D#4:12' },
  { bar: 7, melody: 'A4:24 G#4:12 F#4:6 C#5:6', second: '-:24 E#4:12 -:12', bass: 'C#3:21 C#3:15 -:12', octave: 'C#4:12 C#4:3 A3:3 F#3:3 -:3 C#4:12 -:12', inner: 'A3:12 -:12 E#3:12 -:12' },
  { bar: 8, melody: 'G#4:18 A4:6 A4:12 F#4:6 C#5:6', second: 'E#4:24 C#4:12 -:12', bass: 'E#2:24 F#2:24', octave: 'G#3:6 C#3:6 C#4:12 A3:6 C#3:6 C#4:6 F#3:6', inner: '-:48' },
  { bar: 9, melody: 'G#4:18 A4:6 B4:6 A4:6', second: 'E#4:24 -:12', bass: 'E#2:24 F#2:12', octave: 'G#3:6 C#3:6 C#4:12 A3:6 C#3:6', inner: '-:36' },
  { bar: 10, melody: 'F#4:24 -:6 G#4:6 E4:6 D4:6', second: 'D4:24 -:6 B3:6 B3:6 -:6', bass: 'D2:24 D2:18 D2:6', octave: '-:6 D3:6 C#4:6 D3:6 B3:18 -:6', inner: '-:12 A3:6 -:6 G#3:18 -:6' },
  { bar: 11, melody: 'E4:24 -:6 F#4:6 D4:6 C#4:6', second: 'G#3:24 -:6 C#4:6 A#3:6 A#3:6', bass: 'C#2:24 F#2:18 A#1:6', octave: 'E3:6 C#3:6 B3:6 C#3:6 A#3:18 A#2:6', inner: '-:12 G#3:6 -:6 F#3:18 -:6' },
  { bar: 12, melody: 'D4:6 B4:6 A4:6 G#4:6 F#4:6 E#4:6 D#4:6 E#4:6', second: 'B3:6 -:42', bass: 'B1:12 B#2:12 C#3:12 C#2:12', octave: '-:2 D3:4 B3:4 D3:4 D#3:4 B#3:4 D#3:4 C#4:4 F#3:4 G#2:4 G#2:4 E#3:4 C#4:2', inner: 'B2:12 -:36' },
  { bar: 13, melody: 'F#4:6 A#4:6 B4:6 C#5:6', second: 'C#4:6 F#4:6 G#4:6 A#4:6', bass: 'F#2:6 F#2:6 G#2:6 A#2:6', octave: 'F#3:6 F#3:6 G#3:6 A#3:6', inner: 'A3:6 -:18' },
  { bar: 14, melody: 'D5:6 A4:6 G#4:6 D5:6 C#5:6 E5:6 A4:6 C#5:6', second: 'A4:6 -:18 G#4:6 -:6 F#4:6 C#4:6', bass: 'B2:12 E2:12 A2:12 F#2:12', octave: '-:2 D3:4 B3:4 D3:4 B2:4 G#3:4 G#3:4 E3:4 C#4:4 C#4:4 C#3:4 A3:4 A3:2', inner: 'F#4:6 -:30 C#4:6 -:6' },
  { bar: 15, melody: 'B#4:6 A4:6 G#4:6 F#4:6 A4:21 B4:3', second: 'G#4:6 -:18 C#4:21 -:3', bass: 'G#2:24 C#2:24', octave: '-:2 G#3:2 D#3:4 G#3:2 D#3:4 G#3:2 D#3:4 G#3:2 D#3:2 -:6 C#3:2 F#3:2 A3:2 C#4:4 F#3:4 C#4:4', inner: 'B#3:24 -:24' },
  { bar: 16, melody: 'G#4:36 F#4:6 C#5:6', second: 'E#4:36 -:12', bass: 'C#3:12 -:36', octave: '-:2 G#3:4 C#3:4 E#2:2 -:36', inner: 'C#4:12 -:36' },
  { bar: 17, melody: 'G#4:18 A4:6 A4:12 F#4:6 C#5:6', second: 'E#4:18 -:6 C#4:12 -:12', bass: 'E#1:18 -:6 F#1:18 F#1:6', octave: '-:6 C#3:6 G#3:6 -:12 F#3:6 C#4:6 -:6', inner: '-:6 G#2:6 E#3:6 -:12 C#3:6 A3:6 -:6' },
  { bar: 18, melody: 'G#4:18 A4:6 B4:6 A4:6', second: 'E#4:18 -:18', bass: 'E#1:18 -:6 F#1:12', octave: '-:6 C#3:6 G#3:6 -:12 F#3:6', inner: '-:6 G#2:6 E#3:6 -:12 C#3:6' },
  { bar: 19, melody: '-:6 D6:6 C#6:6 A5:6 B5:12 -:12', second: '-:6 D5:6 C#5:6 A4:6 B4:6 G#4:6 E4:6 D4:6', bass: 'D2:6 D2:18 D2:6 D2:6 B2:6 D2:6', octave: '-:6 A2:6 A3:6 D3:6 -:6 D3:6 -:12', inner: 'F#4:30 B3:6 B3:6 -:6' },
  { bar: 20, melody: '-:6 C#6:6 B5:6 G#5:6 A#5:12 -:12', second: '-:6 C#5:6 B4:6 G#4:6 C#5:6 F#4:6 D4:6 C#4:6', bass: 'C#2:6 C#2:18 F#1:6 F#2:12 A#1:6', octave: '-:6 G#2:6 C#3:6 G#3:6 F#2:6 F#3:6 C#3:6 A#2:6', inner: 'E4:30 A#3:6 A#3:6 A#3:6' },
  { bar: 21, melody: 'D4:6 B4:6 A4:6 G#4:6 F#4:6 E#4:6 D#4:6 E#4:6', second: 'B3:6 -:42', bass: 'B1:12 B#2:12 C#3:12 C#2:12', octave: '-:2 D3:4 B3:4 D3:4 D#3:4 B#3:4 D#3:4 C#4:4 F#3:4 G#2:4 G#2:4 G#2:4 -:2', inner: 'B2:12 -:36' },
  { bar: 22, melody: '-:6 A4:6 B4:6 G#4:6 A4:36 A5:6 B5:6', second: 'F#4:24 -:36 A4:6 B4:6', bass: 'F#1:24 -:48', octave: '-:6 A3:6 B3:6 G#3:6 A3:36 -:12', inner: '-:6 C#4:6 D4:6 B3:6 C#4:36 -:12' },
  { bar: 23, melody: 'C#6:18 B5:6 D6:6 C#6:6 B5:6 A5:6', second: 'C#5:18 B4:6 D5:6 C#5:6 B4:6 A4:6', bass: 'A2:24 G#2:12 F#2:12', octave: 'B3:6 E3:6 C#4:12 B3:6 E3:6 A3:6 C#3:6', inner: 'E5:18 -:30' },
  { bar: 24, melody: 'G#5:12 A5:6 B5:6 C#6:18 D#6:6', second: 'G#4:12 A4:6 B4:6 C#5:18 D#5:6', bass: 'E2:12 F#2:6 G#2:6 A2:18 B2:6', octave: 'G#3:12 F#3:6 G#3:6 B3:6 E3:6 C#4:6 B3:6', inner: '-:24 E5:18 B5:6' },
  { bar: 25, melody: 'B5:6 C#6:6 C#6:24 -:12 A5:6 B5:6', second: 'B4:6 C#5:6 A5:24 -:12 A4:6 B4:6', bass: 'F#3:6 D#4:6 F#2:6 C#3:6 G#3:6 B3:6 F#2:6 C#3:6 F#2:6 G#2:6', octave: '-:36 A3:12 F#3:6 G#3:6', inner: '-:12 F#5:24 -:24' },
  { bar: 26, melody: 'C#6:12 A5:6 B5:6 D6:6 C#6:6 B5:6 C#6:6', second: 'E5:12 A4:6 B4:6 D5:6 C#5:6 B4:6 C#5:6', bass: 'A1:24 G#1:12 F#1:12', octave: 'A2:6 E3:6 A3:6 E4:6 G#2:6 B3:6 F#2:6 C#3:6', inner: 'C#5:12 -:36' },
  { bar: 27, melody: 'A5:12 G#5:6 A5:6 F#5:12 G#5:6 A5:6', second: 'C#5:12 G#4:6 A4:6 A4:12 G#4:6 A4:6', bass: 'C#3:12 E1:12 D2:6 D2:18', octave: 'A3:6 F#3:6 E2:6 G#3:6 -:6 A2:6 D3:6 A3:6', inner: 'A4:12 -:12 F#4:12 -:12' },
  { bar: 28, melody: 'C#6:6 E6:6 D#6:6 B5:6 C#6:24', second: 'E5:6 E5:6 B5:6 B4:6 A5:24', bass: 'A1:12 B1:12 F#1:24', octave: 'A2:6 A3:6 B2:6 F#3:6 F#2:6 C#3:6 G#3:6 B3:6', inner: 'C#5:6 -:6 D#5:6 -:6 F#5:24' },
  { bar: 29, melody: 'A3:12 G#3:12 F#5:24', second: '-:24 D5:24', bass: 'F#2:12 E2:12 D2:6 D2:18', octave: 'F#3:6 C#3:6 E3:6 C#3:6 -:6 A2:6 D3:6 A3:6', inner: '-:24 A4:24' },
  { bar: 30, melody: 'E5:6 D5:6 C#5:12 D#5:6 B4:6 C#5:30', second: 'E4:6 D4:6 A4:12 F#4:6 B3:6 A4:30', bass: 'D2:6 G#1:6 A1:12 B1:12 F#1:12', octave: '-:6 G#2:6 A2:6 A3:6 B2:6 F#3:6 F#2:6 C#3:6', inner: '-:12 E4:12 D#4:6 -:6 F#4:30' },
  { bar: 31, melody: 'A4:6 G#4:6 E4:6 F#4:12', second: 'A3:6 G#3:6 E3:6 D4:12', bass: 'G#3:6 B3:6 F#2:12 E1:12 D2:6 D2:6', octave: '-:12 A3:6 C#3:6 E2:6 C#3:6 -:6 A2:6', inner: '-:18 B3:12' },
  { bar: 32, melody: 'G#4:6 A4:6 C#5:6 E5:6 D#5:6 B4:6 -:12', second: 'G#3:6 A3:6 A4:6 E4:6 D#4:6 B3:6 C#5:60', bass: 'A2:6 D2:6 A1:12 B1:12 F#1:60', octave: 'D3:6 -:6 A2:6 A3:6 B2:6 F#3:6 F#2:60', inner: '-:12 E4:6 -:18 C#4:12' },
  { bar: 33, melody: 'G#5:6 E5:6 F#5:6 C#5:6 B4:6 G#4:6 A4:30 A#5:6 B5:6 C#6:6', second: '-:18 F#5:6 G#5:6 A5:6', bass: '-:12 F#1:12 G#1:6 A#1:6', octave: '-:24 G#2:6 A#2:6', inner: '-:36 F#4:30 C#5:6 D#5:6 F#5:6' },
  { bar: 34, melody: 'D6:6 A5:6 G#5:6 D6:6 C#6:6 E6:6 A5:6 C#6:6', second: 'D5:6 A4:6 G#4:6 D5:6 C#5:6 E5:6 A4:6 C#5:6', bass: 'B1:12 E2:12 A1:12 F#1:12', octave: '-:2 D3:4 B3:4 D3:4 E3:4 B3:4 B3:4 A2:4 E3:4 E3:4 F#2:4 C#3:4 C#3:2', inner: 'F#5:6 -:6 D5:6 -:6 G#5:6 -:6 F#5:6 -:6' },
  { bar: 35, melody: 'G5:6 A5:6 G#5:4 E#5:4 D5:4 C#5:6 A#5:6 B5:6 C#6:6', second: 'B4:6 A4:6 G#4:4 E#4:4 D4:4 C#4:6 A#4:6 B4:6 C#5:6', bass: 'G1:12 C#2:12 F#1:12 G#1:6 A#1:6', octave: '-:2 G2:4 B2:4 D3:2 -:3 C#3:3 C#4:3 C#3:3 -:2 F#2:4 F#3:4 F#2:2 -:4 G#2:2 -:4 A#2:2', inner: 'E5:6 D5:6 -:12 F#4:6 F#5:6 G#5:6 A5:6' },
  { bar: 36, melody: 'D6:6 A5:6 G#5:6 D6:6 C#6:6 E6:6 A5:6 C#6:6', second: 'D5:6 A4:6 G#4:6 D5:6 C#5:6 E5:6 A4:6 C#5:6', bass: 'B1:12 E1:12 A1:12 F#1:12', octave: '-:2 D3:4 B3:4 D3:4 E2:4 E3:4 B3:4 A2:4 A3:4 E4:4 F#2:4 F#3:4 C#4:2', inner: 'F#5:6 -:6 D5:6 -:6 G#5:6 -:6 F#5:6 -:6' },
  { bar: 37, melody: 'B#5:6 A5:6 G#5:6 F#5:6 A5:6 A4:2 A5:2 A6:2 A6:3 A6:3 A5:3 A4:3', second: 'G#5:6 A4:6 G#4:6 F#4:6 F#5:6 F#4:2 F#5:2 F#6:2 F#6:3 F#6:3 F#5:3 F#4:3', bass: 'G#1:12 B#2:2 G#2:2 D#2:2 G#1:2 G#2:2 G#1:2 C#2:6 F#2:12 F#3:3 F#2:3', octave: '-:2 G#4:4 B#3:4 D#3:2 -:18 F#3:2 F#4:4 -:6 F#4:3 F#3:3', inner: 'D#5:6 -:18 C#5:6 C#4:2 C#5:2 C#6:2 F#5:3 C#6:3 C#5:3 C#4:3' },
  { bar: 38, melody: 'G#4:2 E#4:2 C#4:2 B3:2 G#3:2 E#3:2 -:24 F#5:6 C#6:6', second: 'E#4:2 E#3:2 C#3:2 B2:2 G#2:2 E#2:2 -:24 F#4:6 C#5:6', bass: 'C#2:12 C#2:36', octave: 'G#3:12 -:36', inner: 'C#4:12 -:36' },
  { bar: 39, melody: 'G#5:18 A5:6 A5:12 F#5:6 C#6:6', second: 'G#4:18 A4:6 A4:12 F#4:6 C#5:6', bass: 'C#2:24 F#1:24', octave: '-:2 E#2:4 C#3:4 G#3:2 C#4:4 E#3:4 G#2:4 -:2 F#2:4 C#3:4 A3:2 C#4:4 F#3:4 A2:4', inner: 'E#5:18 -:6 F#5:12 -:12' },
  { bar: 40, melody: 'G#5:18 A5:6 B5:6 A5:6', second: 'G#4:18 A4:6 B4:6 A4:6', bass: 'E#1:24 F#1:12', octave: '-:2 E#2:4 C#3:4 G#3:2 C#4:4 E#3:4 G#2:4 -:2 F#2:4 C#3:4 C#3:2', inner: 'E#5:18 -:18' },
  { bar: 41, melody: '-:6 F#6:6 C#7:6 D7:6 B6:6 G#5:6 E5:6 D5:6', second: '-:6 F#5:6 C#6:6 D6:6 B5:6 G#4:6 E4:6 D4:6', bass: 'D2:24 E1:20 E1:2 D2:2', octave: '-:2 D2:4 D3:4 A3:2 D4:4 F#3:4 A2:4 -:2 E2:4 E3:4 B3:2 G#3:4 B2:4 E2:4', inner: 'D5:30 B4:6 -:12' },
  { bar: 42, melody: '-:6 E6:6 B6:6 C#7:6 A#6:6 F#5:6 D5:6 C#5:6', second: '-:6 E5:6 B5:6 C#6:6 A#5:6 A#4:6 D4:6 C#4:6', bass: 'C#2:24 F#1:22 F#1:2', octave: '-:2 C#2:4 C#3:4 G#3:2 C#4:4 E3:4 G#2:4 -:2 F#2:4 F#3:4 C#4:2 A#3:4 C#3:4 F#2:4', inner: 'E5:30 C#5:6 -:12' },
  { bar: 43, melody: 'D5:6 B5:6 A5:6 G#5:6 F#5:6 E#5:6 D#5:6 E#5:6', second: 'D4:6 B4:6 A4:6 G#4:6 F#4:6 E#4:6 D#4:6 E#4:6', bass: 'B1:12 C2:12 C#2:12 C#2:6 C#2:2 C#2:2 -:2', octave: '-:2 B2:4 D3:4 F#3:2 -:2 C3:4 D#3:4 F#3:2 -:2 C#4:4 C#3:4 G#2:2 -:2 C#3:2 G#2:2 -:6', inner: 'A4:6 F#5:6 D5:6 -:30' },
  { bar: 44, melody: 'F#5:48', second: 'C#5:6 -:2 A3:2 A3:2 -:2 F#4:2 F#4:2 -:2 A4:2 A4:2 -:2 F#5:2 F#5:2 -:2 A5:2 A5:2 -:2 F#6:2 F#6:2 -:2 A6:2 A6:2', bass: 'F#1:6 F#1:6 C#2:6 F#2:6 C#3:6 F#3:6 C#4:6 F#4:6', octave: 'F#2:6 F#2:6 C#3:6 F#3:6 C#4:6 F#4:6 C#5:6 F#5:6', inner: 'A4:6 -:2 F#3:2 F#3:2 -:2 C#4:2 C#4:2 -:2 F#4:2 F#4:2 -:2 C#5:2 C#5:2 -:2 F#5:2 F#5:2 -:2 C#6:2 C#6:2 -:2 F#6:2 F#6:2' },
  { bar: 45, melody: 'C#6:6 A6:3 A6:3 A6:18 A4:12 -:6', second: 'C#5:6 F#6:3 F#6:3 F#6:18 F#4:12 -:6', bass: '-:30 F#2:12 F#1:6', octave: '-:30 C#3:12 -:6', inner: '-:12 F#5:18 C#4:12 -:6' },
  { bar: 46, melody: 'F#3:36 -:12', second: 'C#3:36 -:12', bass: 'C#2:36 -:12', octave: 'F#2:36 -:12', inner: 'A2:36 -:12' },
];

describe('Lilium on the player piano, written out from the score', () => {
  const piece = TRACKS['lilium'] ?? { bpm: 0, loop: false, voices: [] };
  const bars = (voice: number) => piece.voices[voice]?.notes.split('|').map((bar) => bar.trim().split(/\s+/).join(' ')) ?? [];
  const notes = (voice: number) => parseVoice(piece.voices[voice]?.notes ?? '').notes.length;

  it('steps in twelfths of a quarter note at 60 a minute: bpm 180, a step of 83 ms, played once', () => {
    expect(piece.bpm).toBe(180);
    expect(stepSeconds(piece)).toBeCloseTo(1 / 12, 9);
    expect(piece.loop).toBe(false);
  });

  it('has the 46 bars of the score, the two fermatas a beat longer: 3:04', () => {
    for (let voice = 0; voice < 5; voice++) expect(bars(voice)).toHaveLength(46);
    expect(trackSteps(piece)).toBe(2208);
    for (const voice of piece.voices) expect(parseVoice(voice.notes).steps).toBe(trackSteps(piece));
    // 182 beats as written at 60 a minute, and a beat for each fermata.
    const { length } = flatten(piece);
    expect(length).toBeCloseTo(184, 6);
    expect(length).toBeLessThan(360);
  });

  it('has five plucked voices, reduced on purpose: about five notes a second', () => {
    expect(piece.voices.map((voice) => voice.wave)).toEqual(['pulse', 'thin', 'triangle', 'triangle', 'thin']);
    for (const voice of piece.voices) expect(voice.pluck).toBe(true);
    expect([0, 1, 2, 3, 4].map(notes)).toEqual([253, 207, 164, 293, 112]);
    const all = [0, 1, 2, 3, 4].map(notes).reduce((a, b) => a + b, 0);
    expect(all / flatten(piece).length).toBeLessThan(6);
  });

  it('plays every note on a piano, over the 40 Hz floor (E1 to D7)', () => {
    const frequencies = flatten(piece).notes.map((note) => note.frequency);
    expect(frequencies.length).toBeGreaterThan(0);
    expect(Math.min(...frequencies)).toBeCloseTo(41.2, 1);
    expect(Math.max(...frequencies)).toBeCloseTo(2349.32, 1);
    for (const frequency of frequencies) {
      expect(frequency).toBeGreaterThan(40);
      expect(frequency).toBeLessThan(4200);
    }
  });

  it.each(BARS)('bar $bar: the five voices as the score has them', ({ bar, melody, second, bass, octave, inner }) => {
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

describe('the selector, its first ten pieces', () => {
  const world = buildWorld({ profile, skills, experience, education, projects });
  const tick = (state: GameState, input: Partial<typeof NO_INPUT>) => step(state, { ...NO_INPUT, ...input }, world, { instant: true });
  const press = (state: GameState, input: Partial<typeof NO_INPUT>) => tick(state, input).state;
  const open: GameState = { ...initialGame(world), scene: 'world', map: 'cafe', pick: { cursor: 0 } };
  const down = (state: GameState, times: number): GameState => (times === 0 ? state : down(press(state, { dir: 'down', pressed: 'down' }), times - 1));
  const ids = ['moonlight', 'scarborough-fair', 'always-in-my-heart', 'unravel', 'aliez', 'guren-no-yumiya', 'ichiban-no-takaramono', 'bauklotze', 'my-soul-your-beats', 'lilium'];

  it('lists the first ten pieces, Lilium the tenth, each with the length of its own track, and no piano track out of the list', () => {
    expect(PIECES.find((entry) => entry.id === 'lilium')).toEqual({ id: 'lilium', name: 'LILIUM (ELFEN LIED)', artist: 'NOMA KUMIKO', track: 'lilium' });
    // The first ten of the list; what follows is another piece's test.
    expect(world.pieces!.map((piece) => piece.id).slice(0, 10)).toEqual(ids);
    const piano = Object.entries(TRACKS).filter(([, track]) => track.loop === false && track.voices.every((voice) => voice.pluck)).map(([name]) => name);
    expect(piano.sort()).toEqual(PIECES.map((entry) => entry.track).sort());
    expect(world.pieces![9]!.ticks).toBe(Math.round(flatten(TRACKS['lilium']!).length * 60));
    expect(new Set(world.pieces!.map((piece) => piece.ticks)).size).toBe(world.pieces!.length);
  });

  it('plays Lilium with A on the tenth row, and the others still their own', () => {
    ids.forEach((id, i) => expect(press(down(open, i), { a: true }).piano).toMatchObject({ piece: id, ticks: world.pieces![i]!.ticks }));
  });

  it('says the tenth row in the status region: its name, artist, length and "10 of 11"', () => {
    const said = tick(down(open, 8), { dir: 'down', pressed: 'down' }).events.map((event) => event.text);
    expect(said).toEqual(['LILIUM (ELFEN LIED), NOMA KUMIKO, 3:04. 10 of 11.']);
  });
});
