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
 * My Dearest, the opening of the anime Guilty Crown, written out by hand from the PDF score of a piano arrangement
 * (see the credit above the track in music.ts); the PDF is not in the repository. Each bar of the score is a bar here
 * (117, no repeats), reduced to five voices: the melody (the tune: the left hand's upper line in bars 1 to 5, else
 * the top of the right hand), the second voice (the right hand's next line: the intro's eighth figure, the lower
 * octave or the lower voice), the bass (the lowest line of the left hand, held to its next note; in the verse on the
 * first and third beat only), the octave voice (one tone of the left hand's chords; its arpeggios on the beat) and
 * one more chord tone. A step is a sixteenth at 120 quarter notes a minute; the sixteenth triplets of bar 76 are two
 * sixteenths a triplet. The fermata of bar 8 (on whole notes) adds two beats to its bar, those of bars 41 and 113 one.
 * A tied note stays in the bar where it starts, so a bar can be longer or shorter, or empty, in a voice. The leading
 * rests of the printed first bar are left out (bar 1 is the pickup alone, 4 steps), and bar 117 ends on a rest of 12
 * steps, so the track is still a multiple of 16 steps.
 */
const BARS: { bar: number; melody: string; second: string; bass: string; octave: string; inner: string }[] = [
  { bar: 1, melody: 'G3:4', second: '-:4', bass: '-:4', octave: '-:4', inner: '-:4' },
  { bar: 2, melody: 'C4:4 B3:2 A3:4 G3:4 G3:4', second: 'C5:2 G4:2 C5:2 G5:2 C5:2 G4:2 C5:2 G5:2', bass: 'C3:14 G2:18', octave: 'F3:14 D3:18', inner: 'A3:14 -:2' },
  { bar: 3, melody: 'D3:4 E3:6 F3:4', second: 'C5:2 G4:2 C5:2 G5:2 C5:2 G4:2 C5:2 G5:2', bass: '', octave: '', inner: '-:16' },
  { bar: 4, melody: 'E3:4 F3:2 E3:4 F3:4 E3:4', second: 'C5:2 G4:2 C5:2 G5:2 C5:2 G4:2 C5:2 G5:2', bass: 'A2:14 E2:18', octave: 'C3:14 G2:18', inner: '-:14 C3:18' },
  { bar: 5, melody: 'D3:2 C3:6 B2:6', second: 'C5:2 G4:2 C5:2 G5:2 C5:2 G4:2 C5:2 G5:2', bass: '', octave: '', inner: '' },
  { bar: 6, melody: '-:16', second: 'C5:2 G4:2 C5:2 G5:2 C5:2 G4:2 C5:2 G5:2', bass: 'F2:56', octave: 'A2:56', inner: 'C3:56' },
  { bar: 7, melody: '-:16', second: 'C5:2 G4:2 C5:2 G5:2 C5:2 G4:2 C5:2 G5:2', bass: '', octave: '', inner: '' },
  { bar: 8, melody: 'C6:24', second: '-:24', bass: '', octave: '', inner: '' },
  { bar: 9, melody: '-:4 C4:4 D4:4 C4:4', second: '-:16', bass: '-:8 G1:8', octave: '-:8 G2:8', inner: '-:16' },
  { bar: 10, melody: 'C6:16', second: 'A5:16', bass: 'A1:14 A1:2', octave: 'A2:4 E3:4 A3:4 E3:2 A2:2', inner: 'E5:16' },
  { bar: 11, melody: 'C6:6 B5:6 A5:4', second: 'A5:6 B4:6 A4:4', bass: 'A1:16', octave: 'A2:4 C4:4 E4:4 C4:4', inner: 'C5:6 -:10' },
  { bar: 12, melody: 'G5:16', second: 'C5:16', bass: 'F1:14 F1:2', octave: 'F2:4 C3:4 F3:4 C3:2 F2:2', inner: 'A4:16' },
  { bar: 13, melody: 'G5:6 F5:6 E5:4', second: 'G4:6 F4:6 E4:4', bass: 'F1:16', octave: 'F2:4 A3:4 C4:4 A3:4', inner: 'C5:6 -:10' },
  { bar: 14, melody: 'D5:16', second: 'B4:16', bass: 'G1:14 G1:2', octave: 'G2:4 D3:4 G3:4 D3:2 G2:2', inner: 'G4:16' },
  { bar: 15, melody: 'D5:6 E5:6 F5:4', second: 'D4:6 E4:6 F4:4', bass: 'G1:16', octave: 'G2:4 B3:4 D4:4 B3:4', inner: 'B4:6 -:10' },
  { bar: 16, melody: 'E5:16', second: 'C5:16', bass: 'C2:16', octave: '-:4 C4:4 E4:4 C4:4', inner: 'G4:16' },
  { bar: 17, melody: '-:4 G4:1 A4:1 B4:1 C5:1 D5:1 E5:1 F5:1 G5:1 A5:1 B5:1 C6:1 D6:1', second: 'D5:16', bass: 'B1:16', octave: '-:4 B3:4 D4:4 B3:4', inner: 'G4:16' },
  { bar: 18, melody: 'E6:16', second: 'A5:16', bass: 'A1:14 A1:2', octave: '-:4 E3:4 A3:4 E3:2 A2:2', inner: '-:16' },
  { bar: 19, melody: 'C6:6 B5:6 C6:4', second: 'A5:6 B4:6 C5:4', bass: 'A1:16', octave: 'A2:4 C4:4 E4:4 C4:4', inner: 'C5:6 -:10' },
  { bar: 20, melody: 'G6:16', second: 'E6:16', bass: 'E1:14 E1:2', octave: 'E2:4 B2:4 E3:4 B2:2 E2:2', inner: 'B5:16' },
  { bar: 21, melody: 'G6:6 F6:6 E6:4', second: 'G5:6 F5:6 E5:4', bass: 'E1:16', octave: 'E2:4 G3:4 B3:4 G3:4', inner: 'B5:6 -:10' },
  { bar: 22, melody: 'D6:16', second: 'A5:16', bass: 'F1:14 F1:2', octave: 'F2:4 C3:4 F3:4 C3:2 F2:2', inner: 'F5:16' },
  { bar: 23, melody: '-:4 F5:4 A5:4 C6:4', second: '-:4 F4:4 A4:4 C5:4', bass: 'F1:16', octave: 'F2:4 A3:4 C4:4 A3:4', inner: '-:4 A4:4 C5:4 -:4' },
  { bar: 24, melody: 'D6:16', second: 'Ab5:16', bass: 'F1:16', octave: 'F2:4 Ab3:2 C4:4 Ab3:2 C4:4', inner: 'F5:16' },
  { bar: 25, melody: 'E6:16', second: 'G#5:16', bass: 'G1:8 D3:8', octave: 'G2:8 B3:8', inner: 'B5:16' },
  { bar: 26, melody: 'E4:28', second: 'C4:28', bass: 'C2:8 E2:8', octave: '-:4 G2:4 C3:4 G2:4', inner: 'G3:28' },
  { bar: 27, melody: 'C4:2 G4:2', second: '-:4', bass: 'E2:8 C3:8', octave: 'C3:4 E3:4 G3:4 E3:4', inner: '-:4' },
  { bar: 28, melody: 'G4:6 F4:6 E4:8', second: 'C4:6 B3:18', bass: 'E1:8 G#2:8', octave: 'E2:4 B2:4 E3:4 B2:4', inner: 'G#3:6 -:10' },
  { bar: 29, melody: 'C4:4 D4:4 C4:4', second: '-:8', bass: 'G#2:8 D3:8', octave: 'E3:4 G#3:4 B3:4 G#3:4', inner: '-:16' },
  { bar: 30, melody: 'D4:6 C4:1 D4:1 C4:20', second: 'B3:6 -:10', bass: 'A1:8 C3:8', octave: 'A2:4 E3:4 A3:4 E3:4', inner: '-:16' },
  { bar: 31, melody: 'B3:2 C4:2', second: '-:16', bass: 'C3:8 A3:8', octave: 'A3:4 C4:4 E4:4 C4:4', inner: '-:16' },
  { bar: 32, melody: 'B3:8 C4:4 B3:8', second: 'G3:8 -:8', bass: 'G1:8 B2:8', octave: 'G2:4 E3:4 G3:4 E3:4', inner: '-:16' },
  { bar: 33, melody: 'G3:8 G3:4', second: '-:16', bass: 'G3:4 E3:4 E3:4 B2:4', octave: '-:8 B3:4 G3:4', inner: '-:16' },
  { bar: 34, melody: 'G3:4 A3:2 A3:22', second: '-:4 F3:2 F3:22', bass: 'F1:8 A2:8', octave: 'F2:4 C3:4 F3:4 C3:4', inner: '-:16' },
  { bar: 35, melody: 'C4:4', second: '-:4', bass: 'A2:8 F3:8', octave: 'F3:4 A3:4 C4:4 A3:4', inner: '-:16' },
  { bar: 36, melody: 'G3:28', second: 'E3:28', bass: 'E1:8 G2:8', octave: 'E2:4 C3:4 E3:4 C3:4', inner: '-:16' },
  { bar: 37, melody: 'G3:2 E4:2', second: '-:4', bass: 'G2:8 E3:8', octave: 'E3:4 G3:4 C4:4 G3:4', inner: '-:16' },
  { bar: 38, melody: 'E4:4 F4:2 F4:24', second: '-:6 C4:24', bass: 'F1:8 Ab2:8', octave: 'F2:4 C3:4 F3:4 C3:4', inner: '-:6 Ab3:24' },
  { bar: 39, melody: 'E4:2', second: '-:2', bass: 'Ab2:8 F3:8', octave: 'F3:4 Ab3:4 C4:4 Ab3:4', inner: '-:2' },
  { bar: 40, melody: 'D4:14 C4:2', second: '-:16', bass: 'G1:8 F3:8', octave: 'G2:4 Ab3:4 B3:4 Ab3:4', inner: '-:16' },
  { bar: 41, melody: 'B3:16 C4:2 C4:30', second: '-:20', bass: 'G1:20', octave: 'G2:20', inner: '-:20' },
  { bar: 42, melody: '', second: 'G3:28', bass: 'C2:8 E2:8', octave: '-:4 G2:4 C3:4 E3:4', inner: 'E3:28' },
  { bar: 43, melody: 'C5:2 G5:2', second: '-:4', bass: 'C3:8 G3:8', octave: 'G3:4 C4:4 E4:4 C4:4', inner: '-:4' },
  { bar: 44, melody: 'G5:6 F5:6 E5:8', second: 'C5:6 B4:18', bass: 'E1:8 G#2:8', octave: 'E2:4 B2:4 E3:4 G#3:4', inner: 'G#4:6 -:10' },
  { bar: 45, melody: 'C5:4 D5:4 C5:4', second: '-:8', bass: 'D3:4 G#3:12', octave: 'B3:4 D4:4 C4:4 B3:4', inner: '-:16' },
  { bar: 46, melody: 'D5:6 C5:22', second: 'B4:6 A4:22', bass: 'A1:8 C3:8', octave: 'A2:4 E3:4 B3:4 C4:4', inner: '-:16' },
  { bar: 47, melody: 'B4:2 C5:2', second: '-:4', bass: 'A3:8 E4:8', octave: 'E4:4 A4:4 C5:4 A4:4', inner: '-:16' },
  { bar: 48, melody: 'A4:8 C#5:4 D5:8', second: '-:8 A4:4 A4:8', bass: 'C#2:8 E2:8', octave: '-:4 A2:4 C#3:4 E3:4', inner: '-:16' },
  { bar: 49, melody: 'E5:8 F5:4', second: 'C#5:8 -:4', bass: 'C#3:8 G3:8', octave: 'A3:4 C#4:4 D4:4 E4:4', inner: '-:4 A4:8 -:4' },
  { bar: 50, melody: 'E5:4 D5:2 C5:22', second: 'A4:8 -:8', bass: 'D2:8 F2:8', octave: '-:4 A2:4 E3:4 F3:4', inner: 'F4:8 -:8' },
  { bar: 51, melody: 'B4:2 C5:2', second: '-:16', bass: 'D3:8 A3:8', octave: 'A3:4 D4:4 F4:4 D4:4', inner: '-:16' },
  { bar: 52, melody: 'G4:28', second: 'E4:28', bass: 'E1:8 G2:8', octave: 'E2:4 C3:4 E3:4 G3:4', inner: '-:16' },
  { bar: 53, melody: 'G4:2 E5:2', second: '-:4', bass: 'E3:8 C4:8', octave: 'C4:4 E4:4 G4:4 E4:4', inner: '-:16' },
  { bar: 54, melody: 'E5:4 F5:2 F5:24', second: '-:4 C5:2 C5:24', bass: 'F1:8 Ab2:8', octave: 'F2:4 C3:4 F3:4 Ab3:4', inner: '-:4 Ab4:2 Ab4:24' },
  { bar: 55, melody: 'E5:2', second: '-:2', bass: 'F3:8 F3:8', octave: 'C4:4 Ab3:4 C4:4 F4:4', inner: '-:2' },
  { bar: 56, melody: 'D5:16', second: '-:16', bass: 'G1:8 F3:8', octave: 'G2:4 Ab3:4 B3:4 Ab3:4', inner: '-:16' },
  { bar: 57, melody: '-:4 C5:4 E5:4 D5:4', second: '-:16', bass: 'G1:8 G2:8', octave: 'G2:8 G3:8', inner: '-:8 D3:8' },
  { bar: 58, melody: 'C5:4 C6:2 C6:4 C6:4 C6:4', second: '-:4 F5:2 F5:4 F5:4 F5:4', bass: 'F1:30', octave: '-:2 F2:2 A2:4 F3:4 C4:4', inner: '-:4 C5:2 C5:4 C5:4 C5:4' },
  { bar: 59, melody: 'C6:4 C6:4 C6:4 C6:6', second: 'F5:4 C5:4 C5:4 C5:6', bass: 'F1:2', octave: 'F4:4 A3:4 C3:4 F2:4', inner: '-:14' },
  { bar: 60, melody: 'B5:2 A5:4 G5:4 G5:14', second: 'B4:2 A4:4 G4:4 D5:2', bass: 'G1:30', octave: '-:2 G2:2 B2:4 G3:4 D4:4', inner: '-:14 B4:14' },
  { bar: 61, melody: 'C5:2 D5:2', second: 'C5:4 B4:2 A4:4 G4:6', bass: 'G1:2', octave: 'G4:4 B3:4 D3:4 G2:4', inner: '-:4' },
  { bar: 62, melody: 'E5:4 F5:2 E5:6 C5:2 D5:2', second: 'C5:8 -:8', bass: 'A1:16', octave: '-:2 A2:2 C3:4 A3:4 C3:4', inner: 'A4:8 -:8' },
  { bar: 63, melody: 'E5:4 F5:2 E5:6 C5:2 D5:2', second: 'C5:8 -:8', bass: 'A1:16', octave: '-:2 A2:2 C3:4 A3:4 C3:4', inner: 'A4:8 -:8' },
  { bar: 64, melody: 'E5:4 F5:2 E5:4 F5:4 E5:4', second: 'G4:8 -:8', bass: 'E1:30', octave: '-:2 E2:6 G2:4 C3:4', inner: 'E4:8 -:8' },
  { bar: 65, melody: 'D5:4 C5:4 D5:6', second: '-:16', bass: 'C2:2', octave: 'E3:4 G3:4 C3:4 E2:4', inner: '-:16' },
  { bar: 66, melody: '-:6 C4:2 F4:2 A4:2 C5:2 F5:2', second: 'C5:24', bass: 'F1:30', octave: '-:2 F2:2 A2:4 F3:4 C4:4', inner: 'F4:24' },
  { bar: 67, melody: 'C6:8 C6:2 C6:2 C6:2 C6:2', second: '-:8', bass: 'F1:2', octave: 'F4:4 A3:4 C3:4 F2:4', inner: '-:8' },
  { bar: 68, melody: 'A5:4 G5:12', second: 'A4:4 G4:12', bass: 'E1:28', octave: '-:2 E2:6 E3:4 G3:4', inner: '-:10 G4:2 C5:2 E5:2' },
  { bar: 69, melody: 'G6:4 -:2 C6:2 D6:2 E6:6', second: 'G5:4 -:2 C5:2 D5:2 E5:6', bass: 'C2:4', octave: 'C4:4 E3:4 G2:8', inner: '-:16' },
  { bar: 70, melody: 'E6:12 F6:2 E6:14', second: 'E5:12 F5:2 E5:14', bass: 'F1:30', octave: '-:2 F2:2 A2:4 F3:4 C4:4', inner: 'A5:12 -:2 A5:14' },
  { bar: 71, melody: 'C6:4', second: 'C5:4', bass: 'F1:2', octave: 'F4:4 A3:4 C3:4 F2:4', inner: '-:4' },
  { bar: 72, melody: 'E6:8 -:8', second: 'Ab5:8 -:8', bass: 'F1:4 Ab1:2 C2:2 F2:2 Ab2:2 C3:2 F3:2', octave: '-:16', inner: 'E5:8 -:8' },
  { bar: 73, melody: 'F4:2 Ab4:2 C5:2 F5:2 Ab5:2 C6:2 D6:4', second: '-:8 C5:2 F4:2 C5:2 Ab4:2', bass: '-:16', octave: 'Ab3:2 C4:2 F4:2 Ab4:2 -:8', inner: '-:12 D5:4' },
  { bar: 74, melody: 'F6:8 B5:8', second: 'F5:8 B4:8', bass: '-:16', octave: 'D5:4 Ab4:4 D4:4 Ab3:4', inner: 'Ab5:8 D5:8' },
  { bar: 75, melody: 'D6:8 F6:8', second: 'D5:8 F5:8', bass: '-:14 F1:2', octave: 'D3:4 Ab2:4 D2:4 Ab1:4', inner: 'F5:8 -:8' },
  { bar: 76, melody: 'G6:8 G3:1 D4:1 G4:1 D5:1 G5:1 D6:1 G6:1 D7:1', second: 'G5:8 -:8', bass: 'G1:6 G2:1 D3:1 -:8', octave: 'G2:6 -:10', inner: '-:16' },
  { bar: 77, melody: 'G7:8 -:6 C5:2', second: '-:16', bass: '-:16', octave: '-:16', inner: '-:16' },
  { bar: 78, melody: 'C6:4 B5:2 A5:4 G5:4 G5:4', second: 'F5:4 -:10 D5:4', bass: 'F1:16', octave: 'F2:4 C3:4 F3:4 A3:4', inner: '-:14 B4:4' },
  { bar: 79, melody: 'D5:4 E5:4 F5:4 F5:2', second: '-:14', bass: 'D3:16', octave: 'C4:6 B3:6 A3:4', inner: '-:14' },
  { bar: 80, melody: 'E5:4 F5:2 E5:4 F5:4 E5:4', second: 'C5:4 -:12', bass: 'E2:16', octave: 'G3:8 C4:4 E3:4', inner: 'G4:4 -:12' },
  { bar: 81, melody: 'D5:2 C5:10 C5:2', second: '-:16', bass: 'A2:16', octave: 'G3:6 F3:6 E3:4', inner: '-:16' },
  { bar: 82, melody: 'C6:4 B5:2 A5:4 G5:4 G5:4', second: 'F5:4 -:10 D5:4', bass: 'F1:16', octave: 'F2:4 C3:4 F3:4 A2:4', inner: '-:14 B4:4' },
  { bar: 83, melody: 'D5:4 E5:4 F5:4 F5:2', second: '-:4 G#4:4 -:6', bass: 'G2:6 G#2:6 E2:4', octave: 'D3:6 E3:6 F3:4', inner: '-:14' },
  { bar: 84, melody: 'E5:4 F5:2 E5:4 F5:4 E5:4', second: 'C5:4 -:10 C5:4', bass: 'A2:16', octave: 'E3:8 A3:4 C3:4', inner: 'A4:4 -:10 G4:4' },
  { bar: 85, melody: 'D5:2 C5:10 C5:2', second: '-:14', bass: 'C3:8 G2:2 E2:2 C2:4', octave: 'C4:8 -:8', inner: '-:14' },
  { bar: 86, melody: 'C6:4 B5:2 A5:4 G5:4 G5:4', second: 'A5:4 B4:2 A4:4 G4:4 D5:4', bass: 'F1:16', octave: 'F2:4 A3:4 A3:4 A3:4', inner: 'F5:4 -:10 B4:4' },
  { bar: 87, melody: 'D5:4 E5:4 F5:4 F5:2', second: 'D4:4 E4:4 F4:4 F4:2', bass: 'G1:16', octave: 'G2:4 B3:4 B3:4 B3:4', inner: '-:14' },
  { bar: 88, melody: 'E5:4 F5:2 E5:4 F5:4 E5:4', second: 'E4:4 F4:2 E4:4 F4:4 E4:4', bass: 'A1:16', octave: 'A2:4 C4:4 C4:4 C4:4', inner: 'C5:4 -:10 G4:4' },
  { bar: 89, melody: 'D5:2 C5:8 G5:4', second: 'D4:2 C4:8 G4:4', bass: 'E1:16', octave: 'E2:4 G3:4 G3:4 G3:4', inner: '-:14' },
  { bar: 90, melody: 'C6:4 B5:2 C6:6 G5:4', second: 'C5:4 B4:2 C5:6 G4:4', bass: 'F1:16', octave: 'F2:4 F3:4 A3:4 F3:4', inner: 'A5:8 -:8' },
  { bar: 91, melody: 'D6:4 C6:2 D6:6 G5:4', second: 'D5:4 C5:2 D5:6 G4:4', bass: 'G1:14 G#1:2', octave: 'G2:4 G3:4 B3:4 G#2:4', inner: 'B5:8 -:8' },
  { bar: 92, melody: 'E6:4 F6:2 E6:4 F6:4 E6:4', second: 'E5:4 F5:2 E5:4 F5:4 E5:4', bass: 'A1:16', octave: 'A2:4 A3:2 C4:14', inner: 'C6:4 -:10 A5:4' },
  { bar: 93, melody: 'D6:2 C6:4 -:6 C5:2', second: 'D5:2 C5:4 -:8', bass: '-:8 A1:2 A1:2 G1:2 G1:2', octave: '-:4 A2:2 A2:2 G2:2 G2:2', inner: '-:14' },
  { bar: 94, melody: 'C6:4 B5:2 A5:4 G5:4 G5:4', second: 'A5:4 B4:2 A4:4 G4:4 C5:4', bass: 'F1:8 F2:8', octave: '-:2 F3:2 -:2 F3:2 -:2 F3:2 -:2 F3:2', inner: 'F5:4 -:10 A4:4' },
  { bar: 95, melody: 'D5:4 E5:4 F5:4 F5:2', second: 'D4:4 E4:4 F4:4 F4:2', bass: 'F1:8 F2:8', octave: '-:2 F3:2 -:2 F3:2 -:2 F3:2 -:2 F3:2', inner: '-:14' },
  { bar: 96, melody: 'E5:4 F5:2 E5:4 F5:4 E5:4', second: 'E4:4 F4:2 E4:4 F4:4 E4:4', bass: 'G1:8 G2:8', octave: '-:2 G3:2 -:2 G3:2 -:2 G3:2 -:2 G3:2', inner: 'G4:4 -:12' },
  { bar: 97, melody: 'D5:2 C5:4 -:6 C5:2', second: 'D4:2 C4:4 -:8', bass: 'G1:8 G2:8', octave: '-:2 G3:2 -:2 G3:2 -:2 G3:2 -:2 G3:2', inner: '-:16' },
  { bar: 98, melody: 'C6:4 B5:2 A5:4 G5:4 G5:4', second: 'A5:4 B4:2 A4:4 G4:4 E5:4', bass: 'A1:8 A2:8', octave: '-:2 A3:2 -:2 A3:2 -:2 A3:2 -:2 A3:2', inner: 'E5:4 -:10 C5:4' },
  { bar: 99, melody: 'D5:4 E5:4 F5:4 F5:2', second: 'D4:4 E4:4 F4:4 F4:2', bass: 'A1:8 A2:8', octave: '-:2 A3:2 -:2 A3:2 -:2 A3:2 -:2 A3:2', inner: '-:14' },
  { bar: 100, melody: 'E5:4 F5:2 E5:4 F5:4 G5:4', second: 'E4:4 F4:2 E4:4 F4:4 E5:4', bass: 'C2:8 C3:8', octave: '-:2 C4:2 -:2 C4:2 -:2 C4:2 -:2 C4:2', inner: 'G4:4 -:10 C5:4' },
  { bar: 101, melody: 'A5:2 G5:4 -:6 C5:2', second: 'A4:2 G4:4 -:8', bass: 'E1:8 C3:8', octave: '-:2 C4:2 -:2 C4:2 -:2 C4:2 -:2 C4:2', inner: '-:14' },
  { bar: 102, melody: 'C6:4 B5:2 A5:4 G5:4 G5:4', second: 'A5:4 B4:2 A4:4 G4:4 C5:4', bass: 'F1:8 F2:8', octave: '-:2 F3:2 -:2 F3:2 -:2 F3:2 -:2 F3:2', inner: 'F5:4 -:10 A4:4' },
  { bar: 103, melody: 'D5:4 E5:4 F5:4 F5:2', second: 'D4:4 E4:4 F4:4 F4:2', bass: 'F1:8 F2:8', octave: '-:2 F3:2 -:2 F3:2 -:2 F3:2 -:2 F3:2', inner: '-:14' },
  { bar: 104, melody: 'E5:4 F5:2 E5:4 F5:4 E5:4', second: 'E4:4 F4:2 E4:4 F4:4 E4:4', bass: 'A1:8 A2:8', octave: '-:2 A3:2 -:2 A3:2 -:2 A3:2 -:2 A3:2', inner: 'A4:4 -:10 G4:4' },
  { bar: 105, melody: 'D5:2 C5:8 B4:4', second: 'D4:2 C4:8 B3:4', bass: 'G1:8 G2:8', octave: '-:2 G3:2 -:2 G3:2 -:2 G3:2 -:2 G3:2', inner: '-:14' },
  { bar: 106, melody: 'C5:6 F4:6 A4:4', second: 'A4:6 D4:6 D4:4', bass: 'D2:6 D2:6 F2:4', octave: '-:6 A2:6 D3:4', inner: 'F4:6 -:10' },
  { bar: 107, melody: 'G4:6 E4:6 C5:4', second: 'E4:6 C4:6 G4:4', bass: 'E1:6 E2:6 G2:4', octave: 'E2:6 C3:6 E3:4', inner: 'C4:6 -:10' },
  { bar: 108, melody: 'Ab4:6 F4:6 Ab4:4', second: 'C4:6 C4:6 C4:4', bass: 'F1:6 F2:6 F2:4', octave: 'F2:6 C3:6 F3:4', inner: 'Ab3:6 -:10' },
  { bar: 109, melody: 'F4:4 C4:4 D4:4 C4:4', second: 'Ab3:4 -:12', bass: 'G1:16', octave: 'G2:16', inner: '-:16' },
  { bar: 110, melody: 'C5:6 B4:6 C5:6', second: 'E4:6 D4:6 E4:6', bass: 'A2:6 G2:6 A2:6', octave: 'A3:6 G3:6 A3:6', inner: '-:16' },
  { bar: 111, melody: 'D5:6 E5:4 G5:4', second: 'D4:6 E4:4 G4:4', bass: 'A2:6 E1:4 C2:4', octave: 'B3:6 E2:4 -:4', inner: '-:16' },
  { bar: 112, melody: 'A5:2 A4:2 A5:2 B5:2 B4:2 B5:2 C6:2 C5:2', second: 'F5:4 F5:2 G5:4 G5:2 A5:4', bass: 'D2:2 A1:2 D2:2 E1:2 C2:2 E1:2 F1:2 C2:2', octave: '-:16', inner: '-:16' },
  { bar: 113, melody: 'C6:2 E6:2 Ab5:2 E5:2 F5:1 Ab5:1 C6:1 F6:2 F6:6 -:1', second: 'A5:2 C6:2 -:7 F5:2 F5:6 -:1', bass: 'F1:2 F1:2 C2:2 F1:5 G1:2 G1:6 -:1', octave: 'F2:2 F2:2 -:2 F2:5 G2:2 G2:6 -:1', inner: '-:20' },
  { bar: 114, melody: '-:4 C4:2 C4:2 C4:2 C4:2 C4:2 C4:2', second: '-:16', bass: '-:4 C2:4 C2:4 C2:4', octave: '-:16', inner: '-:16' },
  { bar: 115, melody: 'C4:2 C4:2 C4:2 C4:2 C4:2 C4:2 C4:2 C4:2', second: '-:16', bass: 'C2:4 C2:4 C2:4 C2:4', octave: '-:16', inner: '-:16' },
  { bar: 116, melody: 'C4:2 C4:2 C4:28', second: '-:4 E3:28', bass: 'C2:4 C2:28', octave: '-:16', inner: '-:4 C3:28' },
  { bar: 117, melody: '-:12', second: '-:12', bass: '-:12', octave: '-:28', inner: '-:12' },
];

describe('My Dearest (Guilty Crown) on the player piano, written out from the score', () => {
  const piece = TRACKS['guilty-crown'] ?? { bpm: 0, loop: false, voices: [] };
  const bars = (voice: number) => piece.voices[voice]?.notes.split('|').map((bar) => bar.trim().split(/\s+/).join(' ')) ?? [];
  const notes = (voice: number) => parseVoice(piece.voices[voice]?.notes ?? '').notes.length;

  it('steps in sixteenths of a quarter note at 120 a minute: bpm 120, a step of 125 ms, played once', () => {
    expect(piece.bpm).toBe(120);
    expect(stepSeconds(piece)).toBeCloseTo(1 / 8, 9);
    expect(piece.loop).toBe(false);
  });

  it('sounds at once: the leading rests of the printed first bar are left out, so a voice starts on a note', () => {
    expect(Math.min(...piece.voices.map((voice) => parseVoice(voice.notes).notes[0]?.step ?? Infinity))).toBe(0);
  });

  it('has the 117 bars of the score, the three fermatas longer: 3:56', () => {
    for (let voice = 0; voice < 5; voice++) expect(bars(voice)).toHaveLength(117);
    expect(trackSteps(piece)).toBe(1888);
    for (const voice of piece.voices) expect(parseVoice(voice.notes).steps).toBe(trackSteps(piece));
    // 468 beats as written at 120 a minute, two for the fermata of bar 8 and one for each of the other two: 236 seconds;
    // the three beats of rest before the pickup are left out and come back as a rest at the end (the multiple of 16).
    const { length } = flatten(piece);
    expect(length).toBeCloseTo(236, 6);
    expect(length).toBeLessThan(360);
  });

  it('has five plucked voices, reduced on purpose: under five and a half notes a second', () => {
    expect(piece.voices.map((voice) => voice.wave)).toEqual(['pulse', 'thin', 'triangle', 'triangle', 'thin']);
    for (const voice of piece.voices) expect(voice.pluck).toBe(true);
    expect([0, 1, 2, 3, 4].map(notes)).toEqual([376, 252, 207, 377, 76]);
    const all = [0, 1, 2, 3, 4].map(notes).reduce((a, b) => a + b, 0);
    expect(all / flatten(piece).length).toBeLessThan(5.5);
  });

  it('plays every note on a piano, over the 40 Hz floor (E1 to G7)', () => {
    const frequencies = flatten(piece).notes.map((note) => note.frequency);
    expect(frequencies.length).toBeGreaterThan(0);
    expect(Math.min(...frequencies)).toBeCloseTo(41.2, 1);
    expect(Math.max(...frequencies)).toBeCloseTo(3135.96, 1);
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

describe('the selector, its first eleven pieces', () => {
  const world = buildWorld({ profile, skills, experience, education, projects });
  const tick = (state: GameState, input: Partial<typeof NO_INPUT>) => step(state, { ...NO_INPUT, ...input }, world, { instant: true });
  const press = (state: GameState, input: Partial<typeof NO_INPUT>) => tick(state, input).state;
  const open: GameState = { ...initialGame(world), scene: 'world', map: 'cafe', pick: { cursor: 0 } };
  const down = (state: GameState, times: number): GameState => (times === 0 ? state : down(press(state, { dir: 'down', pressed: 'down' }), times - 1));
  const ids = ['moonlight', 'scarborough-fair', 'always-in-my-heart', 'unravel', 'aliez', 'guren-no-yumiya', 'ichiban-no-takaramono', 'bauklotze', 'my-soul-your-beats', 'lilium', 'guilty-crown'];

  it('lists the first eleven pieces, My Dearest the eleventh, each with the length of its own track, and no piano track out of the list', () => {
    expect(PIECES.find((entry) => entry.id === 'guilty-crown')).toEqual({ id: 'guilty-crown', name: 'MY DEAREST', artist: 'SUPERCELL', track: 'guilty-crown' });
    // The first eleven of the list; what follows is another piece's test.
    expect(world.pieces!.map((piece) => piece.id).slice(0, 11)).toEqual(ids);
    const piano = Object.entries(TRACKS).filter(([, track]) => track.loop === false && track.voices.every((voice) => voice.pluck)).map(([name]) => name);
    expect(piano.sort()).toEqual(PIECES.map((entry) => entry.track).sort());
    expect(world.pieces![10]!.ticks).toBe(Math.round(flatten(TRACKS['guilty-crown']!).length * 60));
    expect(new Set(world.pieces!.map((piece) => piece.ticks)).size).toBe(world.pieces!.length);
  });

  it('plays My Dearest with A on the eleventh row, and the others still their own', () => {
    ids.forEach((id, i) => expect(press(down(open, i), { a: true }).piano).toMatchObject({ piece: id, ticks: world.pieces![i]!.ticks }));
  });

  it('says the eleventh row in the status region: its name, artist, length and "11 of 12"', () => {
    const said = tick(down(open, 9), { dir: 'down', pressed: 'down' }).events.map((event) => event.text);
    expect(said).toEqual(['MY DEAREST, SUPERCELL, 3:56. 11 of 12.']);
  });
});
