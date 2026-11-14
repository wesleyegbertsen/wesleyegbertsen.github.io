import { MemoryRouter } from 'react-router';
import { render, screen } from '@testing-library/react';
import { SocialBar } from '../components/SocialBar.tsx';
import { HomePage } from '../pages/HomePage.tsx';
import { installFakeAudio } from '../test/fakeAudio.ts';

// The home page, the social bar and the terminal all say who I am. They read one file, `profile.ts`, so
// these tests swap that file for other values and check the pages follow, which a literal would not.
vi.mock('./profile.ts', () => ({
  profile: {
    name: 'Test Person',
    role: 'Test Role',
    tagline: 'a test tagline',
    links: {
      github: 'https://example.test/gh',
      email: 'test@example.test',
      linkedin: 'https://example.test/in',
    },
  },
}));

beforeEach(installFakeAudio);
afterEach(() => vi.unstubAllGlobals());

describe('profile', () => {
  it('is what the home page shows: the name and the role line', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('Test Person');
    // The matcher folds the no-break space into a plain one, so check it on the text itself: it keeps the dot on the first line.
    const subline = screen.getByText('Test Role · a test tagline');
    expect(subline.textContent).toBe('Test Role · a test tagline');
  });

  it('is what the social bar links to', () => {
    render(<SocialBar />);
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://example.test/gh');
    expect(screen.getByRole('link', { name: 'Email Wesley' })).toHaveAttribute('href', 'mailto:test@example.test');
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute('href', 'https://example.test/in');
  });
});
