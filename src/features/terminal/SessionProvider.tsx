import { useCallback, useRef, useState, type ReactNode, type SetStateAction } from 'react';
import { MAX_ENTRIES, SessionContext, type Entry } from './SessionContext.ts';
import type { GameState } from './game/engine/types.ts';
import { initialState } from './shell.ts';

const WELCOME: Entry = { id: 0, kind: 'output', text: "Welcome. Type 'help' to see the commands." };

/**
 * Holds the terminal's session above the routes, so going to another page and back finds the scrollback,
 * the folder and the history as you left them. In memory only: a reload starts a fresh session.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [entries, setAllEntries] = useState<Entry[]>([WELCOME]);
  const [shell, setShell] = useState(initialState);
  const [mode, setMode] = useState<'shell' | 'game'>('shell');
  const game = useRef<GameState | null>(null);
  const counter = useRef(1);
  const nextId = useCallback(() => counter.current++, []);

  // Every update goes through the cap, so a long session or a `matrix` habit cannot grow the page for ever.
  const setEntries = useCallback((action: SetStateAction<Entry[]>) => {
    setAllEntries((current) => {
      const next = typeof action === 'function' ? action(current) : action;
      return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
    });
  }, []);

  return (
    <SessionContext.Provider value={{ entries, setEntries, shell, setShell, mode, setMode, game, nextId }}>
      {children}
    </SessionContext.Provider>
  );
}
