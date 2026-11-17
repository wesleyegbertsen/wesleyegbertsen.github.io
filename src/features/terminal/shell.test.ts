import { education } from '../../data/education.ts';
import { experience } from '../../data/experience.ts';
import { navItems } from '../../data/navigation.ts';
import { profile } from '../../data/profile.ts';
import { projects } from '../../data/projects.ts';
import { skills } from '../../data/skills.ts';
import { commands } from './commands.ts';
import { buildFileSystem, HOME } from './fs.ts';
import { MAX_HISTORY, execute, initialState, type Env, type ShellState } from './shell.ts';

const data = { profile, skills, experience, education, projects };
const env: Env = {
  fs: buildFileSystem(data),
  data,
  navItems,
  now: new Date('2026-01-02T03:04:05Z'),
  themeName: 'green',
  random: () => 0.5,
};

/** Runs lines in order, like a visitor typing them, and gives the last result. */
function run(...lines: string[]) {
  let state: ShellState = initialState();
  let last = execute('', state, env);
  for (const line of lines) {
    last = execute(line, state, env);
    state = last.state;
  }
  return { ...last, text: last.lines.join('\n') };
}

describe('execute', () => {
  it('does nothing for a blank line and does not record it', () => {
    const result = run('   ');
    expect(result.lines).toEqual([]);
    expect(result.state.history).toEqual([]);
  });

  it('says what an unknown command is and where help is', () => {
    expect(run('nope').lines).toEqual(["command not found: nope. Type 'help' to see the commands."]);
  });

  it('keeps the newest commands only, however many are typed', () => {
    let state: ShellState = initialState();
    for (let i = 0; i < MAX_HISTORY + 20; i += 1) state = execute(`echo ${i}`, state, env).state;
    expect(state.history).toHaveLength(MAX_HISTORY);
    expect(state.history.at(-1)).toBe(`echo ${MAX_HISTORY + 19}`);
    expect(state.history[0]).toBe('echo 20');
  });

  it('records every non-blank line, including unknown ones', () => {
    expect(run('whoami', '', 'nope').state.history).toEqual(['whoami', 'nope']);
  });
});

describe('letter case', () => {
  it('runs a command typed in any case like the lowercase one', () => {
    expect(run('WHOAMI').lines).toEqual(['guest']);
    expect(run('Help').lines).toEqual(run('help').lines);
    expect(run('PLAY').effects).toEqual([{ type: 'game' }]);
    expect(run('Theme green').effects).toEqual([{ type: 'theme', index: 0 }]);
  });

  it('keeps what was typed in the unknown-command message and in the history', () => {
    expect(run('NOPE').lines).toEqual(["command not found: NOPE. Type 'help' to see the commands."]);
    expect(run('WHOAMI', 'Echo Hi').state.history).toEqual(['WHOAMI', 'Echo Hi']);
    expect(run('ECHO Hi There').lines).toEqual(['Hi There']);
  });

  it('matches the fixed words of a command in any case', () => {
    expect(run('help PLAY').lines.join(' ')).toMatch(/^play: .*Game Boy adventure/);
    expect(run('theme GREEN')).toMatchObject({ lines: ['theme set to green'], effects: [{ type: 'theme', index: 0 }] });
    expect(run('open PROJECTS')).toMatchObject({ lines: ['opening projects...'], effects: [{ type: 'navigate', to: '/projects' }] });
    expect(run('OPEN Cardipaw').effects).toEqual([{ type: 'navigate', to: '/projects' }]);
    expect(run('open CONSTRUCTOR').effects).toEqual([]);
  });

  it('keeps file names case-sensitive, like the Unix filesystem it imitates', () => {
    expect(run('cat ABOUT.TXT').lines).toEqual(['cat: ABOUT.TXT: No such file or directory']);
    expect(run('cd PROJECTS').lines).toEqual(['cd: no such file or directory: PROJECTS']);
    expect(run('CAT about.txt').text).toContain(profile.role);
  });
});

