import { act, renderHook } from '@testing-library/react';
import { initialGame } from './engine/engine.ts';
import { play, testWorld as world } from './engine/testWorld.ts';
import type { GameState } from './engine/types.ts';
import { useGameLoop } from './useGameLoop.ts';

let frames: ((time: number) => void)[] = [];
let canceled = 0;

beforeEach(() => {
  frames = [];
  canceled = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => canceled++);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Runs the pending frame at `time`. */
const tick = (time: number) => act(() => frames.shift()!(time));

/** Starts past the title and the intro, standing on the start. */
function setup(reducedMotion = false, state: GameState | null = play(initialGame(world, 7), 'a', 'a')) {
  const store: { current: GameState | null } = { current: state };
  const onFrame = vi.fn();
  const onEvents = vi.fn();
  const hook = renderHook(() => useGameLoop({ world, storeRef: store, reducedMotion, onFrame, onEvents }));
  return { store, onFrame, onEvents, ...hook };
}

describe('useGameLoop', () => {
  it('starts a new game when there is none, and draws it once', () => {
    const { onFrame, store } = setup(false, null);
    expect(store.current?.scene).toBe('title');
    expect(onFrame).toHaveBeenCalledTimes(1);
    tick(1000);
    tick(1100);
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it('runs three ticks for a 50 ms frame while a direction is held', () => {
    const { result, store } = setup();
    act(() => result.current.dir('right', true));
    tick(1000);
    tick(1050);
    expect(store.current).toMatchObject({ x: 3, walk: { fromX: 2, t: 2 } });
  });

  it('clamps a long stall, so the player does not jump across the map', () => {
    const { result, store } = setup();
    act(() => result.current.dir('right', true));
    tick(1000);
    tick(6000);
    expect(store.current!.x).toBeLessThanOrEqual(4);
  });

  it('takes one step for a tap that was over before the next tick', () => {
    const { result, store } = setup();
    act(() => {
      result.current.dir('down', true);
      result.current.dir('down', false);
    });
    tick(1000);
    tick(1017);
    expect(store.current).toMatchObject({ x: 2, y: 3 });
    for (let time = 1034; time < 1400; time += 17) tick(time);
    expect(store.current).toMatchObject({ x: 2, y: 3, walk: null });
  });

  it('follows the direction pressed last, and falls back to the one still held', () => {
    const { result, store } = setup();
    act(() => {
      result.current.dir('right', true);
      result.current.dir('down', true);
    });
    tick(1000);
    tick(1017);
    expect(store.current).toMatchObject({ x: 2, y: 3 });
  });

  it('hands a button press to the engine once, and reports the events', () => {
    const { result, store, onEvents } = setup();
    act(() => result.current.button('start'));
    tick(1000);
    tick(1017);
    expect(store.current!.menu).not.toBeNull();
    expect(onEvents).toHaveBeenCalledWith([{ kind: 'menu', text: 'Menu' }]);
    tick(1034);
    expect(store.current!.menu).not.toBeNull();
  });

  it('keeps a button pressed in the middle of a step until the step is done', () => {
    const { result, store } = setup();
    act(() => {
      result.current.dir('down', true);
      result.current.dir('down', false);
    });
    tick(1000);
    tick(1017);
    expect(store.current!.walk).not.toBeNull();
    act(() => result.current.button('start'));
    for (let time = 1034; time < 1300; time += 17) tick(time);
    expect(store.current).toMatchObject({ x: 2, y: 3, walk: null, menu: { tab: 'items' } });
  });

  it('stops while the tab is hidden, forgets held keys, and carries on when it shows again', () => {
    const { result, store } = setup();
    act(() => result.current.dir('right', true));
    tick(1000);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(canceled).toBe(1);
    const pending = frames.length;

    hidden.mockReturnValue(false);
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(frames.length).toBe(pending + 1);
    frames = frames.slice(-1);
    tick(9000);
    tick(9100);
    expect(store.current).toMatchObject({ x: 2, y: 2 });
  });

  it('stops on unmount', () => {
    const { unmount } = setup();
    unmount();
    expect(canceled).toBe(1);
  });

  it('runs no loop with reduced motion: a press is one whole move, drawn once', () => {
    const { result, store, onFrame } = setup(true);
    expect(frames).toHaveLength(0);
    expect(onFrame).toHaveBeenCalledTimes(1);
    act(() => result.current.dir('right', true));
    expect(store.current).toMatchObject({ x: 3, walk: null });
    expect(onFrame).toHaveBeenCalledTimes(2);
    act(() => result.current.dir('right', false));
    act(() => result.current.button('start'));
    expect(store.current!.menu).not.toBeNull();
    expect(frames).toHaveLength(0);
  });
});
