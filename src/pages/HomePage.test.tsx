import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { projects } from '../data/projects.ts';
import { HomePage } from './HomePage.tsx';

function setup() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('HomePage intro', () => {
  it('has one visible heading with the name', () => {
    setup();
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Wesley Egbertsen');
    expect(headings[0]!.className).not.toMatch(/visuallyHidden/);
  });

  it('says what Wesley does', () => {
    setup();
    expect(
      screen.getByText('Full-stack .NET & Azure developer · I also build open-source apps'),
    ).toBeInTheDocument();
  });

  it('puts the intro under the logo and above Pikachu', () => {
    setup();
    const logo = screen.getByRole('button', { name: 'Wesley Egbertsen logo' });
    const h1 = screen.getByRole('heading', { level: 1 });
    const subline = screen.getByText(/Full-stack \.NET/);
    const pikachu = screen.getByRole('button', { name: 'Pikachu' });
    expect(follows(logo, h1)).toBe(true);
    expect(follows(h1, subline)).toBe(true);
    expect(follows(subline, pikachu)).toBe(true);
  });

  it('puts the featured project after Pikachu', () => {
    setup();
    const pikachu = screen.getByRole('button', { name: 'Pikachu' });
    const region = screen.getByRole('region', { name: projects[0]!.name });
    expect(follows(pikachu, region)).toBe(true);
  });

  it('has no contact button, the mail icon lives in the social bar', () => {
    setup();
    expect(screen.queryByRole('link', { name: /get in touch/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /get in touch/i })).not.toBeInTheDocument();
  });
});