describe('info commands', () => {
  it('about, contact and skills print the data', () => {
    expect(run('about').text).toContain(profile.role);
    expect(run('contact').text).toContain(profile.links.email);
    const out = run('skills').text;
    for (const skill of skills) expect(out).toContain(skill.name);
  });

  it('projects, experience and education list every entry', () => {
    const projectsOut = run('projects').text;
    for (const project of projects) expect(projectsOut).toContain(project.id);
    const jobs = run('experience').text;
    for (const job of experience) expect(jobs).toContain(job.title);
    const schools = run('education').text;
    for (const school of education) expect(schools).toContain(school.school);
  });

  it('help lists every command by name, grouped, in a few lines', () => {
    const result = run('help');
    for (const command of commands) expect(result.lines.join('\n')).toContain(command.name);
    expect(result.lines.length).toBeLessThanOrEqual(9);
    expect(result.text).toContain('Tab');
  });

  it('help <command> says what one command does', () => {
    expect(run('help cat').lines).toEqual(['cat: print a file']);
    expect(run('help nope').lines).toEqual(["help: no such command: nope. Type 'help' to list them."]);
  });
});

describe('shell basics', () => {
  it('whoami, date and echo', () => {
    expect(run('whoami').lines).toEqual(['guest']);
    expect(run('date').lines).toEqual([env.now.toString()]);
    expect(run('echo "a  b" c').lines).toEqual(['a  b c']);
  });

  it('history is numbered and includes the history command itself', () => {
    expect(run('whoami', 'history').lines).toEqual(['   1  whoami', '   2  history']);
  });

  it('clear asks the page to clear', () => {
    expect(run('clear').effects).toEqual([{ type: 'clear' }]);
  });
});

describe('the filesystem commands', () => {
  it('pwd starts in the home folder', () => {
    expect(run('pwd').lines).toEqual([HOME]);
  });

  it('cd moves, and the effect is applied rather than passed on', () => {
    const result = run('cd projects', 'pwd');
    expect(result.lines).toEqual([`${HOME}/projects`]);
    expect(run('cd projects').effects).toEqual([]);
  });

  it('cd supports .., ~, absolute and relative paths', () => {
    expect(run('cd projects', 'cd ..', 'pwd').lines).toEqual([HOME]);
    expect(run('cd /', 'cd ~', 'pwd').lines).toEqual([HOME]);
    expect(run('cd /home/guest/education', 'pwd').lines).toEqual([`${HOME}/education`]);
    expect(run('cd projects', 'cd', 'pwd').lines).toEqual([HOME]);
  });

  it('ls lists the home folder, a given folder and a file', () => {
    expect(run('ls').lines).toEqual(['about.txt  contact.txt  education/  experience/  projects/  skills.txt']);
    expect(run('ls education').lines).toEqual(['han.txt  roc-a12.txt  westeraam.txt']);
    expect(run('ls about.txt').lines).toEqual(['about.txt']);
  });

  it('cat prints a file, also by a path from another folder', () => {
    expect(run('cat about.txt').text).toContain(profile.name);
    expect(run('cd projects', 'cat ../about.txt').text).toContain(profile.name);
    expect(run('cat projects/cardipaw.md').text).toContain('# CardiPaw');
  });

  it('prints the error for each mistake', () => {
    expect(run('cat nope').lines).toEqual(['cat: nope: No such file or directory']);
    expect(run('ls nope').lines).toEqual(["ls: cannot access 'nope': No such file or directory"]);
    expect(run('cd nope').lines).toEqual(['cd: no such file or directory: nope']);
    expect(run('cd about.txt').lines).toEqual(['cd: not a directory: about.txt']);
    expect(run('cat projects').lines).toEqual(['cat: projects: Is a directory']);
    expect(run('cat').lines).toEqual(['cat: missing file operand']);
  });

  it('a failed cd leaves the folder alone', () => {
    expect(run('cd projects', 'cd nope', 'pwd').lines).toEqual([`${HOME}/projects`]);
  });
});

