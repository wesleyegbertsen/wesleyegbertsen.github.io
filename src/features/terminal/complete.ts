import { THEMES } from '../theme/themes.ts';
import { commandNames, keyword, openTargets, type Context } from './commands.ts';
import { getNode, listNames, resolvePath } from './fs.ts';

export type CompleteContext = Pick<Context, 'cwd' | 'fs' | 'data' | 'navItems'>;
export type Completion = { line: string; candidates: string[] };

const commonPrefix = (words: string[]): string =>
  words.reduce((prefix, word) => {
    let i = 0;
    while (i < prefix.length && prefix[i] === word[i]) i += 1;
    return prefix.slice(0, i);
  });

/** Names in the folder a partial path points into, as the full text to type. Folders end in `/`. */
function pathCandidates(word: string, ctx: CompleteContext, foldersOnly: boolean): string[] {
  const slash = word.lastIndexOf('/');
  const folder = word.slice(0, slash + 1);
  const name = word.slice(slash + 1);
  const node = getNode(ctx.fs, resolvePath(ctx.cwd, folder === '' ? '.' : folder));
  if (!node || node.type !== 'dir') return [];
  return listNames(node)
    .filter((entry) => entry.startsWith(name) && (!foldersOnly || entry.endsWith('/')))
    .map((entry) => folder + entry);
}

function candidatesFor(command: string | undefined, word: string, ctx: CompleteContext): string[] {
  // Fixed words match a prefix in any case and complete to their own (lowercase) spelling; paths keep their case.
  const fixed = (names: string[]) => names.filter((name) => name.startsWith(keyword(word)));
  switch (command === undefined ? undefined : keyword(command)) {
    case undefined:
    case 'help':
      return fixed(commandNames);
    case 'cd':
      return pathCandidates(word, ctx, true);
    case 'ls':
    case 'cat':
      return pathCandidates(word, ctx, false);
    case 'open':
      return fixed(Object.keys(openTargets(ctx)));
    case 'theme':
      return fixed(THEMES.map((theme) => theme.name as string));
    case 'play':
      return fixed(['skip']);
    default:
      return [];
  }
}

/**
 * Completes the last word of `line`: the command name for the first word, then paths, open targets, theme names
 * or `skip` (for `play`) depending on the command. One match completes it. Several extend to their common prefix and are returned
 * for printing.
 */
export function complete(line: string, ctx: CompleteContext): Completion {
  const split = line.search(/\S*$/);
  const head = line.slice(0, split);
  const word = line.slice(split);
  const command = head.trim() === '' ? undefined : head.trim().split(/\s+/)[0];

  const candidates = candidatesFor(command, word, ctx).sort();
  if (candidates.length === 0) return { line, candidates: [] };
  if (candidates.length === 1) {
    const only = candidates[0]!;
    return { line: head + only + (only.endsWith('/') ? '' : ' '), candidates: [] };
  }
  return { line: head + commonPrefix(candidates), candidates };
}
