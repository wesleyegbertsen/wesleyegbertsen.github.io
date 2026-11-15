import type { NavItem } from '../../data/navigation.ts';
import { THEMES } from '../theme/themes.ts';
import { cowsayLines, neofetchLines } from './art.ts';
import {
  aboutLines,
  careerLines,
  contactLines,
  educationListLines,
  experienceListLines,
  projectListLines,
  skillsLines,
} from './content.ts';
import { HOME, getNode, listNames, resolvePath, type FsData, type FsNode } from './fs.ts';

/** What a command asks the page to do. The commands never touch React, the DOM or timers themselves. */
export type Effect =
  | { type: 'clear' }
  | { type: 'cd'; path: string }
  | { type: 'navigate'; to: string }
  | { type: 'theme'; index: number }
  | { type: 'matrix' }
  | { type: 'game' };

export type Result = { lines: string[]; effects?: Effect[] };

/** What a command may read: the world (fs, data, clock, theme) and the session (folder, history). */
export type Context = {
  cwd: string;
  history: readonly string[];
  fs: FsNode;
  data: FsData;
  navItems: readonly NavItem[];
  now: Date;
  themeName: string;
  random: () => number;
};

/** How `help` groups the commands, in the order it prints them. */
export const GROUPS = [
  { id: 'info', label: 'info' },
  { id: 'shell', label: 'shell' },
  { id: 'files', label: 'files' },
  { id: 'site', label: 'site' },
  { id: 'fun', label: 'fun' },
] as const;

export type Command = {
  name: string;
  group: (typeof GROUPS)[number]['id'];
  help: string;
  run: (args: string[], ctx: Context) => Result;
};

const say = (...lines: string[]): Result => ({ lines });
const THEME_NAMES = THEMES.map((theme) => theme.name);

/** Targets of `open`: every menu item, then every project (which lives on the projects page). */
export function openTargets(ctx: Pick<Context, 'navItems' | 'data'>): Record<string, string> {
  return {
    ...Object.fromEntries(ctx.data.projects.map((project) => [project.id, '/projects'])),
    ...Object.fromEntries(ctx.navItems.map((item) => [item.id, item.to])),
  };
}

function ls(args: string[], ctx: Context): Result {
  const target = args[0];
  const path = target === undefined ? ctx.cwd : resolvePath(ctx.cwd, target);
  const node = getNode(ctx.fs, path);
  if (!node) return say(`ls: cannot access '${target}': No such file or directory`);
  if (node.type === 'file') return say(target ?? '');
  return say(listNames(node).join('  '));
}

function cd(args: string[], ctx: Context): Result {
  const target = args[0];
  const path = target === undefined ? HOME : resolvePath(ctx.cwd, target);
  const node = getNode(ctx.fs, path);
  if (!node) return say(`cd: no such file or directory: ${target}`);
  if (node.type === 'file') return say(`cd: not a directory: ${target}`);
  return { lines: [], effects: [{ type: 'cd', path }] };
}

function cat(args: string[], ctx: Context): Result {
  const target = args[0];
  if (target === undefined) return say('cat: missing file operand');
  const node = getNode(ctx.fs, resolvePath(ctx.cwd, target));
  if (!node) return say(`cat: ${target}: No such file or directory`);
  if (node.type === 'dir') return say(`cat: ${target}: Is a directory`);
  return { lines: node.lines };
}

function open(args: string[], ctx: Context): Result {
  const targets = openTargets(ctx);
  const name = args[0];
  if (name === undefined) {
    return say(
      'Usage: open <page or project>',
      `Pages:    ${ctx.navItems.map((item) => item.id).join(', ')}`,
      `Projects: ${ctx.data.projects.map((project) => project.id).join(', ')}`,
    );
  }
  const to = Object.hasOwn(targets, name) ? targets[name] : undefined;
  if (to === undefined) return say(`open: no such page or project: ${name}`);
  return { lines: [`opening ${name}...`], effects: [{ type: 'navigate', to }] };
}

function theme(args: string[], ctx: Context): Result {
  const name = args[0];
  const list = THEME_NAMES.map((n) => `${n === ctx.themeName ? '*' : ' '} ${n}`);
  if (name === undefined) return say('Usage: theme <name>', ...list);
  const index = THEME_NAMES.indexOf(name as (typeof THEME_NAMES)[number]);
  if (index < 0) return say(`theme: unknown theme: ${name}`, ...list);
  return { lines: [`theme set to ${name}`], effects: [{ type: 'theme', index }] };
}

