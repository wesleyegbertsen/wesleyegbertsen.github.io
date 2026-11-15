import { act, renderHook } from '@testing-library/react';
import { education } from '../../../data/education.ts';
import { experience } from '../../../data/experience.ts';
import { profile } from '../../../data/profile.ts';
import { projects } from '../../../data/projects.ts';
import { skills } from '../../../data/skills.ts';
import type { GameState } from './engine.ts';
import { buildLevel } from './level.ts';
import { useGameLoop } from './useGameLoop.ts';

const level = buildLevel({ profile, skills, experience, education, projects });

let frames: ((time: number) => void)[] = [];
let canceled = 0;

beforeEach(() => {
  frames = [];
  canceled = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => canceled++);
});
afterEach(() => vi.unstubAllGlobals());

/** Runs the pending frame at `time`. */
const tick = (time: number) => act(() => frames.shift()!(time));

function setup(reducedMotion = false) {
  const store: { current: GameState | null } = { current: null };
  const onFrame = vi.fn();
  const onEvents = vi.fn();
  const hook = renderHook(() => useGameLoop({ level, storeRef: store, reducedMotion, onFrame, onEvents }));
  return { store, onFrame, onEvents, ...hook };
}

describe('useGameLoop', () => {
  it('draws the start once, as soon as it runs', () => {
    const { onFrame, store } = setup();
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(store.current).not.toBeNull();
  });

  it('runs three steps for a 100 ms frame', () => {
    const { result, store } = setup();
    act(() => result.current.setKey('right', true));
    tick(1000);
    const before = store.current!.x;
    tick(1100);
    // Three steps at 7 tiles a second: about 0.7 of a tile.
    expect(store.current!.x - before).toBeCloseTo(0.7, 1);
  });

  it('clamps a long stall to MAX_FRAME_MS', () => {
    const { result, store } = setup();
    act(() => result.current.setKey('right', true));
    tick(1000);
    const before = store.current!.x;
    tick(6000);
    expect(store.current!.x - before).toBeLessThan(2);
  });

  it('does not call onFrame when the picture is unchanged', () => {
    const { onFrame } = setup();
    tick(1000);
    tick(1040);
    tick(1080);
    // Standing still on the ground: no new picture after the player settles.
    const calls = onFrame.mock.calls.length;
    for (let t = 1120; t < 2000; t += 40) tick(t);
    expect(onFrame.mock.calls.length).toBeLessThan(calls + 3);
  });

  it('stops scheduling when the tab is hidden and resumes when it shows again', () => {
    setup();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(canceled).toBeGreaterThan(0);
    hidden.mockReturnValue(false);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(frames.length).toBeGreaterThan(0);
    hidden.mockRestore();
  });

  it('cancels the frame when unmounted', () => {
    const { unmount } = setup();
    const before = canceled;
    unmount();
    expect(canceled).toBeGreaterThan(before);
  });

  it('releases every key when told to', () => {
    const { result, store } = setup();
    act(() => result.current.setKey('right', true));
    act(() => result.current.release());
    tick(1000);
    const before = store.current!.x;
    tick(1100);
    expect(store.current!.x).toBeCloseTo(before, 3);
  });

  describe('with reduced motion', () => {
    it('schedules no frame', () => {
      setup(true);
      expect(frames).toHaveLength(0);
    });

    it('moves one tile for a press and redraws exactly once', () => {
      const { result, store, onFrame } = setup(true);
      const before = store.current!.x;
      onFrame.mockClear();
      act(() => result.current.press('right'));
      expect(store.current!.x - before).toBeGreaterThanOrEqual(1);
      expect(store.current!.x - before).toBeLessThan(2);
      expect(onFrame).toHaveBeenCalledTimes(1);
    });
  });
});