describe('site control', () => {
  it('open goes to a menu page', () => {
    expect(run('open projects').effects).toEqual([{ type: 'navigate', to: '/projects' }]);
    expect(run('open home').effects).toEqual([{ type: 'navigate', to: '/' }]);
    expect(run('open terminal').effects).toEqual([{ type: 'navigate', to: '/terminal' }]);
  });

  it('open goes to the projects page for a project', () => {
    expect(run('open cardipaw').effects).toEqual([{ type: 'navigate', to: '/projects' }]);
  });

  it('open lists the targets, and rejects an unknown one', () => {
    const list = run('open').text;
    for (const item of navItems) expect(list).toContain(item.id);
    for (const project of projects) expect(list).toContain(project.id);
    expect(run('open nope').lines).toEqual(['open: no such page or project: nope']);
    expect(run('open constructor').effects).toEqual([]);
  });

  it('open follows a new menu item or project with no change to the command', () => {
    const extra = { ...projects[0]!, id: 'extra-app' };
    const bigger: Env = {
      ...env,
      data: { ...data, projects: [...projects, extra] },
      navItems: [...navItems, { id: 'blog', label: 'Blog', to: '/blog' }],
    };
    expect(execute('open extra-app', initialState(), bigger).effects).toEqual([{ type: 'navigate', to: '/projects' }]);
    expect(execute('open blog', initialState(), bigger).effects).toEqual([{ type: 'navigate', to: '/blog' }]);
  });

  it('theme sets each theme by its index', () => {
    expect(run('theme green').effects).toEqual([{ type: 'theme', index: 0 }]);
    expect(run('theme red').effects).toEqual([{ type: 'theme', index: 1 }]);
    expect(run('theme blue').effects).toEqual([{ type: 'theme', index: 2 }]);
    expect(run('theme white').effects).toEqual([{ type: 'theme', index: 3 }]);
  });

  it('theme alone lists the four, marking the current one; a wrong name says so and lists them', () => {
    expect(run('theme').lines).toEqual(['Usage: theme <name>', '* green', '  red', '  blue', '  white']);
    const wrong = run('theme pink');
    expect(wrong.lines[0]).toBe('theme: unknown theme: pink');
    expect(wrong.effects).toEqual([]);
  });
});

describe('easter eggs', () => {
  it('sudo is refused', () => {
    expect(run('sudo ls').lines).toEqual(['guest is not in the sudoers file. This incident will be reported.']);
  });

  it('rm -rf / is a joke with no effect', () => {
    for (const line of ['rm -rf /', 'rm -fr /', 'rm -r -f /', 'rm -rf /*']) {
      const result = run(line);
      expect(result.lines.at(-1)).toBe('Just kidding. Nothing was deleted.');
      expect(result.effects).toEqual([]);
    }
  });

  it('any other rm is refused', () => {
    expect(run('rm about.txt').lines).toEqual(['rm: permission denied: this filesystem is read-only']);
    expect(run('rm -rf about.txt').lines).toEqual(['rm: permission denied: this filesystem is read-only']);
  });

  it('matrix asks the page for the animation', () => {
    expect(run('matrix').effects).toEqual([{ type: 'matrix' }]);
  });

  it('cowsay draws a cow saying the text, or Moo', () => {
    const said = run('cowsay hi there').text;
    expect(said).toContain('< hi there >');
    expect(said).toContain('(oo)');
    expect(run('cowsay').text).toContain('< Moo >');
  });

  it('neofetch shows the theme and the counts', () => {
    const out = run('neofetch').text;
    expect(out).toContain('guest@wesleyegbertsen');
    expect(out).toContain('Theme:    green');
    expect(out).toContain(`Projects: ${projects.length}`);
    expect(out).toContain('Shell:    wsh');
  });
});
