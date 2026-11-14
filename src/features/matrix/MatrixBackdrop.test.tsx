import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { MatrixBackdrop } from './MatrixBackdrop.tsx';

const KEY = 'currentMatrixFontColorIndex';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

function canvas() {
  return document.querySelector('canvas')!;
}

describe('MatrixBackdrop', () => {
  it('cycles the colour on click and persists it', async () => {
    const user = userEvent.setup();
    render(<MatrixBackdrop />);

    await user.click(canvas());
    expect(localStorage.getItem(KEY)).toBe('1');
    await user.click(canvas());
    expect(localStorage.getItem(KEY)).toBe('2');
  });

  it('wraps around after the last colour', async () => {
    localStorage.setItem(KEY, '3');
    const user = userEvent.setup();
    render(<MatrixBackdrop />);

    await user.click(canvas());
    expect(localStorage.getItem(KEY)).toBe('0');
  });

  it('also cycles from the keyboard button', async () => {
    const user = userEvent.setup();
    render(<MatrixBackdrop />);

    await user.click(screen.getByRole('button', { name: 'Change background colour' }));
    expect(localStorage.getItem(KEY)).toBe('1');
  });

  it('is hidden from assistive technology', () => {
    render(<MatrixBackdrop />);
    expect(canvas()).toHaveAttribute('aria-hidden', 'true');
  });
});
