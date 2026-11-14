import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter } from 'react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installFakeAudio } from '../test/fakeAudio.ts';
import { projects } from '../data/projects.ts';
import { HomePage } from './HomePage.tsx';

beforeEach(installFakeAudio);
afterEach(() => vi.unstubAllGlobals());

function setup() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const cat = () => screen.getByRole('button', { name: 'Cat', hidden: true });
const readCss = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('HomePage intro', () => {
  it('has one visible heading with the name, holding the cat button', () => {
    setup();
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveAccessibleName('Wesley Egbertsen');
    const toggle = within(headings[0]!).getByRole('button', { name: 'Wesley Egbertsen' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('summons the cat with a click, Enter and Space on the name', async () => {
    const user = userEvent.setup();
    setup();
    const toggle = screen.getByRole('button', { name: 'Wesley Egbertsen' });

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(cat()).toHaveAttribute('data-visible', 'true');

    toggle.focus();
    await user.keyboard('{Enter}');
    expect(cat()).toHaveAttribute('data-visible', 'false');
    await user.keyboard(' ');
    expect(cat()).toHaveAttribute('data-visible', 'true');
  });

  it('does not hide the name with CSS', () => {
    // Vitest runs with `css: false`, so a class-name check proves nothing; read the stylesheet instead.
    const css = readCss('src/pages/HomePage.module.css');
    const block = css.slice(css.indexOf('.name {'), css.indexOf('}', css.indexOf('.name {')));
    expect(block).toContain('.name');
    expect(block).not.toMatch(/clip-path|display:\s*none|visibility:\s*hidden|width:\s*1px/);
    expect(css).not.toContain('visuallyHidden');
  });

  it('says what Wesley does', () => {
    setup();
    expect(
      screen.getByText('Full-stack Azure .NET Developer · I also build open-source apps'),
    ).toBeInTheDocument();
  });

  it('has no logo and no Pikachu', () => {
    setup();
    expect(screen.queryByRole('img', { name: /logo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pikachu' })).not.toBeInTheDocument();
  });

  it('keeps the name, intro and featured project in one container, and the four Poké Balls in one glass container', () => {
    setup();
    const h1 = screen.getByRole('heading', { level: 1 });
    const subline = screen.getByText(/Full-stack Azure \.NET Developer/);
    const region = screen.getByRole('region', { name: projects[0]!.name });
    expect(follows(h1, subline)).toBe(true);
    expect(follows(subline, region)).toBe(true);

    const container = h1.parentElement!;
    expect(container).toContainElement(subline);
    expect(container).toContainElement(region);
    expect(within(container).getAllByRole('button', { name: /Poké Ball \d/ })).toHaveLength(4);
    expect(screen.getAllByRole('button', { name: /Poké Ball \d/ })).toHaveLength(4);
  });

  it('puts the Poké Balls after the name button and the project link in tab order', () => {
    setup();
    const name = screen.getByRole('button', { name: 'Wesley Egbertsen' });
    const link = screen.getByRole('link', { name: 'View projects' });
    for (const ball of screen.getAllByRole('button', { name: /Poké Ball \d/ })) {
      expect(follows(name, ball)).toBe(true);
      expect(follows(link, ball)).toBe(true);
    }
  });

  it('draws a glass panel like the Projects page, with no card image', () => {
    const css = readCss('src/pages/HomePage.module.css');
    expect(css).not.toContain('bg.png');
    // Both pages use one plain stylesheet's `.glass-panel`. `composes ... from` another CSS module makes
    // Vite's dev server warn that a PostCSS plugin did not pass the `from` option, so it must not come back.
    expect(css).not.toContain('composes');
    expect(readCss('src/pages/ProjectsPage.module.css')).not.toContain('composes');
    // One shared look: the monospace font comes from the shared glass, not from the home page alone.
    expect(css).not.toContain('font-family');
    expect(css).not.toContain('.stage');
    expect(readCss('src/styles/glass.css')).toContain('monospace');
    for (const page of ['src/pages/HomePage.tsx', 'src/pages/ProjectsPage.tsx']) {
      const source = readCss(page);
      expect(source, `${page} imports the shared glass`).toContain("import '../styles/glass.css'");
      expect(source, `${page} uses the shared glass class`).toContain('glass-panel');
    }
  });

  it('has no contact button, the mail icon lives in the social bar', () => {
    setup();
    expect(screen.queryByRole('link', { name: /get in touch/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /get in touch/i })).not.toBeInTheDocument();
  });
});
