import { renderHook } from '@testing-library/react';
import { useMatrixRun } from './useMatrixRun.ts';

// Five themes, not today's four: the run has to follow the theme list, not a number copied from it.
vi.mock('../theme/themes.ts', () => ({ THEMES: new Array(5).fill({ name: 'x' }) }));

function setup(index: number, reducedMotion = false) {
  const preview = vi.fn();
  const print = vi.fn();
  const hook = renderHook(() => useMatrixRun({ index, preview, print, reducedMotion }));
  return { ...hook, preview, print };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useMatrixRun', () => {
  it('previews every other theme in turn and then ends the preview, whatever the number of themes', () => {
    const { result, preview } = setup(4);
    result.current.start();
    vi.advanceTimersByTime(5000);
    expect(preview.mock.calls).toEqual([[0], [1], [2], [3], [null]]);
  });

  it('never stores anything: it only previews', () => {
    const { result } = setup(2);
    result.current.start();
    vi.advanceTimersByTime(5000);
    expect(localStorage.getItem('currentMatrixFontColorIndex')).toBeNull();
  });

  it('prints twelve lines of rain', () => {
    const { result, print } = setup(0);
    result.current.start();
    vi.advanceTimersByTime(5000);
    expect(print).toHaveBeenCalledTimes(12);
  });

  it('cancel stops the rain and the colours, and ends the preview', () => {
    const { result, preview, print } = setup(0);
    result.current.start();
    vi.advanceTimersByTime(450);
    preview.mockClear();
    const printed = print.mock.calls.length;

    result.current.cancel();
    vi.advanceTimersByTime(5000);

    expect(preview.mock.calls).toEqual([[null]]);
    expect(print).toHaveBeenCalledTimes(printed);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancel with no run going does nothing', () => {
    const { result, preview } = setup(0);
    result.current.cancel();
    expect(preview).not.toHaveBeenCalled();
  });

  it('leaving the page mid-run ends the preview and clears the timers', () => {
    const { result, preview, unmount } = setup(0);
    result.current.start();
    vi.advanceTimersByTime(450);
    preview.mockClear();

    unmount();

    expect(preview.mock.calls).toEqual([[null]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('with reduced motion prints at once and previews nothing', () => {
    const { result, preview, print } = setup(0, true);
    result.current.start();
    expect(print).toHaveBeenCalledTimes(12);
    vi.advanceTimersByTime(5000);
    expect(preview).not.toHaveBeenCalled();
  });

  it('a second run while one is going starts over from the visitor theme', () => {
    const { result, preview } = setup(1);
    result.current.start();
    vi.advanceTimersByTime(450);
    preview.mockClear();

    result.current.start();
    vi.advanceTimersByTime(5000);

    expect(preview.mock.calls).toEqual([[2], [3], [4], [0], [null]]);
  });
});
