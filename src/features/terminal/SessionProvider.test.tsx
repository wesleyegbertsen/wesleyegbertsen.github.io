import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { MAX_ENTRIES, useTerminalSession, type Entry } from './SessionContext.ts';
import { SessionProvider } from './SessionProvider.tsx';

const wrapper = ({ children }: { children: ReactNode }) => <SessionProvider>{children}</SessionProvider>;
const lines = (count: number, from = 0): Entry[] =>
  Array.from({ length: count }, (_, i) => ({ id: from + i, kind: 'output', text: `line ${from + i}` }));

describe('SessionProvider', () => {
  it('starts with a welcome line and the home folder', () => {
    const { result } = renderHook(() => useTerminalSession(), { wrapper });
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]!.text).toContain("Type 'help'");
    expect(result.current.shell.history).toEqual([]);
  });

  it('hands out ids that never repeat', () => {
    const { result } = renderHook(() => useTerminalSession(), { wrapper });
    const ids = [result.current.nextId(), result.current.nextId(), result.current.nextId()];
    expect(new Set(ids).size).toBe(3);
    expect(ids).not.toContain(0);
  });

  it('keeps only the newest entries, however many are printed', () => {
    const { result } = renderHook(() => useTerminalSession(), { wrapper });

    act(() => result.current.setEntries(lines(MAX_ENTRIES + 100)));

    expect(result.current.entries).toHaveLength(MAX_ENTRIES);
    expect(result.current.entries.at(-1)!.text).toBe(`line ${MAX_ENTRIES + 99}`);
    expect(result.current.entries[0]!.text).toBe('line 100');
  });

  it('applies the cap to an update made from the previous entries too', () => {
    const { result } = renderHook(() => useTerminalSession(), { wrapper });
    act(() => result.current.setEntries(lines(MAX_ENTRIES)));

    act(() => result.current.setEntries((current) => [...current, ...lines(5, 10_000)]));

    expect(result.current.entries).toHaveLength(MAX_ENTRIES);
    expect(result.current.entries.at(-1)!.text).toBe('line 10004');
  });

  it('starts in shell mode with no game progress', () => {
    const { result } = renderHook(() => useTerminalSession(), { wrapper });
    expect(result.current.mode).toBe('shell');
    expect(result.current.game.current).toBeNull();
  });

  it('keeps the game store across a remount, and writing to it does not re-render', () => {
    let renders = 0;
    const { result, rerender } = renderHook(
      () => {
        renders++;
        return useTerminalSession();
      },
      { wrapper },
    );
    const store = result.current.game;
    const before = renders;
    store.current = { x: 7 } as never;
    expect(renders).toBe(before);
    rerender();
    expect(result.current.game).toBe(store);
    expect(result.current.game.current).toEqual({ x: 7 });
  });
});
