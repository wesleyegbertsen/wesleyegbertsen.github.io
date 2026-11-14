import { MATRIX_COLORS } from '../matrix/matrix.ts';
import { contrastRatio } from './contrast.ts';
import { THEMES } from './themes.ts';

const HEX = /^#[0-9a-f]{6}$/i;
const NEAR_BLACK = ['#000000', '#0a140a'];
const BAR = '#333333';
const WHITE = '#ffffff';

describe('THEMES', () => {
  it('has one theme per matrix colour, in the same order', () => {
    expect(THEMES).toHaveLength(MATRIX_COLORS.length);
    THEMES.forEach((theme, i) => expect(theme.rain).toBe(MATRIX_COLORS[i]));
    expect(THEMES.map((t) => t.name)).toEqual(['green', 'red', 'blue', 'white']);
  });

  it('uses #rrggbb for every token', () => {
    for (const theme of THEMES) {
      for (const token of [theme.accent, theme.accentHover, theme.accentOnLight, theme.accentSoft, theme.onAccent]) {
        expect(token).toMatch(HEX);
      }
    }
  });

  describe.each(THEMES.map((theme) => [theme.name, theme] as const))('%s contrast', (_name, theme) => {
    it.each(NEAR_BLACK)('accent text on %s is at least 4.5:1', (background) => {
      expect(contrastRatio(theme.accent, background)).toBeGreaterThanOrEqual(4.5);
    });

    it('accent icon on the bottom bar is at least 3:1', () => {
      expect(contrastRatio(theme.accent, BAR)).toBeGreaterThanOrEqual(3);
    });

    it.each([WHITE, theme.accentSoft])('accent-on-light on %s is at least 4.5:1', (background) => {
      expect(contrastRatio(theme.accentOnLight, background)).toBeGreaterThanOrEqual(4.5);
    });

    it.each([theme.accent, theme.accentHover])('on-accent text on %s is at least 4.5:1', (background) => {
      expect(contrastRatio(theme.onAccent, background)).toBeGreaterThanOrEqual(4.5);
    });
  });
});