function rm(args: string[]): Result {
  const flags = args.filter((arg) => arg.startsWith('-')).join('');
  const wipesRoot = args.some((arg) => arg === '/' || arg === '/*') && flags.includes('r') && flags.includes('f');
  if (!wipesRoot) return say('rm: permission denied: this filesystem is read-only');
  return say(
    'removing /bin ...',
    'removing /home/guest ...',
    'removing /etc ...',
    'removing /usr ...',
    'Just kidding. Nothing was deleted.',
  );
}

export const commands: Command[] = [
  {
    name: 'help', group: 'shell',
    help: 'list the commands, or say what one does',
    run: (args) => {
      const asked = args[0];
      if (asked !== undefined) {
        const command = commands.find((candidate) => candidate.name === asked);
        return say(
          command ? `${command.name}: ${command.help}` : `help: no such command: ${asked}. Type 'help' to list them.`,
        );
      }
      // A few lines, so the whole list fits the terminal without scrolling. `help <command>` has the detail.
      return say(
        'Commands:',
        ...GROUPS.map(
          (group) =>
            `  ${group.label.padEnd(7)}${commands
              .filter((command) => command.group === group.id)
              .map((command) => command.name)
              .join(' ')}`,
        ),
        '',
        "'help <command>' explains one. Tab completes.",
      );
    },
  },
  { name: 'about', group: 'info', help: 'who I am', run: (_args, ctx) => ({ lines: aboutLines(ctx.data.profile) }) },
  { name: 'projects', group: 'info', help: 'what I have built', run: (_args, ctx) => ({ lines: projectListLines(ctx.data.projects) }) },
  { name: 'skills', group: 'info', help: 'my technical skills', run: (_args, ctx) => ({ lines: skillsLines(ctx.data.skills) }) },
  {
    name: 'experience', group: 'info',
    help: 'my work experience',
    run: (_args, ctx) => ({ lines: experienceListLines(ctx.data.experience) }),
  },
  {
    name: 'education', group: 'info',
    help: 'where I studied',
    run: (_args, ctx) => ({ lines: educationListLines(ctx.data.education) }),
  },
  { name: 'contact', group: 'info', help: 'how to reach me', run: (_args, ctx) => ({ lines: contactLines(ctx.data.profile) }) },
  { name: 'clear', group: 'shell', help: 'clear the screen', run: () => ({ lines: [], effects: [{ type: 'clear' }] }) },
  { name: 'whoami', group: 'shell', help: 'print the current user', run: () => say('guest') },
  { name: 'date', group: 'shell', help: 'print the date and time', run: (_args, ctx) => say(ctx.now.toString()) },
  { name: 'echo', group: 'shell', help: 'print the arguments', run: (args) => say(args.join(' ')) },
  {
    name: 'history', group: 'shell',
    help: 'list the commands of this session',
    run: (_args, ctx) => ({ lines: ctx.history.map((line, i) => `${String(i + 1).padStart(4)}  ${line}`) }),
  },
  { name: 'pwd', group: 'files', help: 'print the current folder', run: (_args, ctx) => say(ctx.cwd) },
  { name: 'ls', group: 'files', help: 'list a folder', run: ls },
  { name: 'cd', group: 'files', help: 'change folder', run: cd },
  { name: 'cat', group: 'files', help: 'print a file', run: cat },
  { name: 'open', group: 'site', help: 'go to a page or a project', run: open },
  { name: 'theme', group: 'site', help: 'change the site colour', run: theme },
  { name: 'sudo', group: 'fun', help: 'try it', run: () => say('guest is not in the sudoers file. This incident will be reported.') },
  { name: 'rm', group: 'fun', help: 'remove files (do not)', run: (args) => rm(args) },
  {
    name: 'matrix', group: 'fun',
    help: 'follow the white rabbit',
    run: () => ({ lines: ['Wake up, guest...'], effects: [{ type: 'matrix' }] }),
  },
  {
    name: 'play', group: 'fun',
    help: 'walk through my career (a Game Boy adventure); "play skip" prints it as text',
    run: (args, ctx) =>
      args[0] === 'skip'
        ? { lines: careerLines(ctx.data) }
        : { lines: ['Starting Career Quest. Esc or q to leave.'], effects: [{ type: 'game' }] },
  },
  { name: 'cowsay', group: 'fun', help: 'a cow says it', run: (args) => ({ lines: cowsayLines(args.join(' ')) }) },
  {
    name: 'neofetch', group: 'fun',
    help: 'about this system',
    run: (_args, ctx) => ({
      lines: neofetchLines({
        user: 'guest',
        host: 'wesleyegbertsen',
        os: 'github.io',
        shell: 'wsh',
        theme: ctx.themeName,
        commands: commands.length,
        projects: ctx.data.projects.length,
      }),
    }),
  },
];

export const commandNames: string[] = commands.map((command) => command.name);
