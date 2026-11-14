import { MATRIX_COLORS } from '../matrix/matrix.ts';

export type Theme = {
  name: 'green' | 'red' | 'blue' | 'white';
  /** The rain's own colour, straight from the matrix. */
  rain: string;
  /** Bright shade for dark surfaces: the menu, the project card, bottom bar icons. */
  accent: string;
  /** Hover state of a filled `accent` button. */
  accentHover: string;
  /** Darker shade that reads on white: pills, timelines, focus rings. */
  accentOnLight: string;
  /** Pale tint for pill backgrounds. */
  accentSoft: string;
  /** Text on a filled `accent` button. */
  onAccent: string;
};

/**
 * One theme per matrix colour, in the same order as `MATRIX_COLORS`. Every pairing used by the CSS is
 * checked for contrast in `themes.test.ts`.
 */
export const THEMES: readonly Theme[] = [
  {
    name: 'green',
    rain: MATRIX_COLORS[0],
    accent: '#a4e200',
    accentHover: '#c2f53a',
    accentOnLight: '#3d6b00',
    accentSoft: '#e8f5c8',
    onAccent: '#1c2b00',
  },
  {
    name: 'red',
    rain: MATRIX_COLORS[1],
    accent: '#ff5c5c',
    accentHover: '#ff8585',
    accentOnLight: '#b3001b',
    accentSoft: '#fde4e4',
    onAccent: '#2b0006',
  },
  {
    name: 'blue',
    rain: MATRIX_COLORS[2],
    accent: '#5c9dff',
    accentHover: '#85b6ff',
    accentOnLight: '#1f4fd1',
    accentSoft: '#e3ecff',
    onAccent: '#001233',
  },
  {
    name: 'white',
    rain: MATRIX_COLORS[3],
    accent: '#d9d9d9',
    accentHover: '#f0f0f0',
    accentOnLight: '#454545',
    accentSoft: '#ececec',
    onAccent: '#1a1a1a',
  },
];
