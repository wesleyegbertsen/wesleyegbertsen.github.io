import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { profile } from '../../data/profile.ts';
import { ThemeProvider } from '../theme/ThemeProvider.tsx';
import { SessionProvider } from './SessionProvider.tsx';
import { Terminal } from './Terminal.tsx';

function Harness() {
  const [shown, setShown] = useState(true);
  return (
    <>
      {shown && <Terminal />}
      <button type="button" onClick={() => setShown(false)}>
        leave page
      </button>
      <button type="button" onClick={() => setShown(true)}>
        return to page
      </button>
    </>
  );
}

function mockMedia({ reduced = true, coarse = false } = {}) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches: (reduced && query.includes('prefers-reduced-motion')) || (coarse && query.includes('pointer')),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

async function startGame(options?: Parameters<typeof mockMedia>[0]) {
  mockMedia(options);
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/terminal']}>
      <ThemeProvider>
        <SessionProvider>
          <Harness />
        </SessionProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  await user.type(screen.getByRole('textbox', { name: 'Command' }), 'whoami{Enter}');
  await user.type(screen.getByRole('textbox', { name: 'Command' }), 'play{Enter}');
  return { user, game: screen.getByRole('application') };
}

/** Past the title and the intro: on the map, free to walk. */
async function walkAbout(options?: Parameters<typeof mockMedia>[0]) {
  const started = await startGame(options);
  for (let i = 0; i < 12 && (i === 0 || started.game.dataset.dialogue === 'true'); i++) await started.user.keyboard('z');
  expect(started.game).toHaveAttribute('data-dialogue', 'false');
  return started;
}

const at = (game: HTMLElement) => `${game.dataset.x},${game.dataset.y}`;

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

