import { useState } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '../theme/ThemeProvider.tsx';
import { SessionProvider } from './SessionProvider.tsx';
import { Terminal } from './Terminal.tsx';

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function Harness() {
  const [shown, setShown] = useState(true);
  return (
    <>
      {shown && <Terminal />}
      <button type="button" onClick={() => setShown(false)}>
        leave
      </button>
      <button type="button" onClick={() => setShown(true)}>
        return
      </button>
    </>
  );
}

function mockReducedMotion(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches: reduce && query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

function setup() {
  render(
    <MemoryRouter initialEntries={['/terminal']}>
      <ThemeProvider>
        <SessionProvider>
          <Harness />
          <Where />
        </SessionProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
  return {
    input: screen.getByRole('textbox', { name: 'Command' }),
    log: screen.getByRole('log', { name: 'Terminal output' }),
  };
}

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

describe('Terminal', () => {
  it('welcomes the visitor and focuses the input on load', () => {
    const { input, log } = setup();
    expect(input).toHaveFocus();
    expect(log).toHaveTextContent("Type 'help'");
  });

  it('puts the output in a polite live region', () => {
    const { log } = setup();
    expect(log).toHaveAttribute('aria-live', 'polite');
  });

  it('runs a command on Enter, echoes it with the prompt, and empties the input', async () => {
    const { input, log } = setup();
    await userEvent.type(input, 'whoami{Enter}');
    expect(log).toHaveTextContent('guest@wesleyegbertsen:~$ whoami');
    expect(log).toHaveTextContent(/whoami\s*guest/);
    expect(input).toHaveValue('');
  });

  it('shows the help text', async () => {
    const { input, log } = setup();
    await userEvent.type(input, 'help{Enter}');
    expect(log).toHaveTextContent('about');
    expect(log).toHaveTextContent('neofetch');
  });

  it('follows cd in the prompt', async () => {
    const { input } = setup();
    await userEvent.type(input, 'cd projects{Enter}');
    expect(screen.getAllByText('guest@wesleyegbertsen:~/projects$').length).toBeGreaterThan(0);
  });

  it('keeps the output, the folder and the history when you leave and come back', async () => {
    const { input } = setup();
    await userEvent.type(input, 'cd projects{Enter}whoami{Enter}');

    await userEvent.click(screen.getByRole('button', { name: 'leave' }));
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'return' }));

    const log = screen.getByRole('log', { name: 'Terminal output' });
    expect(log).toHaveTextContent('whoami');
    expect(log).toHaveTextContent('guest');
    expect(screen.getAllByText('guest@wesleyegbertsen:~/projects$').length).toBeGreaterThan(0);
    // The history is kept too: Up brings back the last command.
    const back = screen.getByRole('textbox', { name: 'Command' });
    await userEvent.type(back, '{ArrowUp}');
    expect(back).toHaveValue('whoami');
  });

  it('clearing the screen is kept too', async () => {
    const { input } = setup();
    await userEvent.type(input, 'whoami{Enter}clear{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'leave' }));
    await userEvent.click(screen.getByRole('button', { name: 'return' }));
    expect(screen.getByRole('log', { name: 'Terminal output' })).toBeEmptyDOMElement();
  });

  it('focuses the input again when the output is clicked', async () => {
    const { input, log } = setup();
    screen.getByRole('button', { name: 'leave' }).focus();
    expect(input).not.toHaveFocus();
    await userEvent.click(log);
    expect(input).toHaveFocus();
  });

  it('recalls earlier commands with Up and brings back the draft with Down', async () => {
    const { input } = setup();
    await userEvent.type(input, 'whoami{Enter}');
    await userEvent.type(input, 'echo two{Enter}');
    await userEvent.type(input, 'dra');
    await userEvent.keyboard('{ArrowUp}');
    expect(input).toHaveValue('echo two');
    await userEvent.keyboard('{ArrowUp}');
    expect(input).toHaveValue('whoami');
    await userEvent.keyboard('{ArrowUp}');
    expect(input).toHaveValue('whoami');
    await userEvent.keyboard('{ArrowDown}');
    expect(input).toHaveValue('echo two');
    await userEvent.keyboard('{ArrowDown}');
    expect(input).toHaveValue('dra');
  });

  it('Up does nothing with an empty history', async () => {
    const { input } = setup();
    await userEvent.type(input, 'abc{ArrowUp}');
    expect(input).toHaveValue('abc');
  });

  it('Tab completes a path', async () => {
    const { input } = setup();
    await userEvent.type(input, 'cat ab{Tab}');
    expect(input).toHaveValue('cat about.txt ');
    expect(input).toHaveFocus();
  });

  it('Tab prints the candidates when several match', async () => {
    const { input, log } = setup();
    await userEvent.type(input, 'c{Tab}');
    // The text matcher collapses runs of spaces.
    expect(log).toHaveTextContent('cat cd clear contact cowsay');
    expect(input).toHaveValue('c');
  });

  it('Tab on an empty input is not intercepted, so keyboard focus can leave', () => {
    const { input } = setup();
    const notPrevented = fireEvent.keyDown(input, { key: 'Tab' });
    expect(notPrevented).toBe(true);
  });

  it('Tab on a typed line is intercepted', () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: 'he' } });
    expect(fireEvent.keyDown(input, { key: 'Tab' })).toBe(false);
  });

  it('Ctrl+L clears the output without leaving the page', async () => {
    const { input, log } = setup();
    await userEvent.type(input, 'whoami{Enter}');
    expect(log).toHaveTextContent('guest');
    const notPrevented = fireEvent.keyDown(input, { key: 'l', ctrlKey: true });
    expect(notPrevented).toBe(false);
    expect(log).toBeEmptyDOMElement();
  });

  it('the clear command empties the output too', async () => {
    const { input, log } = setup();
    await userEvent.type(input, 'whoami{Enter}clear{Enter}');
    expect(log).toBeEmptyDOMElement();
  });

  it('open moves the router', async () => {
    const { input } = setup();
    await userEvent.type(input, 'open projects{Enter}');
    expect(screen.getByTestId('where')).toHaveTextContent('/projects');
  });

  it('theme sets the site theme', async () => {
    const { input } = setup();
    await userEvent.type(input, 'theme blue{Enter}');
    expect(document.documentElement.dataset.theme).toBe('blue');
  });
});

