import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from './ThemeProvider.tsx';
import { useTheme } from './ThemeContext.ts';

function Consumer() {
  const { index, theme, cycle, select, preview } = useTheme();
  return (
    <>
      <button type="button" onClick={cycle}>
        {index}:{theme.name}
      </button>
      <button type="button" onClick={() => preview(3)}>
        preview white
      </button>
      <button type="button" onClick={() => preview(9)}>
        preview nothing
      </button>
      <button type="button" onClick={() => preview(null)}>
        preview end
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

describe('preview', () => {
  const shown = () => screen.getByRole('button', { name: /^\d:/ });

  it('shows a theme on the page without storing it, and preview(null) puts the stored one back', async () => {
    localStorage.setItem('currentMatrixFontColorIndex', '1');
    setup();

    await userEvent.click(screen.getByRole('button', { name: 'preview white' }));
    expect(shown()).toHaveTextContent('3:white');
    expect(document.documentElement.dataset.theme).toBe('white');
    expect(localStorage.getItem('currentMatrixFontColorIndex')).toBe('1');

    await userEvent.click(screen.getByRole('button', { name: 'preview end' }));
    expect(shown()).toHaveTextContent('1:red');
    expect(document.documentElement.dataset.theme).toBe('red');
    expect(localStorage.getItem('currentMatrixFontColorIndex')).toBe('1');
  });

  it('ignores an index that is not a theme', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'preview nothing' }));
    expect(shown()).toHaveTextContent('0:green');
  });

  it('is replaced by a real choice: select ends the preview and stores the pick', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'preview white' }));
    await userEvent.click(screen.getByRole('button', { name: 'pick blue' }));
    expect(shown()).toHaveTextContent('2:blue');
    expect(localStorage.getItem('currentMatrixFontColorIndex')).toBe('2');
  });

  it('is replaced by a real choice: cycle moves on from the stored theme, not the previewed one', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'preview white' }));
    await userEvent.click(shown());
    expect(shown()).toHaveTextContent('1:red');
    expect(localStorage.getItem('currentMatrixFontColorIndex')).toBe('1');
  });
});

describe('useTheme', () => {
  it('explains itself when used outside a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(/ThemeProvider/);
  });
});
