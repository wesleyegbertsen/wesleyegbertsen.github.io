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
 * Idol, the opening of the anime Oshi no Ko, written out by hand from the PDF score of a piano arrangement (see the
 * credit above the track in music.ts); the PDF is not in the repository. Each bar of the score is a bar here (73, no
 * repeats; bars 52 and 57 are 2/4, 8 steps), reduced on purpose to five voices: the melody (the tune: the right
 * hand's top line, in the chorus the top of its chords), the second voice (one more right-hand tone on the main
 * beats), the bass (the lowest left-hand note on the beats and on the anticipations tied over them), the octave voice
 * (a left-hand figure, sampled) and, rarely, one more chord tone. A step is a sixteenth at 83 quarter notes a minute;
 * triplets are one or two notes, 32nd runs two notes a beat or fewer. Pitches sound as written, with the 8va of bars
 * 35 and 53 to 57 written out; the double flats of bars 1 to 4 and 44 to 46 are the notes they sound (Abb as G, Bbb
 * as A). A tied note stays in the bar where it starts, so a bar can be longer or shorter, or empty, in a voice.
 */
const BARS: { bar: number; melody: string; second: string; bass: string; octave: string; inner: string }[] = [
  { bar: 1, melody: '-:2 Ab4:1 Fb4:1 Ab4:1 Eb4:1 Gb4:1 F4:1 Ab4:1 Fb4:1 C5:1 G4:1 Ab4:1 Eb4:1 G5:2', second: '-:16', bass: 'Ab1:10 A1:3 Gb1:3', octave: '-:4 Ab3:2 -:10', inner: '-:16' },
  { bar: 2, melody: '-:2 Ab4:1 Fb4:1 Ab4:1 Eb4:1 Fb4:1 Eb4:1 F4:1 Eb4:1 Ab4:1 F4:1 C5:1 Eb4:1 Ab5:2', second: '-:16', bass: 'Ab1:10 A1:3 Db2:3', octave: '-:7 Ab3:2 -:7', inner: '-:16' },
  { bar: 3, melody: 'Eb4:1 B4:1 B4:1 Ab4:1 G4:1 Fb4:1 D4:1 Eb4:1 Ab4:1 Eb4:1 Ab4:1 Fb4:1 Ab4:1 Eb4:1 G5:2', second: '-:16', bass: 'Ab1:10 A1:3 Gb1:3', octave: '-:4 Ab3:2 -:10', inner: '-:16' },
  { bar: 4, melody: '-:2 G4:2 Ab4:1 Eb4:1 Ab4:1 Eb4:1 Ab4:1 Eb4:1 Bb4:1 Eb4:1 C5:1 Eb4:1 Ab5:2', second: '-:16', bass: 'Ab1:10 A1:3 Db2:3', octave: '-:7 Ab3:2 -:7', inner: '-:16' },
  { bar: 5, melody: 'Ab4:2 Ab4:2 Ab4:2 Gb4:1 Ab4:2 Ab4:2 Gb4:1 Ab4:2 -:2', second: 'Eb4:7 Eb4:7 -:2', bass: 'Ab1:4 C3:8 Ab1:4', octave: '-:4 Gb3:3 Ab3:9', inner: '-:16' },
  { bar: 6, melody: 'Eb5:2 Db5:2 Eb5:2 Fb5:2 Eb5:2 Db5:2 Eb5:2 Fb5:2', second: 'Cb5:8 C5:8', bass: 'Ab2:3 Eb3:5 A2:3 E3:5', octave: '-:2 Ab3:6 -:2 A3:6', inner: '-:14 D#4:2' },
  { bar: 7, melody: 'G#4:1 B4:1 F#4:1 G#4:1 D#4:3 D#4:1 G#4:1 B4:1 F#4:1 C#4:1 D#4:3 D#4:1', second: '-:16', bass: 'G#2:8 G#2:8', octave: '-:4 G#3:7 G#3:5', inner: '-:16' },
  { bar: 8, melody: 'G#4:1 B4:1 F#4:1 G#4:1 D#4:1 F#4:1 C#4:1 G#3:1 C#4:1 D#4:1 C#4:1 D#4:1 G#3:2 -:1 D#4:1', second: '-:16', bass: 'E2:8 D#2:8', octave: '-:4 G#3:7 D#3:5', inner: '-:16' },
  { bar: 9, melody: 'G#4:1 B4:1 F#4:1 C#4:1 D#4:3 D#4:1 G#4:1 B4:1 F#4:1 G#4:1 G#4:3 D#4:1', second: '-:16', bass: 'G#2:8 B2:2 F#2:6', octave: '-:16', inner: '-:16' },
  { bar: 10, melody: 'G#4:1 B4:1 F#4:1 G#4:1 D#4:1 F#4:1 C#4:1 G#3:1 C#4:1 D#4:1 C#4:1 D#4:1 G#3:3 G#3:1', second: '-:2 B3:4 D#3:3 F#3:7', bass: 'E2:8 D#2:4 D#3:1 C#3:1 B2:1 A#2:1', octave: '-:16', inner: '-:16' },
  { bar: 11, melody: 'G#4:2 G#4:2 B4:1 C#5:2 D#5:2 -:4 G#3:1 B3:1 C#4:1', second: 'D#4:3 D#4:5 D#4:3 D#4:5', bass: 'G#2:4 G2:4 F#2:4 E#2:4', octave: '-:16', inner: '-:16' },
  { bar: 12, melody: 'B4:2 G#4:2 A4:1 B4:2 A4:2 F#4:1 D#4:1 F#4:1 G#4:1 G#3:1 B3:1 C#4:1', second: 'D#4:8 -:8', bass: 'E2:4 D#2:4 C#2:4 D#2:4', octave: '-:1 B3:4 B3:7 -:4', inner: '-:16' },
  { bar: 13, melody: 'G#4:2 G#4:2 B4:1 C#5:2 D#5:2 -:4 G#3:1 B3:1 C#4:1', second: 'D#4:3 D#4:5 D#4:3 D#4:5', bass: 'G#2:4 G2:4 F#2:4 E#2:4', octave: '-:16', inner: '-:16' },
  { bar: 14, melody: 'B4:2 G#4:2 A4:1 B4:2 A4:2 F#4:1 G#4:1 D#5:1 G#4:2 B4:1 C#5:1', second: 'D#4:16', bass: 'E2:4 D#2:8 D#3:4', octave: '-:1 B3:5 D#4:6 A3:4', inner: '-:16' },
  { bar: 15, melody: 'D#5:2 B5:1 A5:1 -:1 F#5:1 -:1 C#5:1 -:1 B4:1 C#5:1 B4:1 D#5:1 -:1 G#4:1 D#5:1', second: 'B4:7 G#4:9', bass: 'E3:4 D#3:3 C#3:5 G##2:4', octave: '-:2 B3:8 B3:6', inner: '-:16' },
  { bar: 16, melody: 'C#5:1 -:1 G#4:1 D#5:1 C#5:1 -:1 D#5:1 F#5:1 B5:1 A5:1 F#5:1 C#5:1 D#5:1 -:1 B4:1 C#5:1', second: 'G#4:8 G#5:8', bass: 'C#3:4 D#3:4 B2:2 A2:6', octave: '-:16', inner: '-:16' },
  { bar: 17, melody: 'D#5:2 B5:1 A5:1 -:1 F#5:1 -:1 C#5:1 -:1 B4:1 C#5:1 F#5:1 D#5:2 G#4:1 D#5:1', second: 'B4:7 G#4:9', bass: 'E2:4 D#2:4 G#2:4 B2:4', octave: '-:12 C#4:4', inner: '-:16' },
  { bar: 18, melody: 'C#5:2 C#5:2 C#5:2 C#5:1 C#5:1 -:1 B4:1 C#5:1 B4:1 C#5:1 B4:1 C#5:1 E5:1', second: 'G#4:2 F#4:4 F##4:10', bass: 'G#2:4 C#3:4 C#3:4 B2:4', octave: '-:16', inner: '-:16' },
  { bar: 19, melody: 'D#5:3 E5:1 D#5:2 G#5:1 F##5:1 -:1 G#5:1 F##5:1 G#5:1 A5:2 E5:1 G5:1', second: 'A#4:16', bass: 'D#3:4 D#3:3 C#3:5 D#3:4', octave: 'C#4:4 C#4:8 F##3:4', inner: '-:16' },
  { bar: 20, melody: 'A5:2 E6:2 A5:2 G5:1 A5:2 E6:1 A5:1 G5:1 A5:2 E5:1 G5:1', second: 'F5:7 E5:9', bass: 'F3:4 E3:3 A2:5 G3:4', octave: '-:16', inner: '-:16' },
  { bar: 21, melody: 'A5:2 C6:2 B5:2 G5:1 A5:2 B5:1 C6:1 D6:1 F6:2 E6:2', second: 'F5:16', bass: 'D3:4 E3:3 A2:9', octave: '-:12 A4:4', inner: '-:16' },
  { bar: 22, melody: 'A5:2 E6:2 A5:2 G5:1 A5:2 E6:1 A5:1 G5:1 A5:2 E5:1 G5:1', second: 'F5:7 E5:9', bass: 'F3:4 E3:3 A2:5 G3:4', octave: '-:16', inner: '-:16' },
  { bar: 23, melody: 'A5:2 C6:2 B5:2 G5:1 A5:2 A5:2 G5:1 A5:2 C6:2', second: 'F5:7 E5:9', bass: 'D3:4 E3:3 A2:5 B2:4', octave: '-:16', inner: '-:16' },
  { bar: 24, melody: 'A5:2 -:1 G5:1 A5:1 C6:1 D6:1 E6:1 A5:2 -:1 G5:1 A5:1 C6:1 D6:1 E6:1', second: 'F5:8 E5:8', bass: 'F2:4 E2:3 A1:9', octave: '-:12 G3:4', inner: '-:16' },
  { bar: 25, melody: 'A5:2 C6:2 D6:1 C6:1 D6:1 C6:1 D6:1 E6:1 A5:1 C6:1 G5:1 A5:1 E5:1 G5:1', second: 'F5:16', bass: 'D2:4 E2:3 A1:9', octave: '-:12 Bb3:4', inner: '-:16' },
  { bar: 26, melody: 'A5:2 -:1 G5:1 A5:1 C6:1 D6:1 E6:1 A5:2 -:1 G5:1 A5:1 C6:1 D6:1 E6:1', second: 'F5:8 E5:8', bass: 'F2:4 E2:3 A1:9', octave: '-:12 G3:4', inner: '-:16' },
  { bar: 27, melody: 'D6:1 E6:1 D6:1 E6:1 G5:1 A5:1 E5:1 A5:2 A5:2 G5:1 A5:2 -:2', second: 'A5:7 E5:7 -:2', bass: 'D2:4 E2:3 A2:9', octave: '-:16', inner: '-:16' },
  { bar: 28, melody: '-:2 E4:2 E4:2 F4:1 Db4:1 Gb4:1 Db4:1 F4:1 Db4:1 F4:1 Db4:1 Bb4:2', second: '-:16', bass: 'A1:16', octave: '-:16', inner: '-:2 G5:6 A5:6 -:2' },
  { bar: 29, melody: '-:2 Gb4:1 C4:1 F4:1 Db4:1 E4:1 F4:1 Ab4:1 F4:1 A4:1 Gb4:1 A4:1 Gb4:1 Db5:2', second: '-:16', bass: 'A2:16', octave: '-:16', inner: '-:2 G5:6 A5:8' },
  { bar: 30, melody: 'F4:1 B3:1 F4:1 C4:1 Ab4:1 Db4:1 Ab4:1 Db4:1 Ab4:1 Db4:1 Ab4:1 Db4:1 Bb4:2 D5:2', second: '-:16', bass: 'A1:16', octave: '-:16', inner: '-:2 G5:6 A5:6 -:2' },
  { bar: 31, melody: '-:2 A4:1 Eb4:1 Ab4:1 D4:1 Gb4:1 C4:1 F4:1 B3:1 Eb4:1 A3:1 Db4:2 C4:2', second: '-:16', bass: 'A2:3 G3:4 Eb3:5 B2:4', octave: '-:16', inner: '-:16' },
  { bar: 32, melody: 'A3:2 G#3:2 A3:2 G#3:2 A3:2 A3:2 A3:2 A3:2', second: '-:16', bass: 'A1:8 A1:4 E2:4', octave: '-:4 A4:3 G3:9', inner: '-:16' },
  { bar: 33, melody: 'A3:2 A3:1 B3:1 C4:2 C4:2 C4:2 C4:1 C#4:1 C#4:2 C#4:2', second: '-:16', bass: 'A1:8 A1:4 A2:4', octave: '-:4 A4:3 Gb3:5 Gb3:4', inner: '-:16' },
  { bar: 34, melody: 'C#4:2 D4:2 Eb4:2 F4:2 F#4:1 G4:1 G4:2 A4:2 B4:2', second: '-:16', bass: '-:2 A2:6 A2:4 E2:4', octave: '-:16', inner: '-:16' },
  { bar: 35, melody: 'C#6:2 D6:2 E6:2 F#6:2 G6:2 G#6:2 A6:2 E5:1 G5:1', second: '-:16', bass: 'A1:4 G2:4 F#3:4 E4:4', octave: '-:12 B4:2 -:2', inner: '-:16' },
  { bar: 36, melody: 'A5:2 E6:2 A5:2 G5:1 A5:2 E6:1 A5:1 G5:1 A5:2 E5:1 G5:1', second: 'F5:7 E5:9', bass: 'F3:4 E3:3 A2:5 G3:4', octave: '-:16', inner: '-:16' },
  { bar: 37, melody: 'A5:2 C6:2 B5:2 G5:1 A5:2 B5:1 C6:1 D6:1 F6:2 E6:2', second: 'F5:16', bass: 'D3:4 E3:3 A2:9', octave: '-:12 A4:4', inner: '-:16' },
  { bar: 38, melody: 'A5:2 E6:2 A5:2 G5:1 A5:2 E6:1 A5:1 G5:1 A5:2 E5:1 G5:1', second: 'F5:7 E5:9', bass: 'F3:4 E3:3 A2:5 G3:4', octave: '-:16', inner: '-:16' },
  { bar: 39, melody: 'A5:2 C6:2 B5:2 G5:1 A5:2 A5:2 G5:1 A5:2 -:1 G5:1', second: 'F5:7 E5:9', bass: 'D3:4 D3:3 A2:5 B2:4', octave: '-:16', inner: '-:16' },
  { bar: 40, melody: 'A5:2 C6:2 D6:2 E6:1 A5:2 A5:1 C6:1 A5:1 D6:1 E6:1 D6:1 E6:1', second: 'F5:16', bass: 'F2:4 E2:3 A1:5 G3:4', octave: '-:2 C4:4 B3:10', inner: '-:16' },
  { bar: 41, melody: 'A5:2 C6:2 B5:2 G5:1 E5:2 G5:1 D5:1 E5:1 C5:1 D5:1 E5:1 G5:1', second: 'F5:7 C5:9', bass: 'D2:4 E2:3 A1:5 Bb2:4', octave: '-:16', inner: '-:16' },
  { bar: 42, melody: 'A5:2 C6:2 D6:2 E6:1 A5:2 A5:1 C6:1 A5:1 D6:1 E6:1 D6:1 E6:1', second: 'F5:16', bass: 'F2:4 E2:3 A1:5 G3:4', octave: '-:2 C4:4 B3:10', inner: '-:16' },
  { bar: 43, melody: 'A5:2 D6:2 B5:2 G5:1 A5:2 A5:1 A5:1 G5:1 A5:4', second: 'F5:7 E5:9', bass: 'D2:4 E2:3 A2:9', octave: '-:12 C#4:4', inner: '-:16' },
  { bar: 44, melody: '-:2 G4:1 C4:1 Ab4:1 C4:1 Ab4:1 Db4:1 Ab4:1 Db4:1 Ab4:1 Db4:1 Bb4:1 E4:1 G5:2', second: '-:16', bass: 'A1:4 C3:8 Bb1:4', octave: '-:8 E5:2 -:6', inner: '-:16' },
  { bar: 45, melody: '-:2 A4:1 E4:1 A4:1 E4:1 A4:1 D4:1 E4:1 Bb4:1 E4:1 Bb4:1 Bb4:1 G4:1 E6:2', second: '-:16', bass: 'A1:8 C#3:4 Bb1:4', octave: '-:4 C#5:4 E3:8', inner: '-:16' },
  { bar: 46, melody: 'C5:2 A4:1 E4:1 C5:1 -:1 A4:1 E4:1 A4:1 E4:1 A4:1 E4:1 Bb4:1 E4:1 G5:2', second: '-:16', bass: 'A1:4 C3:8 Bb1:4', octave: '-:8 Eb5:2 -:6', inner: '-:16' },
  { bar: 47, melody: '-:2 Bb4:1 E4:1 A4:1 E4:1 Bb4:1 E4:1 Bb4:1 F4:1 C5:1 F#4:1 C#5:1 G4:1 C#6:2', second: '-:16', bass: 'A1:8 C#3:4 Bb1:4', octave: '-:4 C#5:4 F3:8', inner: '-:16' },
  { bar: 48, melody: '-:2 Ab5:1 E5:1 Ab5:1 E5:1 Gb5:1 D5:1 Ab5:1 E5:1 G5:1 D5:1 G5:1 C5:1 C6:2', second: 'E5:8 D5:8', bass: 'A2:4 F3:4 E3:4 Bb2:4', octave: '-:16', inner: '-:16' },
  { bar: 49, melody: '-:2 A5:1 E5:1 A5:1 E5:1 G#5:1 D5:1 A5:1 F5:1 G#5:1 F5:1 A5:1 E5:1 D6:2', second: 'C#5:16', bass: 'A2:4 A2:2 E3:6 Bb2:4', octave: '-:16', inner: '-:16' },
  { bar: 50, melody: 'C6:3 B5:1 B5:1 F5:1 G5:1 E5:1 G5:1 D#5:1 G5:1 D5:1 G5:1 D5:1 E6:2', second: 'E5:8 D5:8', bass: 'A2:4 A2:4 F3:4 Bb2:4', octave: '-:16', inner: '-:16' },
  { bar: 51, melody: '-:2 E5:2 G5:1 E5:1 B5:1 F5:1 A#5:1 G5:1 A5:1 F5:1 A#5:1 F5:1 A6:2', second: 'C#5:16', bass: 'A2:4 A2:4 F3:4 A2:4', octave: '-:16', inner: '-:16' },
  { bar: 52, melody: 'F3:1 D3:1 B2:1 C3:1 A2:2 C6:1 D6:1', second: '-:8', bass: 'B2:4 A1:4', octave: '-:8', inner: '-:8' },
  { bar: 53, melody: 'E6:2 C7:1 B6:2 G6:2 D6:1 -:1 C6:1 D6:1 C6:1 E6:2 A5:1 E6:1', second: 'C6:3 G6:4 A5:9', bass: 'F4:4 E4:3 D4:5 A#3:4', octave: '-:16', inner: '-:16' },
  { bar: 54, melody: 'D6:2 A5:1 E6:1 D6:2 E6:1 G6:1 C7:1 B6:1 G6:1 D6:1 E6:2 B4:1 C#5:1', second: 'A5:8 G6:8', bass: 'D4:4 E4:4 C4:4 Bb3:4', octave: '-:16', inner: '-:16' },
  { bar: 55, melody: 'D#6:2 B6:1 A6:1 -:1 F#6:2 C#6:2 B5:1 C#6:1 F#6:1 D#6:2 G#5:1 D#6:1', second: 'B5:7 G#5:9', bass: 'E4:4 D#4:3 C#4:4 A3:5', octave: '-:16', inner: '-:16' },
  { bar: 56, melody: 'C#6:2 G#5:1 D#6:1 C#6:2 F#5:1 G#5:1 -:1 G#5:2 F#5:1 G#5:2 -:1 G#6:2', second: 'G#5:4 F#5:8 D#5:3 D#6:2', bass: 'C#4:4 D#4:3 G#3:5 G#4:12', octave: '-:16', inner: '-:16' },
  { bar: 57, melody: 'F#6:1 G#6:1 D#7:1 G#6:1 C#5:1 E#5:1 G#5:1', second: '-:2 D#6:2 -:1 D#5:1 E#5:1', bass: '', octave: '-:1 C#5:1 D#5:1 F#5:1 G#5:2 -:2', inner: '-:8' },
  { bar: 58, melody: 'A#5:2 E#6:2 A#5:2 G#5:1 A#5:2 E#6:1 A#5:1 G#5:1 A#5:2 E#5:1 G#5:1', second: 'F#5:7 E#5:9', bass: 'F#3:4 E#3:4 A#2:4 C#3:4', octave: '-:16', inner: '-:16' },
  { bar: 59, melody: 'A#5:2 C#6:2 B#5:2 G#5:1 A#5:2 B#5:1 C#6:1 D#6:1 F#6:2 E#6:2', second: 'F#5:16', bass: 'D#3:4 E#3:4 A#3:4 G#3:4', octave: '-:12 A#4:4', inner: '-:16' },
  { bar: 60, melody: 'A#5:2 E#6:2 A#5:2 G#5:1 A#5:2 E#6:1 A#5:1 G#5:1 A#5:2 E#5:1 G#5:1', second: 'F#5:7 E#5:9', bass: 'F#3:4 E#3:3 A#2:5 G#3:4', octave: '-:16', inner: '-:16' },
  { bar: 61, melody: 'A#5:2 C#6:2 B#5:2 G#5:1 A#5:1 -:1 A#5:2 G#5:1 A#5:2 C#6:2', second: 'F#5:7 E#5:9', bass: 'D#3:4 E#3:3 A#2:5 A#2:4', octave: '-:16', inner: '-:16' },
  { bar: 62, melody: 'A#5:2 -:1 G#5:1 A#5:1 C#6:1 D#6:1 E#6:1 A#5:2 -:1 G#5:1 A#5:1 C#6:1 D#6:1 E#6:1', second: 'F#5:8 E#5:8', bass: 'F#2:4 E#2:3 A#2:5 G#2:4', octave: '-:16', inner: '-:16' },
  { bar: 63, melody: 'A#5:2 C#6:2 D#6:1 C#6:1 D#6:1 C#6:1 D#6:1 E#6:1 A#5:1 C#6:1 G#5:1 E#5:1 D#6:2', second: 'F#5:16', bass: 'F#3:4 B#2:3 A#1:5 G#3:4', octave: '-:16', inner: '-:16' },
  { bar: 64, melody: 'C#6:2 -:1 G#5:1 A#5:1 C#6:1 D#6:1 E#6:1 A#5:2 -:1 G#5:1 A#5:1 C#6:1 D#6:1 E#6:1', second: 'A#5:8 E#5:8', bass: 'F#2:4 E#2:3 A#2:5 G#2:4', octave: '-:16', inner: '-:16' },
  { bar: 65, melody: 'D#6:1 E#6:1 D#6:1 E#6:1 G#5:1 A#5:1 E#5:1 A#5:1 -:1 A#5:2 G#5:1 A#5:2 -:2', second: 'A#5:16', bass: 'D#3:4 D#3:3 A#2:5 E#3:4', octave: '-:16', inner: '-:16' },
  { bar: 66, melody: 'A#5:3 A#5:2 C#6:1 D#6:1 E#6:1 A#5:3 G#5:1 G#5:1 A#5:1 C#6:1 D#6:1', second: 'A#4:7 E#5:3 C#5:6', bass: 'G#3:4 F#3:3 E#3:5 D#3:4', octave: '-:16', inner: '-:16' },
  { bar: 67, melody: 'E#6:2 D#6:1 E#6:1 B#5:1 G#5:1 E#5:1 A#5:1 -:1 A#5:2 G#5:1 A#5:2 C#5:1 E#5:1', second: 'A#5:16', bass: 'D#3:4 E#3:8 C##4:4', octave: '-:16', inner: '-:16' },
  { bar: 68, melody: 'G#5:1 A#5:2 A#4:5 C#5:1 D#5:1 D##5:1 E#5:1 -:1 G#4:1 A#4:1 C#5:1', second: '-:16', bass: 'F#2:3 E#3:4 A#2:5 C#3:4', octave: '-:16', inner: '-:16' },
  { bar: 69, melody: 'G#5:1 A#5:2 A#4:5 C#6:1 D#6:1 D##6:1 E#6:1 -:1 D#6:1 C#6:1 -:1', second: '-:16', bass: 'F#3:3 E#3:4 A#2:4 D#3:5', octave: '-:16', inner: '-:16' },
  { bar: 70, melody: 'G#5:1 A#5:2 A#4:5 C#5:1 D#5:1 D##5:1 E#5:1 -:1 G#4:1 A#4:1 C#5:1', second: '-:16', bass: 'F#2:4 E#2:3 A#2:5 B3:4', octave: '-:16', inner: '-:16' },
  { bar: 71, melody: 'G#5:1 A#5:2 A#4:5 C#5:1 G#4:1 D#5:1 C#5:1 -:1 C#5:1 C#6:1 -:1', second: '-:16', bass: 'D#2:4 E#2:3 C#3:4 C#3:5', octave: '-:16', inner: '-:16' },
  { bar: 72, melody: 'A#5:2 G#5:2 A#5:2 B5:2 A#5:2 G#5:2 A#5:2 B5:2', second: 'E#5:8 F5:8', bass: 'A#2:3 E#3:5 B2:3 F3:5', octave: '-:2 A#3:8 B3:6', inner: '-:16' },
  { bar: 73, melody: 'A#5:2 G#5:2 A#5:2 B5:2 -:8', second: 'E#5:8 -:8', bass: 'A#2:3 E#3:5 A#1:4 -:4', octave: '-:8 A#2:1 D#3:1 G#3:1 A#3:1 -:4', inner: '-:16' },
];

