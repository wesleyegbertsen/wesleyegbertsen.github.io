import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const playerX = (game: HTMLElement) => Number(game.dataset.playerX);

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

describe('the platformer in the terminal', () => {
  it('replaces the log and the prompt with the game, which gets focus', async () => {
    const { game } = await startGame();
    expect(screen.queryByRole('textbox', { name: 'Command' })).toBeNull();
    expect(screen.queryByRole('log')).toBeNull();
    expect(game).toHaveFocus();
  });

  it('draws on a canvas that is hidden from assistive technology', async () => {
    const { game } = await startGame();
    const canvas = game.querySelector('canvas')!;
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    expect(game.querySelector('pre')).toBeNull();
  });

  it('moves with the arrow keys and does not let them scroll the page, while Tab is left alone', async () => {
    const { game } = await startGame();
    const before = playerX(game);
    const right = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    act(() => {
      game.dispatchEvent(right);
    });
    expect(right.defaultPrevented).toBe(true);
    expect(playerX(game)).toBeGreaterThan(before);

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

  it('announces an item in the live region, and only events', async () => {
    const { game, user } = await startGame();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('');
    for (let i = 0; i < 12 && !status.textContent; i++) await user.keyboard('{ArrowRight}');
    expect(status).toHaveTextContent('Collected Betabit');
    expect(game).toHaveAttribute('data-collected', '1');
  });

  it('leaves with Escape: the shell is back with the command line focused and the scrollback intact', async () => {
    const { user } = await startGame();
    await user.keyboard('{Escape}');
    const input = screen.getByRole('textbox', { name: 'Command' });
    expect(input).toHaveFocus();
    const log = screen.getByRole('log');
    expect(log).toHaveTextContent('whoami');
    expect(log).toHaveTextContent("Left the run. Type 'play' to carry on.");
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

  it('shows the touch buttons only on a coarse pointer', async () => {
    const { game } = await startGame({ coarse: false });
    expect(game.querySelector('button[class*="padButton"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Jump' })).toBeNull();
  });

  it('shows Left, Right and Jump on a coarse pointer, and Right moves the player', async () => {
    const { game } = await startGame({ coarse: true });
    const before = playerX(game);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Right' }));
    expect(screen.getByRole('button', { name: 'Left' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jump' })).toBeInTheDocument();
    expect(playerX(game)).toBeGreaterThan(before);
  });

  it('resumes where it was after a visit to another page', async () => {
    const { user, game } = await startGame();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    const x = playerX(game);
    expect(x).toBeGreaterThan(3);
    await user.click(screen.getByRole('button', { name: 'leave page' }));
    expect(screen.queryByRole('application')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'return to page' }));
    expect(playerX(screen.getByRole('application'))).toBe(x);
  });

  it('never writes to localStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { user } = await startGame();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(setItem).not.toHaveBeenCalled();
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
