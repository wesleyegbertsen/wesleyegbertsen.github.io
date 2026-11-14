import { projects } from './projects.ts';

describe('projects', () => {
  it('has at least one project with unique ids', () => {
    expect(projects.length).toBeGreaterThan(0);
    expect(new Set(projects.map((p) => p.id)).size).toBe(projects.length);
  });

  it('is sorted newest first', () => {
    const published = projects.map((p) => p.published);
    expect(published).toEqual([...published].sort().reverse());
    for (const value of published) expect(value).toMatch(/^\d{4}-\d{2}$/);
  });

  it('gives each project 2-4 screenshots with unique, non-empty alt text', () => {
    for (const project of projects) {
      expect(project.screenshots.length).toBeGreaterThanOrEqual(2);
      expect(project.screenshots.length).toBeLessThanOrEqual(4);
      const alts = project.screenshots.map((s) => s.alt);
      for (const alt of alts) expect(alt.trim()).not.toBe('');
      expect(new Set(alts).size).toBe(alts.length);
      for (const shot of project.screenshots) {
        expect(shot.src).toBeTruthy();
        expect(shot.width).toBeGreaterThan(0);
        expect(shot.height).toBeGreaterThan(0);
      }
    }
  });

  it('links over https', () => {
    for (const project of projects) {
      expect(project.links.live).toMatch(/^https:\/\//);
      expect(project.links.github).toMatch(/^https:\/\//);
      for (const extra of project.links.extras ?? []) expect(extra.href).toMatch(/^https:\/\//);
    }
  });

  it('lists CardiPaw first, with its live site, repository, Android and Docker links', () => {
    const [first] = projects;
    expect(first?.id).toBe('cardipaw');
    expect(first?.links.live).toBe('https://cardipaw.com/');
    expect(first?.links.github).toBe('https://github.com/wesleyegbertsen/CardiPaw');
    expect(first?.links.extras).toEqual([
      { label: 'Android APK', href: 'https://github.com/wesleyegbertsen/CardiPaw/releases/latest' },
      { label: 'Docker image', href: 'https://hub.docker.com/r/wesleyegbertsen/cardipaw' },
    ]);
  });
});
