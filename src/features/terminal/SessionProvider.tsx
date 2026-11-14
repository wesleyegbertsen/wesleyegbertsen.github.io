import { useCallback, useRef, useState, type ReactNode } from 'react';
import { SessionContext, type Entry } from './SessionContext.ts';
import { initialState } from './shell.ts';

const WELCOME: Entry = { id: 0, kind: 'output', text: "Welcome. Type 'help' to see the commands." };

/**
 * Holds the terminal's session above the routes, so going to another page and back finds the scrollback,
 * the folder and the history as you left them. In memory only: a reload starts a fresh session.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([WELCOME]);
  const [shell, setShell] = useState(initialState);
  const counter = useRef(1);
  const nextId = useCallback(() => counter.current++, []);

  return (
    <SessionContext.Provider value={{ entries, setEntries, shell, setShell, nextId }}>
      {children}
    </SessionContext.Provider>
  );
}
