import { act, renderHook } from '@testing-library/react';
import { FakeAudio, installFakeAudio } from '../test/fakeAudio.ts';
import { useAudio } from './useAudio.ts';

beforeEach(installFakeAudio);
afterEach(() => vi.unstubAllGlobals());

describe('useAudio', () => {
  it('plays a new instance with volume and start offset', () => {
    const { result } = renderHook(() => useAudio('a.mp3', { volume: 0.3, startAt: 0.5 }));
    act(() => result.current.play());
    const [audio] = FakeAudio.instances;
    expect(audio?.src).toBe('a.mp3');
    expect(audio?.volume).toBe(0.3);
    expect(audio?.currentTime).toBe(0.5);
    expect(audio?.play).toHaveBeenCalledOnce();
  });

  it('pauses and rewinds the previous instance on restart', () => {
    const { result } = renderHook(() => useAudio('a.mp3'));
    act(() => result.current.play());
    const first = FakeAudio.instances[0]!;
    first.currentTime = 4;
    act(() => result.current.play());
    expect(first.pause).toHaveBeenCalled();
    expect(first.currentTime).toBe(0);
    expect(FakeAudio.instances).toHaveLength(2);
  });

  it('stop pauses the current clip', () => {
    const { result } = renderHook(() => useAudio('a.mp3'));
    act(() => result.current.play());
    act(() => result.current.stop());
    expect(FakeAudio.instances[0]?.pause).toHaveBeenCalled();
  });

  it('calls the latest onEnded when the clip ends', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ cb }) => useAudio('a.mp3', { onEnded: cb }), {
      initialProps: { cb: first },
    });
    act(() => result.current.play());
    rerender({ cb: second });
    act(() => FakeAudio.instances[0]!.end());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('pauses on unmount', () => {
    const { result, unmount } = renderHook(() => useAudio('a.mp3'));
    act(() => result.current.play());
    unmount();
    expect(FakeAudio.instances[0]?.pause).toHaveBeenCalled();
  });

  it('does not throw when play() is rejected', async () => {
    const { result } = renderHook(() => useAudio('a.mp3'));
    vi.stubGlobal(
      'Audio',
      class extends FakeAudio {
        override play = vi.fn(() => Promise.reject(new Error('blocked')));
      },
    );
    expect(() => act(() => result.current.play())).not.toThrow();
    await Promise.resolve();
  });
});
