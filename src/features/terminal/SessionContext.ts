import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';
import type { GameState } from './game/engine.ts';
import type { ShellState } from './shell.ts';

/** One line of the scrollback: what was typed, what a command printed, or a line of matrix rain. */
export type Entry = { id: number; kind: 'input' | 'output' | 'rain'; text: string; prompt?: string };

/** How many lines of scrollback the session keeps. Older lines drop off the top. */
export const MAX_ENTRIES = 500;

/** What the terminal keeps while you visit other pages: the scrollback, the folder and the command history. */
export type TerminalSession = {
  entries: Entry[];
  setEntries: Dispatch<SetStateAction<Entry[]>>;
  shell: ShellState;
  setShell: Dispatch<SetStateAction<ShellState>>;
  /** Whether the pane shows the shell or the platformer. */
  mode: 'shell' | 'game';
  setMode: Dispatch<SetStateAction<'shell' | 'game'>>;
  /**
   * The platformer's progress. A plain store, not React state: the game writes it every frame and nothing
   * should re-render for that. It outlasts a visit to another page and is lost on reload.
   */
  game: { current: GameState | null };
  /** A fresh id for an entry, unique for the whole session. */
  nextId: () => number;
};

export const SessionContext = createContext<TerminalSession | null>(null);

export function useTerminalSession(): TerminalSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useTerminalSession must be used inside a SessionProvider');
  return session;
}
