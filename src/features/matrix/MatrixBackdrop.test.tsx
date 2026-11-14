import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { ThemeProvider } from '../theme/ThemeProvider.tsx';
import { MatrixBackdrop } from './MatrixBackdrop.tsx';

const KEY = 'currentMatrixFontColorIndex';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

function renderBackdrop() {
  return render(
    <ThemeProvider>
      <MatrixBackdrop />
    </ThemeProvider>,
  );
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

function canvas() {
  return document.querySelector('canvas')!;
}

describe('MatrixBackdrop', () => {
  it('cycles the colour on click and persists it', async () => {
    const user = userEvent.setup();
    renderBackdrop();

    await user.click(canvas());
    expect(localStorage.getItem(KEY)).toBe('1');
    await user.click(canvas());
    expect(localStorage.getItem(KEY)).toBe('2');
  });

  it('wraps around after the last colour', async () => {
    localStorage.setItem(KEY, '3');
    const user = userEvent.setup();
    renderBackdrop();

    await user.click(canvas());
    expect(localStorage.getItem(KEY)).toBe('0');
  });

  it('also cycles from the keyboard button', async () => {
    const user = userEvent.setup();
    renderBackdrop();

    await user.click(screen.getByRole('button', { name: 'Change background colour' }));
    expect(localStorage.getItem(KEY)).toBe('1');
  });

  it('changes the site theme together with the colour', async () => {
    const user = userEvent.setup();
    renderBackdrop();
    expect(document.documentElement.dataset.theme).toBe('green');

    await user.click(canvas());
    expect(document.documentElement.dataset.theme).toBe('red');
  });

  it('changes the site theme from the keyboard button too', async () => {
    const user = userEvent.setup();
    renderBackdrop();

    await user.click(screen.getByRole('button', { name: 'Change background colour' }));
    expect(document.documentElement.dataset.theme).toBe('red');
  });

  it('is hidden from assistive technology', () => {
    renderBackdrop();
    expect(canvas()).toHaveAttribute('aria-hidden', 'true');
  });
});