describe('the adventure in the terminal', () => {
  it('replaces the log and the prompt with the game, which gets focus, on its title screen', async () => {
    const { game } = await startGame();
    expect(screen.queryByRole('textbox', { name: 'Command' })).toBeNull();
    expect(screen.queryByRole('log')).toBeNull();
    expect(game).toHaveFocus();
    expect(game).toHaveAttribute('data-scene', 'title');
  });

  it('draws on a 160 x 144 canvas that is hidden from assistive technology', async () => {
    const { game } = await startGame();
    const canvas = game.querySelector('canvas')!;
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    expect(canvas).toHaveAttribute('width', '160');
    expect(canvas).toHaveAttribute('height', '144');
    expect(game.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('tells the story through the live region, from the data', async () => {
    const { game, user } = await startGame();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('');
    await user.keyboard('z');
    expect(game).toHaveAttribute('data-scene', 'world');
    expect(status).toHaveTextContent(`Welcome to Career Town! Here, ${profile.name.split(' ')[0]}'s career is a place to explore.`);
    await user.keyboard('z');
    expect(status).toHaveTextContent(/Every building is a chapter/);
  });

  it('walks with the arrow keys without letting them scroll the page, while Tab is left alone', async () => {
    const { game } = await walkAbout();
    const before = at(game);
    const up = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    act(() => {
      game.dispatchEvent(up);
    });
    expect(up.defaultPrevented).toBe(true);
    expect(at(game)).not.toBe(before);

    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    act(() => {
      game.dispatchEvent(space);
    });
    expect(space.defaultPrevented).toBe(true);

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => {
      game.dispatchEvent(tab);
    });
    expect(tab.defaultPrevented).toBe(false);
  });

  it('leaves with Escape: the shell is back with the command line focused and the scrollback intact', async () => {
    const { user } = await startGame();
    await user.keyboard('{Escape}');
    const input = screen.getByRole('textbox', { name: 'Command' });
    expect(input).toHaveFocus();
    const log = screen.getByRole('log');
    expect(log).toHaveTextContent('whoami');
    expect(log).toHaveTextContent("Left the game. Type 'play' to carry on.");
  });

  it('leaves with q too, and with the Leave button', async () => {
    const { user } = await startGame();
    await user.keyboard('q');
    expect(screen.getByRole('textbox', { name: 'Command' })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Command' }), 'play{Enter}');
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    expect(screen.getByRole('textbox', { name: 'Command' })).toBeInTheDocument();
  });

  it('skips to the career as text', async () => {
    const { user } = await startGame();
    await user.click(screen.getByRole('button', { name: 'Skip to text' }));
    const log = screen.getByRole('log');
    expect(log).toHaveTextContent('Betabit');
    expect(log).toHaveTextContent('Contact');
    expect(screen.getByRole('textbox', { name: 'Command' })).toHaveFocus();
  });

  it('shows the keyboard list and no on-screen buttons on a fine pointer', async () => {
    await startGame({ coarse: false });
    for (const name of ['Up', 'Down', 'Left', 'Right', 'A', 'B', 'Start', 'Select', 'Sound']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.getByText('Arrows or WASD')).toBeInTheDocument();
  });

  it('shows the D-pad, A, B, Start and Select on a coarse pointer, and they play the game', async () => {
    const { game } = await startGame({ coarse: true });
    for (const name of ['Up', 'Down', 'Left', 'Right', 'A', 'B', 'Start', 'Select']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.queryByText('Arrows or WASD')).toBeNull();
    const a = screen.getByRole('button', { name: 'A' });
    fireEvent.pointerDown(a);
    for (let i = 0; i < 12 && game.dataset.dialogue === 'true'; i++) fireEvent.pointerDown(a);
    const before = at(game);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Up' }));
    expect(at(game)).not.toBe(before);
  });

  it('resumes where it was after a visit to another page', async () => {
    const { user, game } = await walkAbout();
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowLeft}');
    const place = at(game);
    await user.click(screen.getByRole('button', { name: 'leave page' }));
    expect(screen.queryByRole('application')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'return to page' }));
    const back = screen.getByRole('application');
    expect(at(back)).toBe(place);
    expect(back).toHaveAttribute('data-scene', 'world');
    expect(back).toHaveAttribute('data-dir', 'left');
  });

  it('picks the game up after leaving it with Escape', async () => {
    const { user, game } = await walkAbout();
    await user.keyboard('{ArrowUp}');
    const place = at(game);
    await user.keyboard('{Escape}');
    await user.type(screen.getByRole('textbox', { name: 'Command' }), 'play{Enter}');
    expect(at(screen.getByRole('application'))).toBe(place);
  });

  it('never writes to localStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { user } = await walkAbout();
    await user.keyboard('{ArrowUp}{ArrowUp}pxm');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('opens with the sound on and plays the title tune, then the tune of the town', async () => {
    const { game, user } = await startGame();
    expect(game).toHaveAttribute('data-sound', 'on');
    expect(game).toHaveAttribute('data-music', 'title');
    await user.keyboard('z');
    expect(game).toHaveAttribute('data-music', 'town');
  });

  it('remembers that the sound is off after leaving the game and after a visit to another page', async () => {
    const { game, user } = await walkAbout();
    await user.keyboard('m');
    expect(game).toHaveAttribute('data-sound', 'off');
    await user.keyboard('{Escape}');
    await user.type(screen.getByRole('textbox', { name: 'Command' }), 'play{Enter}');
    expect(screen.getByRole('application')).toHaveAttribute('data-sound', 'off');

    await user.click(screen.getByRole('button', { name: 'leave page' }));
    await user.click(screen.getByRole('button', { name: 'return to page' }));
    const back = screen.getByRole('application');
    expect(back).toHaveAttribute('data-sound', 'off');
    back.focus();
    await user.keyboard('m');
    expect(back).toHaveAttribute('data-sound', 'on');
    expect(screen.getByRole('status')).toHaveTextContent('Sound on');
  });

  it('has the Sound button on a coarse pointer only', async () => {
    await startGame({ coarse: true });
    expect(screen.getByRole('button', { name: 'Sound' })).toBeInTheDocument();
  });

  it('play skip prints the career from the shell without starting the game', async () => {
    mockMedia();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ThemeProvider>
          <SessionProvider>
            <Terminal />
          </SessionProvider>
        </ThemeProvider>
      </MemoryRouter>,
    );
    await user.type(screen.getByRole('textbox', { name: 'Command' }), 'play skip{Enter}');
    expect(screen.getByRole('log')).toHaveTextContent('Betabit');
    expect(screen.queryByRole('application')).toBeNull();
  });
});
