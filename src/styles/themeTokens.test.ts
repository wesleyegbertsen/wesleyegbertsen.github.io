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

  it('leaves the GitHub and LinkedIn brand hovers alone', () => {
    const css = read('src/components/SocialBar.module.css');
    expect(css).toContain('#0073b1');
    expect(css).toContain('#6e5494');
  });
});
