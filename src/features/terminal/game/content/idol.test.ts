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
 * Idol, written out by hand from the PDF score of a piano arrangement (see the credit above the track in music.ts);
 * the PDF is not in the repository. Each bar of the score is a bar here, its five voices as written out: the melody
 * (the top note of the right hand), the second voice (the right hand's next note), the bass (the lowest note of the
 * left hand), the left hand's next note (its octaves) and the inner notes of chords. A step is a 32nd note at the
 * score's 83 a minute; the score slows to 75 (bar 44) and 80 (end of bar 52) and goes back to 83 (bar 57), and those
 * bars are placed in seconds on the same grid, so they hold 33 to 36 steps. A tied note stays in the bar where it
 * starts, so a bar can be longer, shorter or empty in a voice. Double flats are written `bb`.
 */
const BARS: { bar: number; melody: string; second: string; bass: string; octave: string; inner: string }[] = [
  { bar: 1, melody: '-:4 Ab4:2 Fb4:2 Ab4:2 Eb4:2 Gb4:2 F4:2 Ab4:2 Fb4:2 C5:2 G4:2 Ab4:2 Eb4:2 Abb5:4', second: '-:28 Gb5:4', bass: 'Ab1:4 -:4 F3:4 -:2 Ab5:1 Ab5:1 Ab5:2 -:2 Bbb1:6 Gb1:6', octave: 'Ab2:4 -:4 Gb3:4 -:8 Bbb2:6 Gb2:6', inner: '-:8 Ab3:4 -:16 F5:4' },
  { bar: 2, melody: '-:4 Ab4:2 Fb4:2 Ab4:2 Eb4:2 Fb4:2 Eb4:2 F4:2 Eb4:2 Ab4:2 F4:2 C5:2 Eb4:2 Ab5:4', second: '-:28 Gb5:4', bass: 'Ab1:4 -:4 Ab5:1 Ab5:1 Ab5:2 -:2 Ab3:1 Ab3:1 Ab3:2 -:2 Bbb1:6 Db2:6', octave: 'Ab2:4 -:16 Bbb2:6 Db3:6', inner: '-:28 F5:4' },
  { bar: 3, melody: 'Eb4:2 B4:2 B4:2 Ab4:2 G4:2 Fb4:2 D4:2 Eb4:2 Ab4:2 Eb4:2 Ab4:2 Fb4:2 Ab4:2 Eb4:2 Abb5:4', second: '-:28 Gb5:4', bass: 'Ab1:4 -:4 Fb3:4 -:2 Ab5:1 Ab5:1 Ab5:2 -:2 Bbb1:6 Gb1:6', octave: 'Ab2:4 -:4 Gb3:4 -:8 Bbb2:6 Gb2:6', inner: '-:8 Ab3:4 -:16 F5:4' },
  { bar: 4, melody: '-:4 G4:4 Ab4:2 Eb4:2 Ab4:2 Eb4:2 Ab4:2 Eb4:2 Bb4:2 Eb4:2 C5:2 Eb4:2 Ab5:4', second: '-:28 Gb5:4', bass: 'Ab1:4 -:4 Ab5:1 Ab5:1 Ab5:2 -:2 Ab3:1 Ab3:1 Ab3:2 -:2 Bbb1:6 Db2:6', octave: 'Ab2:4 -:16 Bbb2:6 Db3:6', inner: '-:28 F5:4' },
  { bar: 5, melody: 'Ab4:4 Ab4:4 Ab4:4 Gb4:2 Ab4:4 Ab4:4 Gb4:2 Ab4:4 -:4', second: 'Eb4:4 Eb4:4 Eb4:4 -:2 Eb4:4 Eb4:4 Db4:2 Eb4:4 -:4', bass: 'Ab1:4 -:2 Gb2:2 C3:4 -:2 C3:2 Ab3:2 Ab2:4 Gb2:2 Ab1:4 C2:1 Db2:1 Eb2:1 F2:1', octave: 'Ab2:4 -:4 Eb3:4 -:2 Gb3:4 -:6 Ab2:4 -:4', inner: 'C4:4 Db4:4 C4:4 -:2 C4:4 Db4:4 Bb3:2 C4:4 -:4' },
  { bar: 6, melody: 'Eb5:4 Db5:4 Eb5:4 Fb5:4 Eb5:4 Db5:4 Eb5:4 Fb5:4', second: 'Cb5:4 Bb4:4 Cb5:4 Cb5:4 C5:4 B4:4 C5:4 A4:4', bass: 'Ab2:3 Bb2:3 Eb3:4 Ab1:1 Bb1:1 Cb2:2 Ab2:2 A2:3 B2:3 E3:4 C3:2 A2:4', octave: '-:3 Ab3:3 Ab3:4 -:4 Cb3:2 -:3 A3:3 A3:4 A3:2 -:4', inner: 'Ab4:4 Ab4:4 Ab4:4 Gb4:4 A4:4 A4:4 A4:4 D#4:4' },
  { bar: 7, melody: 'G#4:2 B4:2 F#4:2 G#4:2 D#4:4 -:2 D#4:2 G#4:2 B4:2 F#4:2 C#4:2 D#4:4 -:2 D#4:2', second: 'D#4:2 -:6 B3:4 -:4 D#4:2 -:6 B3:4 -:4', bass: 'G#2:4 G#2:1 B2:1 C#3:1 D#3:1 F#3:1 G#3:1 G#2:2 -:2 D#2:2 G#2:4 C#3:1 D#3:1 F#3:1 G#3:1 -:2 G#2:2 -:2 F#2:2', octave: 'D#3:4 -:12 B2:4 -:6 F#3:2 -:2 E3:2', inner: 'C#4:2 -:14 C#4:2 -:14' },
  { bar: 8, melody: 'G#4:2 B4:2 F#4:2 G#4:2 D#4:2 F#4:2 C#4:2 G#3:2 C#4:2 D#4:2 C#4:2 D#4:2 G#3:4 -:2 D#4:1 D#4:1', second: 'E4:2 -:6 B3:2 -:6 A3:2 -:2 A#3:2 -:2 F#3:4 -:4', bass: 'E2:4 G#2:1 B2:1 C#3:1 D#3:1 F#3:1 G#3:1 E2:2 -:2 B1:2 D#2:4 D#2:1 G#2:1 C#3:1 D#3:1 D#2:2 E2:2 -:2 F#2:2', octave: 'B2:4 -:12 A2:4 -:6 C#3:2 -:2 D#3:2', inner: 'D#3:4 -:12 C#3:4 -:12' },
  { bar: 9, melody: 'G#4:2 B4:2 F#4:2 C#4:2 D#4:4 -:2 D#4:2 G#4:2 B4:2 F#4:2 G#4:2 G#4:4 -:2 D#4:2', second: 'D#4:2 -:6 B3:4 -:4 D#4:2 -:6 B3:4 -:4', bass: 'G#2:4 D#3:2 A2:2 D#3:2 B2:2 D#3:2 C#3:2 B2:2 -:2 F#2:2 G#2:2 -:2 F#2:2 -:2 A2:2', octave: 'D#3:4 -:2 G#3:2 -:2 F#3:2 -:2 F#3:2 D#3:2 -:4 F#3:2 -:2 D#3:2 -:2 C#3:2', inner: 'C#4:2 -:14 C#4:2 -:14' },
  { bar: 10, melody: 'G#4:2 B4:2 F#4:2 G#4:2 D#4:2 F#4:2 C#4:2 G#3:2 C#4:2 D#4:2 C#4:2 D#4:2 G#3:2 E3:1 G#3:4 -:1', second: 'E4:2 -:2 B3:4 A#3:4 D#3:6 F#3:4 F#3:5 -:5', bass: 'E2:4 -:2 G#2:2 -:2 C#2:2 -:2 E2:2 D#2:4 -:2 A2:2 D#3:2 C#3:1 B2:1 A#2:2 -:2', octave: 'B2:4 -:2 E3:2 -:2 B2:2 -:4 A2:4 -:12', inner: 'D#3:4 -:12 A3:2 -:2 A#3:2 -:10' },
  { bar: 11, melody: 'G#4:3 D#4:1 G#4:2 D#4:2 B4:2 C#5:4 D#5:2 D#4:3 D#4:3 D#4:2 -:2 G#3:2 B3:2 C#4:2', second: 'D#4:3 B3:3 B3:2 -:8 C#4:3 C#4:3 C#4:2 -:4 G3:2 A3:2', bass: 'G#2:3 F#3:3 F#3:2 G2:2 G#3:2 G3:2 A#3:2 F#2:3 E3:3 E3:2 E#2:2 B2:1 C#3:1 F#2:2 F2:2', octave: 'F#3:3 G#3:3 A3:2 -:4 B3:2 C#4:2 E3:3 F#3:3 G#3:2 -:4 D#3:2 -:2', inner: 'B3:3 -:29' },
  { bar: 12, melody: 'B4:2 F#4:2 G#4:3 D#4:1 A4:2 B4:2 D#4:2 A4:2 D#4:2 F#4:2 D#4:2 F#4:2 G#4:2 G#3:2 B3:2 C#4:2', second: 'D#4:2 -:2 D#4:2 -:2 D#4:2 F#4:2 -:12 D#4:2 -:2 G3:2 A3:2', bass: 'E2:2 D#3:2 B2:2 -:2 D#2:2 C#3:2 A2:2 -:2 C#2:2 C#3:2 G#3:2 C#4:2 D#2:2 C#3:2 B2:2 A2:2', octave: '-:2 B3:2 G#3:2 -:4 B3:2 G#3:2 -:4 B3:2 -:4 D#3:2 -:6', inner: '-:24 C#4:2 -:6' },
  { bar: 13, melody: 'G#4:3 D#4:1 G#4:2 D#4:2 B4:2 C#5:4 D#5:2 D#4:3 D#4:3 D#4:2 -:1 G#3:1 G#3:2 B3:2 C#4:2', second: 'D#4:3 B3:3 B3:2 -:8 C#4:3 C#4:3 C#4:2 -:4 G3:2 A3:2', bass: 'G#2:3 F#3:3 F#3:2 G2:2 G#3:2 G3:2 A#3:2 F#2:3 E3:3 E3:2 E#2:2 G2:2 F#2:2 F2:2', octave: 'F#3:3 G#3:3 A3:2 -:4 B3:2 C#4:2 E3:3 F#3:3 G#3:2 -:2 E#3:2 -:4', inner: 'B3:3 -:29' },
  { bar: 14, melody: 'B4:2 F#4:2 G#4:3 D#4:1 A4:2 B4:2 D#4:2 A4:4 F#4:2 G#4:2 D#5:2 G#4:4 B4:2 C#5:2', second: 'D#4:2 -:2 D#4:2 -:2 D#4:2 F#4:2 -:2 G#4:2 -:2 D#4:2 E4:2 F#4:2 F#4:4 -:4', bass: 'E2:2 D#3:2 B2:2 -:2 D#2:2 C#3:2 A2:2 A3:2 -:2 D3:2 C#3:4 D#3:8', octave: '-:2 B3:2 G#3:2 -:4 B3:2 G#3:2 D#4:2 -:4 B3:4 F#3:8', inner: '-:24 D#4:4 -:4' },
  { bar: 15, melody: 'D#5:4 B5:2 A5:2 -:2 F#5:2 -:2 C#5:2 -:2 B4:2 C#5:2 B4:2 D#5:2 -:2 G#4:2 D#5:2', second: 'B4:4 -:2 E5:2 -:2 D#5:2 -:2 G#4:2 -:2 G#4:2 F#4:2 E4:2 F#4:2 -:4 B4:2', bass: 'E3:2 F#3:2 B3:2 D#4:2 D#3:2 A3:2 F#3:2 C#3:4 G#2:2 B3:2 A2:2 G##2:4 B2:4', octave: '-:8 C#4:2 -:4 G#3:4 F#3:2 -:2 F3:2 E3:4 D#3:4', inner: 'G#4:4 -:2 B4:2 -:2 A4:2 -:2 D#4:2 -:6 C#4:2 D#4:4 A3:4' },
  { bar: 16, melody: 'C#5:2 -:2 G#4:2 D#5:2 C#5:2 -:2 D#5:2 F#5:2 B5:2 A5:2 F#5:2 C#5:2 D#5:2 -:2 B4:2 C#5:2', second: 'G#4:2 -:4 B4:2 A4:2 -:2 A4:4 G#5:2 -:6 B4:2 -:6', bass: 'C#3:2 G#3:2 B3:2 E4:2 D#3:4 C#3:4 B2:2 G#3:2 A2:2 F##3:2 A2:2 F#3:2 G#2:2 E#3:2', octave: '-:8 A3:4 F##3:4 -:2 B3:2 -:2 A3:2 -:2 A3:2 -:2 G#3:2', inner: 'E4:2 -:6 F##4:4 A3:4 D#5:2 -:6 F##4:2 -:6' },
  { bar: 17, melody: 'D#5:4 B5:2 A5:2 -:2 F#5:2 -:2 C#5:2 -:2 B4:2 C#5:2 F#5:2 D#5:4 G#4:2 D#5:2', second: 'B4:4 -:2 E5:2 -:2 D#5:2 -:2 G#4:2 -:4 A4:2 B4:2 A4:4 -:2 B4:2', bass: 'E2:3 B2:1 D#3:2 G#2:2 D#2:2 C#3:1 D#3:1 A2:1 D#3:1 F#2:2 G#2:2 F#3:1 G#3:1 D#3:1 G#3:1 A2:2 B2:2 C#4:1 B3:1 G#3:1 D#3:1 C#3:1 B2:1', octave: '-:6 E3:2 C#3:2 -:6 F#3:2 -:6 A3:2 -:6', inner: 'G#4:4 -:2 B4:2 -:2 A4:2 -:2 D#4:2 -:6 G4:2 F#4:4 -:4' },
  { bar: 18, melody: 'C#5:4 C#5:4 C#5:3 C#5:3 C#5:2 -:2 B4:2 C#5:2 B4:2 C#5:2 B4:2 C#5:2 E5:2', second: 'G#4:4 F#4:4 F#4:3 F##4:3 G#4:2 -:2 G#4:2 A4:2 G##4:2 A4:2 G##4:2 A4:2 C##5:2', bass: 'G#2:2 C#3:2 -:2 B2:2 C#3:2 G#3:1 C#4:1 B3:1 C#4:1 C#3:2 G#2:2 C#3:2 -:2 B2:2 C#3:2 G##3:1 C#4:1 B3:1 C#4:1 C##3:2', octave: '-:2 B3:2 -:2 G#3:2 B3:2 -:6 F#3:2 B3:2 -:2 G##3:2 B3:2 -:6', inner: 'E4:4 E4:4 E4:3 E4:3 E4:2 -:12 F##4:2 G##4:2' },
  { bar: 19, melody: 'D#5:2 -:4 E5:2 D#5:2 -:2 G#5:2 F##5:2 -:2 G#5:2 F##5:2 G#5:2 A5:4 E5:2 G5:2', second: 'A#4:2 -:4 B4:2 A#4:2 -:2 D#5:2 C#5:2 -:2 C#5:2 E5:2 E#5:2 E#5:4 -:4', bass: 'D#3:2 C#4:1 D#4:1 G#3:1 D#4:1 E3:2 D#3:2 G#3:1 A3:1 D#3:1 E3:1 C#3:2 -:2 D#3:2 -:2 C##3:2 D#3:4 -:4', octave: 'C#4:2 -:6 C#4:2 -:8 A3:2 -:2 G#3:2 F##3:4 -:4', inner: 'F##4:2 -:4 G#4:2 F##4:2 -:2 A#4:2 A#4:2 -:2 B4:2 C#5:2 C##5:2 C#5:4 -:4' },
  { bar: 20, melody: 'A5:4 E6:4 A5:4 G5:2 A5:4 E6:2 A5:2 G5:2 A5:4 E5:2 G5:2', second: 'F5:4 C6:4 E5:4 -:2 E5:4 C6:2 -:4 E5:4 -:4', bass: 'F3:2 C4:2 E4:2 Eb4:2 E3:3 E4:3 A2:4 A3:1 B3:1 C4:2 C4:1 D4:1 G3:2 D4:2 C3:2 B3:2', octave: 'A3:2 A4:2 -:2 G4:2 G3:6 G3:10 E4:2 -:2 E3:4', inner: 'C5:4 A5:4 B4:4 -:2 C5:4 G5:2 -:4 C5:4 C4:2 -:2' },
  { bar: 21, melody: 'A5:4 C6:4 B5:4 G5:2 A5:4 B5:2 C6:2 D6:2 F6:4 E6:4', second: 'F5:4 A5:4 E5:4 -:2 E5:4 -:6 D6:4 C6:4', bass: 'D3:2 C4:2 D4:2 C4:2 E3:3 G3:3 A2:4 B3:2 C4:2 B3:2 C4:4 B3:4', octave: 'A3:2 E4:2 -:2 E4:2 B3:3 -:3 G3:10 E4:4 D4:4', inner: 'D5:4 F5:4 D5:4 -:2 C5:4 D4:2 E4:2 G4:2 G5:4 G5:4' },
  { bar: 22, melody: 'A5:4 E6:4 A5:4 G5:2 A5:4 E6:2 A5:2 G5:2 A5:4 E5:2 G5:2', second: 'F5:4 C6:4 E5:4 -:2 E5:4 C6:2 -:4 E5:4 -:4', bass: 'F3:2 C4:2 E4:2 Eb4:2 E3:3 E4:3 A2:4 A3:1 B3:1 C4:2 C4:1 D4:1 G3:2 D4:2 C3:2 B3:2', octave: 'A3:2 A4:2 -:2 G4:2 G3:6 G3:10 E4:2 -:2 E3:4', inner: 'C5:4 A5:4 B4:4 -:2 C5:4 G5:2 -:4 C5:4 C4:2 -:2' },
  { bar: 23, melody: 'A5:4 C6:4 B5:4 G5:2 A5:4 A5:4 G5:2 A5:4 C6:4', second: 'F5:4 A5:4 E5:4 -:2 E5:4 E5:4 -:2 E5:4 A5:4', bass: 'D3:2 C4:2 D4:2 C4:2 E3:3 G3:3 A2:2 A3:2 C3:2 B2:2 C3:2 B2:2 C3:2 B2:2 E2:2', octave: 'A3:2 E4:2 -:2 E4:2 B3:3 -:3 G3:4 -:2 D3:2 E3:2 A3:2 E3:2 D3:2 C3:2', inner: 'D5:4 F5:4 D5:4 -:2 C5:4 D5:4 -:2 C5:4 E5:4' },
  { bar: 24, melody: 'A5:4 -:2 G5:2 A5:2 C6:2 D6:2 E6:2 A5:4 -:2 G5:2 A5:2 C6:2 D6:2 E6:2', second: 'F5:4 -:2 G4:2 E5:2 C5:2 D5:2 E5:2 E5:4 -:2 G4:2 E5:2 C5:2 D5:2 E5:2', bass: 'F2:4 F1:4 E2:3 E1:3 A1:4 C4:1 D4:1 A3:2 C4:1 D4:1 G3:2 D4:2 C3:2 B3:2', octave: 'F3:4 F2:4 E3:3 E2:3 A2:6 C4:2 -:2 C4:2 -:2 E3:4', inner: 'C5:4 -:4 B4:2 -:6 C5:4 E4:2 -:2 C5:2 -:2 C4:2 -:2' },
  { bar: 25, melody: 'A5:4 C6:4 D6:2 C6:2 D6:2 C6:2 D6:2 E6:2 A5:2 C6:2 G5:2 A5:2 E5:2 G5:2', second: 'F5:4 A5:4 B5:2 -:2 B5:2 -:2 B5:2 -:2 F5:2 -:2 E5:2 -:2 C5:2 D5:2', bass: 'D2:4 F2:4 E2:3 E1:3 A1:4 D4:2 Ab3:2 G4:2 G3:2 G4:2 G2:4', octave: 'D3:4 F3:4 E3:3 E2:3 A2:6 Cb4:4 Bb3:4 E3:4', inner: 'D5:4 F5:4 -:12 E4:2 -:2 A4:2 -:6' },
  { bar: 26, melody: 'A5:4 -:2 G5:2 A5:2 C6:2 D6:2 E6:2 A5:4 -:2 G5:1 G5:1 A5:2 C6:2 D6:2 E6:2', second: 'F5:4 -:2 G4:2 E5:2 C5:2 D5:2 E5:2 E5:4 -:4 E5:2 C5:2 D5:2 E5:2', bass: 'F2:4 F1:4 E2:3 E1:3 A1:4 C4:1 D4:1 Ab3:2 C4:1 D4:1 G3:2 D4:2 C3:2 B3:2', octave: 'F3:4 F2:4 E3:3 E2:3 A2:6 C4:2 -:2 C4:2 -:2 E3:4', inner: 'C5:4 -:4 B4:2 -:6 C5:4 E4:2 -:2 C5:2 -:2 C4:2 -:2' },
  { bar: 27, melody: 'D6:2 E6:2 D6:2 E6:2 G5:2 A5:2 E5:2 A5:2 D5:2 A5:4 G5:2 A5:4 -:4', second: 'A5:2 -:2 A5:2 -:2 E5:2 -:4 E5:4 E5:4 E5:2 E5:4 -:4', bass: 'D2:4 F2:4 E2:4 G2:2 A2:2 D3:2 E3:2 A3:2 B3:2 E3:2 C#3:2 A2:4', octave: 'D3:4 F3:4 E3:4 -:2 D3:2 E3:2 E4:4 D4:2 C#4:8', inner: '-:8 B4:2 -:4 D5:2 -:2 D5:4 D5:2 C#5:4 -:4' },
  { bar: 28, melody: '-:4 E4:4 E4:4 F4:2 Db4:2 Gb4:2 Db4:2 F4:2 Db4:2 F4:2 Db4:2 Bb4:4', second: '-:28 A4:4', bass: 'A1:4 F5:4 Ab5:4 Ab5:4 G5:4 G5:4 Gb5:4 -:2 G2:2', octave: 'A2:4 G5:4 Bb5:4 Bb5:4 A5:4 A5:4 Ab5:4 -:2 G3:2', inner: '-:28 G4:4' },
  { bar: 29, melody: '-:4 Gb4:2 C4:2 F4:2 Db4:2 E4:2 F4:2 Ab4:2 F4:2 A4:2 Gb4:2 A4:2 Gb4:2 Db5:4', second: '-:28 C5:4', bass: 'A2:4 F5:4 Ab5:4 Ab5:4 G5:4 G5:4 Gb5:4 Gb5:4', octave: 'A3:4 G5:4 Bb5:4 Bb5:4 A5:4 A5:4 Ab5:4 Ab5:4', inner: '-:28 B4:4' },
  { bar: 30, melody: 'F4:2 B3:2 F4:2 C4:2 Ab4:2 Db4:2 Ab4:2 Db4:2 Ab4:2 Db4:2 Ab4:2 Db4:2 Bb4:4 D5:4', second: '-:28 C5:4', bass: 'A1:4 F5:4 Ab5:4 Ab5:4 G5:4 G5:4 Gb5:4 -:2 G2:2', octave: 'A2:4 G5:4 Bb5:4 Bb5:4 A5:4 A5:4 Ab5:4 -:2 G3:2', inner: '-:28 B4:4' },
  { bar: 31, melody: '-:4 A4:2 Eb4:2 Ab4:2 D4:2 Gb4:2 C4:2 F4:2 B3:2 Eb4:2 A3:2 Db4:1 G3:3 C4:1 G3:3', second: '-:4 G4:2 Db4:2 Gb4:2 C4:2 Fb4:2 Bb3:2 Eb4:2 A3:2 Db4:2 Gb3:2 Cb4:1 F3:3 Bb3:1 Fb3:3', bass: 'A2:4 C4:2 G3:2 C4:2 F3:2 B3:2 Eb3:2 Ab3:2 D3:2 Gb3:2 C3:2 F3:1 B2:3 Eb3:1 B2:3', octave: 'A3:4 E4:2 B3:2 Eb4:2 Ab3:2 Db4:2 Gb3:2 C4:2 F3:2 Bb3:2 Eb3:2 Ab3:1 D3:3 Gb3:1 Db3:3', inner: '-:32' },
  { bar: 32, melody: 'A3:4 G3:1 G3:2 G3:1 A3:4 G3:1 G3:2 G3:1 A3:3 A3:1 A3:1 A3:2 A3:1 A3:4 A3:1 A3:2 A3:1', second: '-:32', bass: 'A1:8 C4:2 -:4 A2:2 A1:2 -:2 A1:4 E2:2 A2:6', octave: 'A2:8 E4:2 -:4 G3:2 A2:2 -:2 A2:4 -:2 C3:6', inner: '-:8 G4:2 -:16 E3:6' },
  { bar: 33, melody: 'A3:4 A3:1 A3:2 B3:1 C4:1 C4:2 C4:1 C4:4 C4:1 C4:2 A3:1 C4:1 C4:2 C#4:1 C#4:4 C#4:4', second: '-:8 A3:1 A3:2 A3:1 A3:4 A3:1 A3:2 -:1 A3:1 A3:2 A3:1 A3:4 A3:4', bass: 'A1:8 E4:2 -:2 E3:1 F3:1 A2:2 A1:2 -:6 A2:4 A1:4', octave: 'A2:8 Gb4:2 -:4 Gb3:2 A2:2 -:6 Gb3:4 A2:4', inner: '-:8 A4:2 -:22' },
  { bar: 34, melody: 'C#4:1 C#4:2 C#4:1 D4:4 E4:1 E4:2 E4:1 F4:1 F4:2 F4:1 F#4:3 G4:1 G4:3 G4:1 A4:1 A4:2 A4:1 B4:4', second: 'A3:1 A3:2 A3:1 C4:4 C#4:1 C#4:2 C#4:1 D4:1 D4:2 D4:1 D4:3 E4:1 E4:3 E4:1 F#4:1 F#4:2 F#4:1 G#4:4', bass: '-:4 A2:1 A3:2 A3:1 Gb4:2 -:2 A1:1 A2:2 A2:1 A2:1 A2:2 A2:1 A1:4 E2:2 A2:6', octave: '-:8 A4:2 -:2 A2:1 -:3 Gb3:1 -:3 A2:4 -:2 C3:6', inner: '-:4 B3:4 B3:1 B3:2 B3:1 C#4:1 C#4:2 C#4:1 B3:3 C#4:1 C#4:3 C#4:1 E4:1 E4:2 E4:1 F#4:4' },
  { bar: 35, melody: 'C#6:1 A5:2 C#6:1 D6:1 C#6:2 D6:1 E6:1 C#6:2 E6:1 F#6:1 E6:2 F#6:1 G6:1 E6:2 G6:1 G#6:1 G6:2 G#6:1 A6:4 E5:2 G5:2', second: 'C#5:1 A4:2 C#5:1 D5:1 C#5:2 D5:1 E5:1 C#5:2 E5:1 F#5:1 E5:2 F#5:1 G5:1 E5:2 G5:1 G#5:1 G5:2 G#5:1 E6:4 -:4', bass: 'A1:1 B1:2 C#2:1 D2:1 E2:2 F2:1 G2:1 A2:2 B2:1 C#3:1 D3:2 E3:1 F#3:1 G#3:2 A3:1 B3:1 C#4:2 D#4:1 E4:4 E2:4', octave: 'A2:1 B2:2 C#3:1 D3:1 E3:2 F3:1 G3:1 A3:2 B3:1 C#4:1 D4:2 E4:1 F#4:1 G#4:2 A4:1 B4:1 C#5:2 D#5:1 G#4:4 E3:4', inner: '-:24 C#6:4 -:4' },
  { bar: 36, melody: 'A5:4 E6:4 A5:4 G5:2 A5:4 E6:2 A5:2 G5:2 A5:4 E5:2 G5:2', second: 'F5:4 C6:4 E5:4 -:2 E5:4 C6:2 -:4 E5:4 -:4', bass: 'F3:2 C4:2 E4:2 Eb4:2 E3:3 E4:3 A2:4 A3:1 B3:1 C4:2 C4:1 D4:1 G3:2 D4:2 C3:2 B3:2', octave: 'A3:2 A4:2 -:2 G4:2 G3:6 G3:10 E4:2 -:2 E3:4', inner: 'C5:4 A5:4 B4:4 -:2 C5:4 G5:2 -:4 C5:4 C4:2 -:2' },
  { bar: 37, melody: 'A5:4 C6:4 B5:4 G5:2 A5:4 B5:2 C6:2 D6:2 F6:4 E6:4', second: 'F5:4 A5:4 E5:4 -:2 E5:4 -:6 D6:4 C6:4', bass: 'D3:2 C4:2 D4:2 C4:2 E3:3 G3:3 A2:4 B3:2 C4:2 B3:2 C4:4 B3:4', octave: 'A3:2 E4:2 -:2 E4:2 B3:3 -:3 G3:10 E4:4 D4:4', inner: 'D5:4 F5:4 D5:4 -:2 C5:4 D4:2 E4:2 G4:2 G5:4 G5:4' },
  { bar: 38, melody: 'A5:4 E6:4 A5:4 G5:2 A5:4 E6:2 A5:2 G5:2 A5:4 E5:2 G5:2', second: 'F5:4 C6:4 E5:4 -:2 E5:4 C6:2 -:4 E5:4 -:4', bass: 'F3:2 C4:2 E4:2 Eb4:2 E3:3 E4:3 A2:4 A3:1 B3:1 C4:2 C4:1 D4:1 G3:2 D4:2 C3:2 B3:2', octave: 'A3:2 A4:2 -:2 G4:2 G3:6 G3:10 E4:2 -:2 E3:4', inner: 'C5:4 A5:4 B4:4 -:2 C5:4 G5:2 -:4 C5:4 C4:2 -:2' },
  { bar: 39, melody: 'A5:4 C6:4 B5:3 G5:3 A5:4 A5:4 G5:2 A5:4 -:2 G5:2', second: 'F5:4 A5:4 E5:3 E5:3 E5:4 E5:4 -:2 E5:4 -:4', bass: 'D3:2 C4:2 D4:2 C4:2 D3:3 E3:3 A2:2 A3:2 C3:2 B2:2 C3:2 B2:2 C3:2 B2:2 G2:2', octave: 'A3:2 E4:2 -:2 E4:2 B3:3 G3:3 G3:4 -:2 D3:2 E3:2 A3:2 E3:2 D3:2 E3:2', inner: 'D5:4 F5:4 D5:3 D5:3 C5:4 D5:4 -:2 C5:4 -:4' },
  { bar: 40, melody: 'A5:4 C6:4 D6:3 E6:3 A5:4 A5:2 C6:2 A5:2 D6:2 E6:2 D6:2 E6:2', second: 'F5:4 A5:4 B5:3 B5:3 E5:4 -:6 B5:2 -:2 B5:2 -:2', bass: 'F2:4 F3:4 E2:4 E3:2 A1:4 C4:1 D4:1 A3:2 C4:1 D4:1 G3:2 D4:2 C3:2 B3:2', octave: 'F3:4 A3:4 E3:4 G3:2 A2:6 C4:2 -:2 C4:2 -:2 E3:4', inner: 'C5:4 F5:4 G5:3 A5:3 C5:4 -:2 E4:2 -:2 E4:2 -:2 C4:2 -:2' },
  { bar: 41, melody: 'A5:4 C6:4 B5:3 G5:3 E5:4 G5:2 D5:2 E5:2 C5:2 D5:2 E5:2 G5:2', second: 'F5:4 A5:4 G5:3 E5:3 C5:4 -:2 E4:2 G4:2 A4:2 G4:2 C5:2 D5:2', bass: 'D2:4 D3:4 E2:4 E3:2 A1:4 D3:2 Cb3:4 Bb2:4 G2:2 Gb2:2', octave: 'D3:4 F3:4 E3:4 G3:2 A2:4 D4:2 Gb3:4 F3:4 Cb3:2 -:2', inner: 'D5:4 F5:4 E5:3 B4:3 A4:4 -:2 Ab3:4 G3:4 E3:2 -:2' },
  { bar: 42, melody: 'A5:4 C6:4 D6:3 E6:3 A5:4 A5:2 C6:2 A5:2 D6:2 E6:2 D6:2 E6:2', second: 'F5:4 A5:4 B5:3 B5:3 E5:4 -:6 B5:2 -:2 B5:2 -:2', bass: 'F2:4 F3:4 E2:4 E3:2 A1:4 C4:1 D4:1 A3:2 C4:1 D4:1 G3:2 D4:2 C3:2 B3:2', octave: 'F3:4 A3:4 E3:4 G3:2 A2:6 C4:2 -:2 C4:2 -:2 E3:4', inner: 'C5:4 F5:4 G5:3 A5:3 C5:4 -:2 E4:2 -:2 E4:2 -:2 C4:2 -:2' },
  { bar: 43, melody: 'A5:4 D6:4 B5:3 G5:3 A5:2 D5:2 A5:2 A5:2 G5:2 A5:8', second: 'F5:4 A5:4 G5:3 E5:3 E5:4 E5:2 E5:2 E5:2 E5:8', bass: 'D2:4 D3:4 E2:3 G2:3 A2:2 D3:2 E3:2 A3:2 B3:2 C#4:2 C#3:2 A2:4', octave: 'D3:4 F3:4 E3:3 G3:3 D3:2 E3:2 D4:2 E4:2 G4:2 G4:8', inner: 'D5:4 F5:4 E5:3 B4:3 D5:2 -:2 D5:2 D5:2 D5:2 C#5:8' },
  { bar: 44, melody: '-:4 G4:3 C4:2 Ab4:2 C4:2 Ab4:2 Db4:3 Ab4:2 Db4:1 Db4:1 Ab4:2 Db4:3 Bb4:2 E4:2 Abb5:4', second: '-:31 Gb5:4', bass: 'A1:4 A2:2 A2:1 A2:2 C3:4 A3:2 A3:1 A3:2 C5:4 A2:2 A2:1 A2:2 Bb1:4 G1:4', octave: 'A2:4 -:5 E3:4 -:5 E5:4 -:5 Bb2:4 G2:4', inner: '-:9 A3:4 -:5 A5:4 -:9 F5:4' },
  { bar: 45, melody: '-:5 A4:2 E4:2 A4:2 E4:3 A4:2 D4:2 E4:2 Bb4:3 E4:2 Bb4:2 Bb4:2 G4:2 E6:5', second: '-:31 D6:5', bass: 'A1:5 A3:1 A3:2 A3:1 C#5:5 A3:1 A3:2 A3:1 C#3:5 A2:1 A2:1 A2:2 Bb1:4 D2:5', octave: 'A2:5 -:4 E5:5 -:4 E3:5 -:4 Bb2:4 D3:5', inner: '-:9 A5:5 -:4 A3:5 -:8 C6:5' },
  { bar: 46, melody: 'C5:4 A4:2 E4:3 C5:2 -:2 A4:2 E4:3 A4:2 E4:2 A4:2 E4:2 Bb4:3 E4:2 Abb5:4', second: 'B4:4 -:5 B4:2 -:20 Gb5:4', bass: 'A1:4 A2:2 A2:1 A2:2 C3:4 A3:2 A3:1 A3:2 C5:4 A2:1 A2:2 A2:1 Bb1:5 G1:4', octave: 'A2:4 -:5 Eb3:4 -:5 Eb5:4 -:4 Bb2:5 G2:4', inner: 'A4:4 -:5 A4:2 -:7 A5:4 -:9 F5:4' },
  { bar: 47, melody: '-:5 Bb4:2 E4:2 A4:2 E4:3 Bb4:2 E4:2 Bb4:2 F4:2 C5:3 F#4:2 C#5:2 G4:2 C#6:5', second: '-:31 B5:5', bass: 'A1:5 A3:1 A3:2 A3:1 C#5:5 A3:1 A3:1 A3:2 C#3:4 A2:2 A2:1 A2:2 Bb1:4 D2:5', octave: 'A2:5 -:4 F5:5 -:4 F3:4 -:5 Bb2:4 D3:5', inner: '-:9 A5:5 -:4 A3:4 -:9 A5:5' },
  { bar: 48, melody: 'E5:4 Ab5:2 E5:3 Ab5:2 E5:2 Gb5:2 D5:2 Ab5:3 E5:2 G5:2 D5:2 G5:2 C5:3 C6:4', second: 'C#5:17 D5:18', bass: 'A2:4 E3:5 F3:1 E3:1 D3:2 E3:4 E3:2 F3:1 A3:2 F3:4 Bb2:2 E3:1 D3:2 G2:1 A2:2 Bb2:1', octave: 'A3:4 E4:5 F4:1 E4:1 D4:2 E4:4 E4:2 F4:1 A4:2 F4:4 Bb3:2 E4:1 D4:2 G3:1 A3:2 Bb3:1', inner: '-:17 B4:18' },
  { bar: 49, melody: 'C#5:4 A5:3 E5:2 A5:2 E5:2 G#5:3 D5:2 A5:2 F5:2 G#5:2 F5:3 A5:2 E5:2 D6:4', second: 'A4:35', bass: 'A2:4 E3:5 A2:1 D3:2 F3:1 E3:5 E3:1 F3:2 A3:1 F3:5 Bb2:1 G2:2 C3:1 D3:2 C3:1 Bb2:1', octave: 'A3:4 E4:5 A3:1 D4:2 F4:1 E4:5 E4:1 F4:2 A4:1 F4:5 Bb3:1 G3:2 C4:1 D4:2 C4:1 Bb3:1', inner: '-:31 C6:4' },
  { bar: 50, melody: 'E5:3 C6:4 B5:2 B5:3 F5:2 G5:2 E5:2 G5:2 D#5:3 G5:2 D5:2 G5:2 D5:2 E6:5', second: 'C#5:18 D5:18', bass: 'A2:2 E2:1 F2:2 A2:4 A2:2 F3:1 D3:2 E3:4 F3:2 A3:1 C4:2 F3:4 Bb2:2 E3:1 D3:1 G2:2 A2:1 Bb2:2', octave: 'A3:2 E3:1 F3:2 A3:4 A3:2 F4:1 D4:2 E4:4 F4:2 A4:1 C5:2 F4:4 Bb3:2 E4:1 D4:1 G3:2 A3:1 Bb3:2', inner: '-:18 B4:18' },
  { bar: 51, melody: 'C#5:4 E5:5 G5:2 E5:2 B5:2 F5:3 A#5:2 G5:2 A5:2 F5:2 A#5:3 F5:2 A6:4', second: 'A4:35', bass: 'A2:4 E3:5 A2:1 D3:2 F3:1 E3:5 F3:1 E3:2 D3:1 B2:2 C3:1 B2:1 A2:5 -:4', octave: 'A3:4 E4:5 A3:1 D4:2 F4:1 E4:5 F4:1 E4:2 D4:1 B3:2 C4:1 B3:1 A3:5 -:4', inner: '-:31 G6:4' },
  { bar: 52, melody: 'F3:2 E3:1 D3:2 B2:1 C3:2 B2:1 A2:5 C6:2 D6:2', second: '-:18', bass: 'B2:5 E2:4 A1:5 -:4', octave: '-:18', inner: '-:18' },
  { bar: 53, melody: 'E6:4 C7:2 B6:4 G6:4 D6:2 -:2 C6:2 D6:3 C6:2 E6:4 A5:2 E6:2', second: 'C6:4 -:2 G6:4 E6:4 A5:2 -:9 B5:4 -:4', bass: 'F4:2 A4:2 C5:2 E5:2 E4:2 B4:2 G4:2 D4:4 A3:2 C5:3 B3:2 A#3:4 C4:4', octave: 'E5:2 -:6 D5:2 -:4 A4:4 G4:2 -:3 F#4:2 F4:4 E4:4', inner: 'A5:4 -:2 E6:4 B5:4 E5:2 -:7 G#4:2 G5:4 A#4:4' },
  { bar: 54, melody: 'D6:4 A5:2 E6:2 D6:4 E6:2 G6:3 C7:2 B6:2 G6:2 D6:2 E6:4 B5:2 C#6:2', second: 'A5:4 -:4 B5:4 -:5 G6:2 -:6 B5:4 -:4', bass: 'D4:2 A4:2 C5:2 E5:2 E4:4 D4:5 C4:4 B3:4 Bb3:4 B4:2 C#5:2', octave: 'F4:2 -:6 B4:4 G#4:5 E4:4 D#4:4 D4:4 -:4', inner: 'F5:4 -:4 G5:4 B4:5 E6:2 -:2 F#4:4 G5:4 -:4' },
  { bar: 55, melody: 'D#6:4 B6:2 A6:2 -:3 F#6:4 C#6:4 B5:2 C#6:2 F#6:2 D#6:4 G#5:2 D#6:2', second: 'B5:4 -:2 F#6:2 -:3 D#6:4 G#5:4 -:6 A5:4 -:4', bass: 'E4:2 G#4:2 B4:2 D#5:2 D#4:3 A4:2 F#4:2 C#4:4 G#3:2 B4:2 A3:2 A3:4 B3:4', octave: 'D#5:2 -:6 C#5:3 -:4 G#4:4 F#4:2 -:2 F4:2 E4:4 D#4:4', inner: 'G#5:4 -:2 D#6:2 -:3 A5:4 D#5:4 -:4 G4:2 F#5:4 A4:4' },
  { bar: 56, melody: 'C#6:4 G#5:3 D#6:2 C#6:4 F#5:2 G#5:2 -:2 G#5:4 F#5:2 G#5:4 -:2 G#6:3', second: 'G#5:4 -:5 F#5:4 -:2 D#5:2 -:2 D#5:4 D#5:2 D#5:4 -:2 D#6:3', bass: 'C#4:2 F#4:2 G#4:3 D#5:2 D#4:2 B4:2 G#4:2 G#3:4 C#4:2 D#4:2 F#4:2 G#4:4 -:2 G#4:3', octave: 'G#4:2 -:7 C#5:2 -:4 D#4:4 -:12 B#4:3', inner: 'E5:4 -:5 D#5:4 -:2 B#4:2 -:2 C#5:4 C#5:2 B#4:4 -:2 B#5:3' },
  { bar: 57, melody: 'G#6:2 F#6:2 G#6:2 D#7:2 G#6:2 C#5:2 E#5:2 G#5:2', second: 'D#6:2 -:6 D#6:2 -:2 D#5:2 E#5:2', bass: 'G#4:2 C#5:2 D#5:2 F#5:2 G#5:4 -:4', octave: 'B4:2 -:14', inner: 'B5:2 -:6 B#5:2 -:6' },
  { bar: 58, melody: 'A#5:4 E#6:4 A#5:4 G#5:2 A#5:4 E#6:2 A#5:2 G#5:2 A#5:4 E#5:2 G#5:2', second: 'F#5:4 C#6:4 E#5:4 -:2 E#5:4 C#6:2 -:4 E#5:4 -:4', bass: 'F#3:4 C#4:4 E#3:4 C#4:2 A#3:2 A#2:2 C#4:2 B#3:2 C#4:2 C#3:4 G#3:2 G##3:2', octave: 'C#4:4 F#4:4 B#3:4 -:2 B#3:2 A#3:2 -:2 D#4:2 E#4:2 F#3:4 -:4', inner: 'C#5:4 A#5:4 B#4:4 -:2 C#5:4 G#5:2 -:4 C#5:4 -:4' },
  { bar: 59, melody: 'A#5:4 C#6:4 B#5:4 G#5:2 A#5:4 B#5:2 C#6:2 D#6:2 F#6:4 E#6:4', second: 'F#5:4 A#5:4 E#5:4 B#4:2 E#5:4 B#4:2 -:4 D#6:4 C#6:4', bass: 'D#3:4 A#3:4 E#3:8 A#3:4 G#4:2 D#4:2 G#3:4 C#4:4', octave: 'F#3:4 C#4:4 G#3:4 -:12 B#3:4 E#4:4', inner: 'D#5:4 F#5:4 D#5:4 -:2 C#5:4 -:6 G#5:4 G#5:4' },
  { bar: 60, melody: 'A#5:4 E#6:4 A#5:4 G#5:2 A#5:4 E#6:2 A#5:2 G#5:2 A#5:4 E#5:2 G#5:2', second: 'F#5:4 C#6:4 E#5:4 -:2 E#5:4 C#6:2 -:4 E#5:4 -:4', bass: 'F#3:2 C#4:2 E#4:2 E4:2 E#3:3 E#4:3 A#2:4 A#3:1 B#3:1 C#4:2 C#4:1 D#4:1 G#3:2 D#4:2 C#3:2 B#3:2', octave: 'A#3:2 A#4:2 -:2 G#4:2 G#3:6 G#3:10 E#4:2 -:2 E#3:4', inner: 'C#5:4 A#5:4 B#4:4 -:2 C#5:4 G#5:2 -:4 C#5:4 C#4:2 -:2' },
  { bar: 61, melody: 'A#5:4 C#6:4 B#5:4 G#5:2 A#5:2 -:2 A#5:4 G#5:2 A#5:4 C#6:4', second: 'F#5:4 A#5:4 E#5:4 -:2 E#5:2 -:2 E#5:4 -:2 E#5:4 A#5:4', bass: 'D#3:2 C#4:2 D#4:2 C#4:2 E#3:3 G#3:3 A#2:2 A#3:2 D#3:4 E#3:2 A#2:2 B#2:2 D##2:2 E#2:2', octave: 'A#3:2 E#4:2 -:2 E#4:2 B#3:3 -:3 G#3:4 E#3:4 G#3:2 A#3:2 D#3:2 C#3:2 D#3:2', inner: 'D#5:4 F#5:4 D#5:4 -:2 C#5:2 -:2 D#5:4 -:2 C#5:4 E#5:4' },
  { bar: 62, melody: 'A#5:4 -:2 G#5:2 A#5:2 C#6:2 D#6:2 E#6:2 A#5:4 -:2 G#5:2 A#5:2 C#6:2 D#6:2 E#6:2', second: 'F#5:4 -:2 G#4:2 E#5:2 C#5:2 D#5:2 E#5:2 E#5:4 -:2 G#4:2 E#5:2 C#5:2 D#5:2 E#5:2', bass: 'F#2:2 F#2:1 F#1:1 F#2:2 F#2:2 E#2:2 B#2:2 D#3:2 A#2:4 A#2:1 A#1:1 A#2:2 E#2:2 G#2:2 B#2:2 E#3:2 G#3:2', octave: 'E#3:2 -:4 E#3:2 D#3:2 G#3:2 B#3:2 C#3:4 -:4 D#3:2 F#3:2 G#3:2 C#4:2 E#4:2', inner: 'C#5:4 -:4 B#4:2 -:4 G#3:4 -:6 C#5:2 -:6' },
  { bar: 63, melody: 'A#5:4 C#6:4 D#6:2 C#6:2 D#6:2 C#6:2 D#6:2 E#6:2 A#5:2 C#6:2 G#5:2 E#5:2 D#6:2 D#5:2', second: 'F#5:4 A#5:4 B#5:2 -:2 B#5:2 -:2 B#5:2 -:2 F#5:2 -:2 A#4:2 G#4:2 C#5:2 -:2', bass: 'F#3:4 D#3:4 B#2:4 G#2:2 A#1:4 C#4:2 G3:2 G#4:2 F#3:2 B2:2 C3:2 G2:2', octave: 'A#3:4 F#3:4 E#3:4 B#2:2 A#2:4 D#4:2 A3:4 G#3:2 -:2 E#3:2 -:2', inner: 'D#5:4 F#5:4 G#3:4 E#3:2 -:6 C4:4 -:8' },
  { bar: 64, melody: 'C#6:4 -:2 G#5:2 A#5:2 C#6:2 D#6:2 E#6:2 A#5:4 -:2 G#5:1 G#5:1 A#5:2 C#6:2 D#6:2 E#6:2', second: 'A#5:4 -:2 G#4:2 E#5:2 C#5:2 D#5:2 E#5:2 E#5:4 -:4 F#5:2 C#5:2 D#5:2 E#5:2', bass: 'F#2:2 F#2:1 F#1:1 F#2:2 F#2:2 E#2:2 B#2:2 D#3:2 A#2:4 E#2:2 A2:2 E3:2 G#2:2 D#3:2 C#3:2 E#3:2', octave: 'E#3:2 -:4 E#3:2 D#3:2 G#3:2 B#3:2 C#3:4 D#3:2 -:2 G3:2 -:2 F#3:2 -:2 G#3:2', inner: 'F#5:4 -:4 B#4:2 -:4 G#3:4 -:6 D#5:2 -:6' },
  { bar: 65, melody: 'D#6:2 E#6:2 D#6:2 E#6:2 G#5:2 A#5:2 E#5:2 A#5:2 -:2 A#5:4 G#5:2 A#5:4 -:4', second: 'A#5:2 -:2 A#5:2 -:2 E#5:2 -:4 E#5:2 -:2 E#5:4 E#5:2 E#5:4 -:4', bass: 'D#3:2 E#4:2 F#3:2 E#4:2 D#3:2 E#3:2 G#2:2 A#2:2 D#3:2 E#3:2 A#3:2 B#3:2 E#3:2 C##3:2 A#2:4', octave: 'G#3:4 D#4:2 -:2 B#3:2 G#3:2 E#3:2 D#3:2 E#3:2 E#4:4 D#4:2 C##4:8', inner: 'A#3:2 -:6 B#4:2 -:4 D#5:2 -:2 D#5:4 D#5:2 C##5:4 -:4' },
  { bar: 66, melody: 'A#5:3 G#5:3 A#5:2 D#5:2 C#6:1 D#5:1 D#6:2 E#6:2 A#5:2 G#4:2 C#5:2 G#5:1 G#4:1 G#5:2 A#5:2 C#6:2 D#6:2', second: 'A#4:3 -:3 E#5:2 -:6 E#5:4 -:4 G#4:1 -:1 C#5:2 -:2 E#5:2 -:2', bass: 'G#3:8 F#3:3 F#3:3 E#3:2 G#3:8 D#3:2 G#4:2 C#3:2 G#4:2', octave: 'A#3:8 A#3:3 A#3:3 G#3:2 -:8 F#3:4 E#3:4', inner: 'C#4:8 C#4:3 C#4:3 A#3:10 G#3:4 G#3:4' },
  { bar: 67, melody: 'E#6:4 D#6:2 E#6:2 B#5:2 G#5:2 E#5:2 A#5:2 -:2 A#5:4 G#5:2 A#5:4 C#5:1 D#5:1 E#5:1 F#5:1', second: 'A#5:4 -:4 E#5:2 -:4 E#5:2 -:2 E#5:4 -:2 E#5:4 -:4', bass: 'D#3:4 D#3:2 -:2 E#3:4 E#3:2 E#3:2 G#3:2 F#3:2 G#3:2 B#3:2 C##4:4 C#3:1 B#2:1 A#2:1 G#2:1', octave: 'F#3:4 G#3:2 -:2 G#3:4 A#3:2 G#3:2 -:2 D#4:2 E#4:2 G#4:2 A#4:4 -:4', inner: 'F#5:4 A#3:2 -:2 D#5:2 -:2 B#3:2 C##5:2 -:2 D#5:4 -:2 C##5:4 -:4' },
  { bar: 68, melody: 'G#5:2 A#5:2 -:2 A#4:2 -:2 A#4:2 -:2 A#4:2 C#5:2 D#5:2 D##5:2 E#5:2 -:2 G#4:2 A#4:2 C#5:2', second: 'F#5:2 F#5:2 -:2 G#4:2 -:2 G#4:2 -:2 E#4:2 A#4:2 B#4:2 B#4:2 C#5:2 -:2 E4:2 F#4:2 A4:2', bass: 'F#2:2 A#2:2 E3:2 E#3:4 C#3:1 D#3:1 E3:2 A#2:4 E#2:2 A#2:2 B2:2 C#3:2 D3:2 C#3:2 D3:2', octave: '-:2 F#3:2 G3:2 G#3:4 -:4 E#3:4 -:8 F#3:2 A3:2 C#4:2', inner: 'C#5:2 C#5:2 -:2 E#4:2 -:2 E#4:2 -:2 C#4:2 -:16' },
  { bar: 69, melody: 'G#5:2 A#5:2 -:2 A#4:2 -:2 A#4:2 -:2 A#4:2 C#6:2 D#6:2 D##6:2 E#6:2 -:2 D#6:2 C#6:2 -:2', second: 'F#5:2 F#5:2 -:2 G#4:2 -:2 G#4:2 -:2 E#4:2 A#5:2 B#5:2 B#5:2 C#6:2 -:2 G#5:2 G#5:2 -:2', bass: 'F#3:2 D#3:2 E3:2 E#3:4 B#2:4 A#2:4 C#2:1 D#2:1 E#2:1 A#2:1 D#3:1 E#3:1 -:1 G#4:1 F#4:1 B#3:1 C#4:1 G#3:1 E#3:1 C#3:1', octave: 'A#3:2 -:4 G#3:4 E#3:4 C#3:4 -:14', inner: 'D#5:2 D#5:2 -:2 E#4:2 -:2 E#4:2 -:2 C#4:2 -:10 E#5:2 E#5:2 -:2' },
  { bar: 70, melody: 'G#5:2 A#5:2 -:2 A#4:2 -:2 A#4:2 -:2 A#4:2 C#5:2 D#5:2 D##5:2 E#5:2 -:2 G#4:2 A#4:2 C#5:2', second: 'F#5:2 F#5:2 -:2 F#4:2 -:2 G#4:2 -:2 E#4:2 A#4:2 B#4:2 B#4:2 C#5:2 -:2 E4:2 F#4:2 A4:2', bass: 'F#2:2 A#2:2 E#3:2 F#3:2 E#2:2 G#2:2 D#3:2 A#2:4 E#4:1 C#4:1 D#4:1 B#3:1 C#4:1 A#3:1 B3:1 G#3:1 E3:1 B2:1 E3:1 B2:1 G#2:1 E#2:1', octave: '-:2 F#3:2 G#3:2 A#3:2 -:2 E#3:2 F#3:2 E#3:4 -:14', inner: 'C#5:2 C#5:2 -:2 C#4:2 -:2 E#4:2 -:2 C#4:2 -:16' },
  { bar: 71, melody: 'G#5:2 A#5:2 -:2 A#4:2 -:2 A#4:2 -:2 A#4:2 C#5:2 G#4:2 D#5:2 C#5:2 -:2 C#5:2 C#6:2 -:2', second: 'F#5:2 F#5:2 -:2 F#4:2 -:2 G#4:2 -:2 E#4:2 A#4:2 -:2 B#4:2 A#4:2 -:4 A#5:2 -:2', bass: 'D#2:2 F#2:2 A#2:2 C#3:2 E#2:2 G#2:2 B#2:2 C#3:4 F#3:1 G#3:1 A#3:1 B#3:1 E#3:2 -:2 A#2:2 A#1:2 -:2', octave: '-:2 D#3:2 F#3:2 A#3:2 -:2 E#3:2 G#3:2 E#3:4 -:4 A#3:2 -:2 A#3:2 A#2:2 -:2', inner: 'D#5:2 D#5:2 -:2 D#4:2 -:2 E#4:2 -:2 C#4:2 E#4:2 -:4 C#4:2 -:4 E#5:2 -:2' },
  { bar: 72, melody: 'A#5:4 G#5:4 A#5:4 B5:4 A#5:4 G#5:4 A#5:4 B5:4', second: 'E#5:4 E#5:4 E#5:4 G#5:4 F5:4 E#5:4 F5:4 F5:4', bass: 'A#2:3 B#2:3 E#3:4 A#1:1 B#1:1 C#2:2 A#2:2 B2:3 C#3:3 F3:4 D3:2 C#3:2 B2:2', octave: '-:3 A#3:3 A#3:4 -:4 C#3:2 -:3 B3:3 B3:4 B3:2 -:4', inner: 'C#5:4 D#5:4 C#5:4 E#5:4 D5:4 D5:4 D5:4 D5:4' },
  { bar: 73, melody: 'A#5:4 G#5:4 A#5:4 B5:4 -:30', second: 'E#5:4 E#5:4 E#5:4 G#5:4 -:30', bass: 'A#2:3 B#2:3 E#3:4 A#2:1 B#2:1 C#3:2 E#2:2 A#1:1 B2:1 D#3:1 A#1:1 G#3:1 A#3:1 A#1:2 -:22', octave: '-:3 A#3:3 A#3:4 -:6 E#2:3 A#2:3 E#2:2 -:22', inner: 'C#5:4 D#5:4 C#5:4 E#5:4 A#2:1 -:2 E#3:1 -:2 A#2:2 -:22' },
];

