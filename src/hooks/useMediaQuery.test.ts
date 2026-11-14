import { act, renderHook } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery.ts';

function mockMatchMedia(initial: boolean) {
  let listener: (() => void) | undefined;
  const state = { matches: initial };
  const removeEventListener = vi.fn();
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        get matches() {
          return state.matches;
        },
        media: query,
        addEventListener: (_: string, fn: () => void) => {
          listener = fn;
        },
        removeEventListener,
      }) as unknown as MediaQueryList,
  );
  return {
    removeEventListener,
    set(next: boolean) {
      state.matches = next;
      listener?.();
    },
  };
}

describe('useMediaQuery', () => {
  it('returns whether the query matches', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery('(max-width: 700px)'));
    expect(result.current).toBe(true);
  });

  it('updates when the match changes', () => {
    const media = mockMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(max-width: 700px)'));
    expect(result.current).toBe(false);
    act(() => media.set(true));
    expect(result.current).toBe(true);
  });

  it('stops listening on unmount', () => {
    const media = mockMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 700px)'));
    unmount();
    expect(media.removeEventListener).toHaveBeenCalled();
  });
});
