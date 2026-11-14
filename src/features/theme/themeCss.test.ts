import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { THEMES } from './themes.ts';

// Vitest runs with `css: false`, which empties `?raw` CSS imports, so read the file itself.
const css = readFileSync(resolve(process.cwd(), 'src/features/theme/theme.css'), 'utf8').replace(/\r\n/g, '\n');

const TOKENS = [
  ['--accent', THEMES[0]!.accent],
  ['--accent-hover', THEMES[0]!.accentHover],
  ['--accent-on-light', THEMES[0]!.accentOnLight],
  ['--accent-soft', THEMES[0]!.accentSoft],
  ['--on-accent', THEMES[0]!.onAccent],
] as const;

/** The text inside the braces of `@property <token> { ... }`. */
function propertyBlock(token: string): string {
  const start = css.indexOf(`@property ${token} {`);
  if (start === -1) return '';
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
}

/** The text of the reduced-motion media query, from its brace to the end of the file. */
function motionBlock(): string {
  const start = css.indexOf('@media (prefers-reduced-motion: no-preference)');
  return start === -1 ? '' : css.slice(css.indexOf('{', start) + 1);
}

describe('theme.css', () => {
  it.each(TOKENS)('registers %s as an animatable colour that starts at the green theme', (token, green) => {
    const block = propertyBlock(token);
    expect(block).toContain("syntax: '<color>'");
    expect(block).toContain('inherits: true');
    expect(block).toContain(`initial-value: ${green}`);
  });

  it('transitions every token on the root, only when motion is allowed', () => {
    const motion = motionBlock();
    // Only once the page has painted (data-theme-fade), so loading a stored theme does not fade from green.
    expect(motion).toContain(':root[data-theme-fade]');
    for (const [token] of TOKENS) expect(motion).toContain(`${token} 0.4s`);

    // No transition anywhere before that media query.
    const before = css.slice(0, css.indexOf('@media (prefers-reduced-motion: no-preference)'));
    expect(before.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('transition');
  });
});
