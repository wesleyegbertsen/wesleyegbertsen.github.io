import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from './ThemeProvider.tsx';
import { useTheme } from './ThemeContext.ts';

function Consumer() {
  const { index, theme, cycle, select } = useTheme();
  return (
    <>
      <button type="button" onClick={cycle}>
        {index}:{theme.name}
      </button>
      <button type="button" onClick={() => select(2)}>
        pick blue
      </button>
      <button type="button" onClick={() => select(9)}>
        pick nothing
      </button>
    </>
  );
}

function setup() {
  return render(
    <StrictMode>
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>
    </StrictMode>,
  );
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

describe('ThemeProvider', () => {
  it('starts on green and puts it on the page root', () => {
    setup();
    expect(screen.getByRole('button', { name: /^\d:/ })).toHaveTextContent('0:green');
    expect(document.documentElement.dataset.theme).toBe('green');
  });

  it('starts on the stored theme', () => {
    localStorage.setItem('currentMatrixFontColorIndex', '3');
    setup();
    expect(screen.getByRole('button', { name: /^\d:/ })).toHaveTextContent('3:white');
    expect(document.documentElement.dataset.theme).toBe('white');
  });

  it('ignores an invalid stored value, and the first cycle stores 1', async () => {
    localStorage.setItem('currentMatrixFontColorIndex', '9');
    setup();
    expect(screen.getByRole('button', { name: /^\d:/ })).toHaveTextContent('0:green');

    await userEvent.click(screen.getByRole('button', { name: /^\d:/ }));

    expect(localStorage.getItem('currentMatrixFontColorIndex')).toBe('1');
    expect(screen.getByRole('button', { name: /^\d:/ })).toHaveTextContent('1:red');
    expect(document.documentElement.dataset.theme).toBe('red');
  });

  it('wraps around after the last theme', async () => {
    localStorage.setItem('currentMatrixFontColorIndex', '3');
    setup();
    await userEvent.click(screen.getByRole('button', { name: /^\d:/ }));
    expect(screen.getByRole('button', { name: /^\d:/ })).toHaveTextContent('0:green');
    expect(localStorage.getItem('currentMatrixFontColorIndex')).toBe('0');
  });
});

describe('select', () => {
  it('sets a theme by index and stores it', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'pick blue' }));
    expect(screen.getByRole('button', { name: /^\d:/ })).toHaveTextContent('2:blue');
    expect(document.documentElement.dataset.theme).toBe('blue');
    expect(localStorage.getItem('currentMatrixFontColorIndex')).toBe('2');
  });

  it('ignores an index that is not a theme', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'pick nothing' }));
    expect(screen.getByRole('button', { name: /^\d:/ })).toHaveTextContent('0:green');
    expect(document.documentElement.dataset.theme).toBe('green');
  });
});

describe('useTheme', () => {
  it('explains itself when used outside a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(/ThemeProvider/);
  });
});