describe('Idol on the player piano, written out from the score', () => {
  const piece = TRACKS['idol'] ?? { bpm: 0, loop: false, voices: [] };
  const bars = (voice: number) => piece.voices[voice]?.notes.split('|').map((bar) => bar.trim().split(/\s+/).join(' ')) ?? [];
  const notes = (voice: number) => parseVoice(piece.voices[voice]?.notes ?? '').notes.length;

  it('steps in 32nd notes of the score\'s 83 a minute: bpm 166, a step of 90 ms, played once', () => {
    expect(piece.bpm).toBe(166);
    expect(stepSeconds(piece)).toBeCloseTo(0.090361, 6);
    expect(piece.loop).toBe(false);
  });

  it('has the 73 bars of the score, with the score\'s tempo marks in their length: about 3:33', () => {
    for (let voice = 0; voice < 5; voice++) expect(bars(voice)).toHaveLength(73);
    expect(trackSteps(piece)).toBe(2352);
    for (const voice of piece.voices) expect(parseVoice(voice.notes).steps).toBe(trackSteps(piece));
    // 43 bars at 83, eight and a half at 75, four and a half at 80, sixteen and a half at 83: 211.3 s, then padded to a multiple of 16 steps.
    const { length } = flatten(piece);
    expect(Math.abs(length - 211.3)).toBeLessThan(1.5);
    expect(length).toBeLessThan(360);
  });

  it('has five plucked voices: 3214 of the 3533 notes read, 179 ties joined, 4 doubled keys, 136 with no free voice', () => {
    expect(piece.voices.map((voice) => voice.wave)).toEqual(['pulse', 'thin', 'triangle', 'triangle', 'thin']);
    for (const voice of piece.voices) expect(voice.pluck).toBe(true);
    expect([0, 1, 2, 3, 4].map(notes)).toEqual([891,  472,  961,  542,  348]);
    // Read from the score: 3533 notes (grace notes left out); a tie joins two of them into one; none is under 40 Hz.
    expect([0, 1, 2, 3, 4].map(notes).reduce((a, b) => a + b, 0)).toBe(3533 - 179 - 4 - 136);
  });

  it('plays every note on a piano, over the 40 Hz floor (E1 to D#7)', () => {
    const frequencies = flatten(piece).notes.map((note) => note.frequency);
    expect(frequencies.length).toBeGreaterThan(0);
    expect(Math.min(...frequencies)).toBeCloseTo(41.20, 1);
    expect(Math.max(...frequencies)).toBeCloseTo(2489.02, 1);
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

describe('the selector with ten pieces', () => {
  const world = buildWorld({ profile, skills, experience, education, projects });
  const tick = (state: GameState, input: Partial<typeof NO_INPUT>) => step(state, { ...NO_INPUT, ...input }, world, { instant: true });
  const press = (state: GameState, input: Partial<typeof NO_INPUT>) => tick(state, input).state;
  const open: GameState = { ...initialGame(world), scene: 'world', map: 'cafe', pick: { cursor: 0 } };
  const down = (state: GameState, times: number): GameState => (times === 0 ? state : down(press(state, { dir: 'down', pressed: 'down' }), times - 1));
  const ids = ['moonlight', 'scarborough-fair', 'always-in-my-heart', 'unravel', 'aliez', 'guren-no-yumiya', 'ichiban-no-takaramono', 'bauklotze', 'my-soul-your-beats', 'idol'];

  it('lists the ten pieces, Idol the tenth and last, each with the length of its own track, and no piano track out of the list', () => {
    expect(PIECES.find((entry) => entry.id === 'idol')).toEqual({ id: 'idol', name: 'IDOL (OSHI NO KO)', artist: 'YOASOBI', track: 'idol' });
    expect(world.pieces!.map((piece) => piece.id)).toEqual(ids);
    const piano = Object.entries(TRACKS).filter(([, track]) => track.loop === false && track.voices.every((voice) => voice.pluck)).map(([name]) => name);
    expect(piano.sort()).toEqual(PIECES.map((entry) => entry.track).sort());
    expect(world.pieces![9]!.ticks).toBe(Math.round(flatten(TRACKS['idol']!).length * 60));
    expect(new Set(world.pieces!.map((piece) => piece.ticks)).size).toBe(10);
  });

  it('plays Idol with A on the tenth row, and the others still their own', () => {
    ids.forEach((id, i) => expect(press(down(open, i), { a: true }).piano).toMatchObject({ piece: id, ticks: world.pieces![i]!.ticks }));
  });

  it('says the tenth row in the status region: its name, artist, length and "10 of 10"', () => {
    const said = tick(down(open, 8), { dir: 'down', pressed: 'down' }).events.map((event) => event.text);
    expect(said).toEqual(['IDOL (OSHI NO KO), YOASOBI, 3:33. 10 of 10.']);
  });
});
