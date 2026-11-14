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
      screen.getByText('Full-stack .NET & Azure developer · I also build open-source apps'),
    ).toBeInTheDocument();
  });

  it('has no logo and no Pikachu', () => {
    setup();
    expect(screen.queryByRole('img', { name: /logo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pikachu' })).not.toBeInTheDocument();
  });

  it('keeps the name, intro and featured project in one container, apart from the Poké Balls', () => {
    setup();
    const h1 = screen.getByRole('heading', { level: 1 });
    const subline = screen.getByText(/Full-stack \.NET/);
    const region = screen.getByRole('region', { name: projects[0]!.name });
    expect(follows(h1, subline)).toBe(true);
    expect(follows(subline, region)).toBe(true);

    const container = h1.parentElement!;
    expect(container).toContainElement(subline);
    expect(container).toContainElement(region);
    expect(within(container).queryByRole('button', { name: /Poké Ball/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Poké Ball \d/ })).toHaveLength(4);
  });

  it('draws a glass panel like the Projects page, with no card image', () => {
    const css = readCss('src/pages/HomePage.module.css');
    expect(css).not.toContain('bg.png');
    expect(css).toContain("composes: glass from './ProjectsPage.module.css'");
    // One shared look: the monospace font comes from the shared glass, not from the home page alone.
    expect(css).not.toContain('font-family');
    expect(css).not.toContain('.stage');
    expect(readCss('src/pages/ProjectsPage.module.css')).toContain('monospace');
  });

  it('has no contact button, the mail icon lives in the social bar', () => {
    setup();
    expect(screen.queryByRole('link', { name: /get in touch/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /get in touch/i })).not.toBeInTheDocument();
  });
});