describe('Terminal matrix', () => {
  it('prints rain over time, visits other themes and ends on the visitor theme', async () => {
    mockReducedMotion(false);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { input, log } = setup();
    await user.type(input, 'matrix{Enter}');
    expect(log).toHaveTextContent('Wake up, guest');
    expect(document.documentElement.dataset.theme).toBe('green');
    expect(log.querySelectorAll('[data-kind="rain"]').length).toBeLessThan(12);

    act(() => void vi.advanceTimersByTime(450));
    expect(document.documentElement.dataset.theme).toBe('red');

    act(() => void vi.advanceTimersByTime(2000));
    expect(log.querySelectorAll('[data-kind="rain"]')).toHaveLength(12);
    expect(document.documentElement.dataset.theme).toBe('green');
    expect(localStorage.getItem('currentMatrixFontColorIndex')).toBe('0');
  });

  it('prints at once and keeps the colour when the visitor prefers reduced motion', async () => {
    mockReducedMotion(true);
    const { input, log } = setup();
    await userEvent.type(input, 'matrix{Enter}');
    expect(log.querySelectorAll('[data-kind="rain"]')).toHaveLength(12);
    expect(document.documentElement.dataset.theme).toBe('green');
  });

  it('keeps the rain out of the screen reader output', async () => {
    mockReducedMotion(true);
    const { input, log } = setup();
    await userEvent.type(input, 'matrix{Enter}');
    for (const line of log.querySelectorAll('[data-kind="rain"]')) {
      expect(line).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('a theme command during the run takes over', async () => {
    mockReducedMotion(false);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { input } = setup();
    await user.type(input, 'matrix{Enter}');
    await user.type(input, 'theme blue{Enter}');
    act(() => void vi.advanceTimersByTime(3000));
    expect(document.documentElement.dataset.theme).toBe('blue');
  });

  it('leaving mid-run stops the timers and gives the visitor their theme back', async () => {
    mockReducedMotion(false);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { input } = setup();
    await user.type(input, 'matrix{Enter}');
    act(() => void vi.advanceTimersByTime(450));
    expect(document.documentElement.dataset.theme).toBe('red');

    await user.click(screen.getByRole('button', { name: 'leave' }));

    expect(document.documentElement.dataset.theme).toBe('green');
    expect(vi.getTimerCount()).toBe(0);
  });
});