describe('Idol (Oshi no Ko) on the player piano, written out from the score', () => {
  const piece = TRACKS['idol'] ?? { bpm: 0, loop: false, voices: [] };
  const bars = (voice: number) => piece.voices[voice]?.notes.split('|').map((bar) => bar.trim().split(/\s+/).join(' ')) ?? [];
  const notes = (voice: number) => parseVoice(piece.voices[voice]?.notes ?? '').notes.length;

  it('steps in sixteenths of a quarter note at 83 a minute: bpm 83, a step of about 181 ms, played once', () => {
    expect(piece.bpm).toBe(83);
    expect(stepSeconds(piece)).toBeCloseTo(60 / 83 / 4, 9);
    expect(piece.loop).toBe(false);
  });

  it('has the 73 bars of the score, two of them 2/4, at one tempo: 3:28', () => {
    for (let voice = 0; voice < 5; voice++) expect(bars(voice)).toHaveLength(73);
    expect(trackSteps(piece)).toBe(1152);
    for (const voice of piece.voices) expect(parseVoice(voice.notes).steps).toBe(trackSteps(piece));
    // 71 bars of 4/4 and two of 2/4: 288 beats at 83 a minute (the score's 75 and 80 sections play at 83 too).
    const { length } = flatten(piece);
    expect(length).toBeCloseTo((288 * 60) / 83, 6);
    expect(length).toBeLessThan(360);
  });

  it('has five plucked voices, reduced on purpose: under six notes a second', () => {
    expect(piece.voices.map((voice) => voice.wave)).toEqual(['pulse', 'thin', 'triangle', 'triangle', 'thin']);
    for (const voice of piece.voices) expect(voice.pluck).toBe(true);
    expect([0, 1, 2, 3, 4].map(notes)).toEqual([804, 94, 252, 56, 7]);
    const all = [0, 1, 2, 3, 4].map(notes).reduce((a, b) => a + b, 0);
    expect(all / flatten(piece).length).toBeLessThan(6);
  });

  it('plays every note on a piano, over the 40 Hz floor (F#1 to D#7)', () => {
    const frequencies = flatten(piece).notes.map((note) => note.frequency);
    expect(frequencies.length).toBeGreaterThan(0);
    expect(Math.min(...frequencies)).toBeCloseTo(46.25, 1);
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

describe('the selector with twelve pieces', () => {
  const world = buildWorld({ profile, skills, experience, education, projects });
  const tick = (state: GameState, input: Partial<typeof NO_INPUT>) => step(state, { ...NO_INPUT, ...input }, world, { instant: true });
  const press = (state: GameState, input: Partial<typeof NO_INPUT>) => tick(state, input).state;
  const open: GameState = { ...initialGame(world), scene: 'world', map: 'cafe', pick: { cursor: 0 } };
  const down = (state: GameState, times: number): GameState => (times === 0 ? state : down(press(state, { dir: 'down', pressed: 'down' }), times - 1));
  const ids = ['moonlight', 'scarborough-fair', 'always-in-my-heart', 'unravel', 'aliez', 'guren-no-yumiya', 'ichiban-no-takaramono', 'bauklotze', 'my-soul-your-beats', 'lilium', 'guilty-crown', 'idol'];

  it('lists the twelve pieces, Idol the twelfth and last, each with the length of its own track, and no piano track out of the list', () => {
    expect(PIECES.find((entry) => entry.id === 'idol')).toEqual({ id: 'idol', name: 'IDOL (OSHI NO KO)', artist: 'YOASOBI', track: 'idol' });
    expect(world.pieces!.map((piece) => piece.id)).toEqual(ids);
    const piano = Object.entries(TRACKS).filter(([, track]) => track.loop === false && track.voices.every((voice) => voice.pluck)).map(([name]) => name);
    expect(piano.sort()).toEqual(PIECES.map((entry) => entry.track).sort());
    expect(world.pieces![11]!.ticks).toBe(Math.round(flatten(TRACKS['idol']!).length * 60));
    expect(new Set(world.pieces!.map((piece) => piece.ticks)).size).toBe(12);
  });

  it('plays Idol with A on the twelfth row, and the others still their own', () => {
    ids.forEach((id, i) => expect(press(down(open, i), { a: true }).piano).toMatchObject({ piece: id, ticks: world.pieces![i]!.ticks }));
  });

  it('says the twelfth row in the status region: its name, artist, length and "12 of 12"', () => {
    const said = tick(down(open, 10), { dir: 'down', pressed: 'down' }).events.map((event) => event.text);
    expect(said).toEqual(['IDOL (OSHI NO KO), YOASOBI, 3:28. 12 of 12.']);
  });
});
