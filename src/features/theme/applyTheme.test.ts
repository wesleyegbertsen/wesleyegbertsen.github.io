import { applyTheme, readStoredThemeIndex } from './applyTheme.ts';
import { THEMES } from './themes.ts';

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

describe('applyTheme', () => {
  it('sets the theme name and every token on the root element', () => {
    applyTheme(2);

    const root = document.documentElement;
    const blue = THEMES[2]!;
    expect(root.dataset.theme).toBe('blue');
    expect(root.style.getPropertyValue('--accent')).toBe(blue.accent);
    expect(root.style.getPropertyValue('--accent-hover')).toBe(blue.accentHover);
    expect(root.style.getPropertyValue('--accent-on-light')).toBe(blue.accentOnLight);
    expect(root.style.getPropertyValue('--accent-soft')).toBe(blue.accentSoft);
    expect(root.style.getPropertyValue('--on-accent')).toBe(blue.onAccent);
  });

  it('can target another element', () => {
    const el = document.createElement('div');
    applyTheme(1, el);
    expect(el.dataset.theme).toBe('red');
  });
});

describe('readStoredThemeIndex', () => {
  it('is 0 when nothing is stored', () => {
    expect(readStoredThemeIndex()).toBe(0);
  });

  it('reads a valid stored index', () => {
    localStorage.setItem('currentMatrixFontColorIndex', '2');
    expect(readStoredThemeIndex()).toBe(2);
  });

  it.each(['9', '-1', '1.5', 'abc'])('falls back to 0 for %s', (raw) => {
    localStorage.setItem('currentMatrixFontColorIndex', raw);
    expect(readStoredThemeIndex()).toBe(0);
  });

  it('falls back to 0 when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStoredThemeIndex()).toBe(0);
  });
});
