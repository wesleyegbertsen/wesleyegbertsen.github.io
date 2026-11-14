import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Vitest runs with `css: false`, which empties `?raw` CSS imports, so read the files themselves.
const MODULES = [
  'src/components/SiteMenu.module.css',
  'src/components/ProjectCard.module.css',
  'src/components/SkillsChips.module.css',
  'src/components/ExperienceTimeline.module.css',
  'src/components/Panel.module.css',
  'src/components/SocialBar.module.css',
  'src/pages/ProjectsPage.module.css',
];

/** Hard-coded accent colours from before the theme: none may be left in a themed module. */
const OLD_ACCENTS = [
  '#a4e200',
  '164, 226, 0',
  '#c2f53a',
  '#1c2b00',
  '#e8f5c8',
  '#2f4a00',
  '#20b2aa',
  '#20807a',
  '#ffb400',
];

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8').toLowerCase();

describe('themed CSS modules', () => {
  it.each(MODULES)('%s reads the theme tokens and no old accent colour', (path) => {
    const css = read(path);
    expect(css).toContain('var(--');
    for (const colour of OLD_ACCENTS) expect(css).not.toContain(colour);
  });

  it('draws the panel focus ring in the bright accent, which reads on the dark page around the panel', () => {
    const css = read('src/components/Panel.module.css');
    const block = css.slice(css.indexOf('.panel:focus-visible'), css.indexOf('}', css.indexOf('.panel:focus-visible')));
    expect(block).toContain('var(--accent)');
    expect(block).not.toContain('--accent-on-light');
  });

  it('gives the mobile Menu button a fill dark enough to read over the rain', () => {
    const css = read('src/components/SiteMenu.module.css');
    const start = css.indexOf('.toggle {');
    const block = css.slice(start, css.indexOf('}', start));
    const alpha = Number(block.match(/background:\s*rgba\(0, 0, 0, ([0-9.]+)\)/)?.[1]);
    expect(alpha).toBeGreaterThanOrEqual(0.8);
  });

  it('keeps one hover rule for the three bottom bar icons that follow the theme', () => {
    const css = read('src/components/SocialBar.module.css');
    expect(css.match(/color: var\(--accent\)/g)).toHaveLength(1);
  });

  it('leaves the GitHub and LinkedIn brand hovers alone', () => {
    const css = read('src/components/SocialBar.module.css');
    expect(css).toContain('#0073b1');
    expect(css).toContain('#6e5494');
  });
});
