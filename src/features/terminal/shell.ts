import { commands, type Context, type Effect } from './commands.ts';
import { HOME } from './fs.ts';
import { parse } from './parser.ts';

/** What the shell remembers between lines. */
export type ShellState = { cwd: string; history: string[] };

/** The rest of the context, which the page supplies on every line. */
export type Env = Omit<Context, keyof ShellState>;

export type Execution = { state: ShellState; lines: string[]; effects: Effect[] };

/** How many commands the history keeps: the session now outlasts a visit to another page, so it must not grow for ever. */
export const MAX_HISTORY = 500;

export const initialState = (): ShellState => ({ cwd: HOME, history: [] });

/**
 * Runs one line: parses it, records it in the history, runs the command and applies its `cd`.
 * Everything else a command asks for comes back as an effect for the page to carry out.
 */
export function execute(line: string, state: ShellState, env: Env): Execution {
  const parsed = parse(line);
  if (!parsed) return { state, lines: [], effects: [] };

  const history = [...state.history, line.trim()].slice(-MAX_HISTORY);
  const command = commands.find((candidate) => candidate.name === parsed.name);
  if (!command) {
    return {
      state: { ...state, history },
      lines: [`command not found: ${parsed.name}. Type 'help' to see the commands.`],
      effects: [],
    };
  }

  const result = command.run(parsed.args, { ...env, cwd: state.cwd, history });
  const effects = result.effects ?? [];
  const cd = effects.find((effect) => effect.type === 'cd');
  return {
    state: { cwd: cd ? cd.path : state.cwd, history },
    lines: result.lines,
    effects: effects.filter((effect) => effect.type !== 'cd'),
  };
}
