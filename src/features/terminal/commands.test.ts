import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { matrixLine, neofetchLines } from './art.ts';
import { education } from '../../data/education.ts';
import { experience } from '../../data/experience.ts';
import { navItems } from '../../data/navigation.ts';
import { profile } from '../../data/profile.ts';
import { projects } from '../../data/projects.ts';
import { skills } from '../../data/skills.ts';
import { commandNames, commands } from './commands.ts';
import { buildFileSystem } from './fs.ts';
import { execute, initialState, type Env } from './shell.ts';

describe('the command registry', () => {
  it('has a unique name and some help text for every command', () => {
    expect(new Set(commandNames).size).toBe(commands.length);
    for (const command of commands) {
      expect(command.name).toMatch(/^[a-z]+$/);
      expect(command.help.trim()).not.toBe('');
      expect(['info', 'shell', 'files', 'site', 'fun']).toContain(command.group);
    }
  });

  it('has every command the ticket names', () => {
    for (const name of [
      'help', 'about', 'projects', 'skills', 'experience', 'education', 'contact',
      'clear', 'whoami', 'date', 'echo', 'history',
      'ls', 'cd', 'cat', 'pwd', 'open', 'theme',
      'sudo', 'rm', 'matrix', 'cowsay', 'neofetch', 'play',
    ]) {
      expect(commandNames).toContain(name);
    }
  });
});

describe('neofetchLines', () => {
  it('fits a phone: no line is wider than 32 characters', () => {
    const lines = neofetchLines({
      user: 'guest',
      host: 'wesleyegbertsen',
      os: 'github.io',
      shell: 'wsh',
      theme: 'green',
      commands: 23,
      projects: 1,
    });
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(32);
  });
});

describe('matrixLine', () => {
  it('is as wide as asked and only changes with the random numbers', () => {
    const seeded = () => {
      let n = 0;
      return () => ((n += 0.137) % 1);
    };
    const a = matrixLine(seeded(), 30);
    expect(a).toHaveLength(30);
    expect(matrixLine(seeded(), 30)).toBe(a);
  });
});

describe('the command logic is pure', () => {
  it.each([
    'parser', 'content', 'fs', 'commands', 'shell', 'art', 'complete',
    'game/engine/engine', 'game/engine/battle', 'game/engine/world', 'game/engine/text', 'game/engine/rng',
    'game/engine/types', 'game/engine/bot', 'game/content/maps', 'game/content/battles', 'game/content/story',
    'game/content/world', 'game/content/music', 'game/engine/wander', 'game/audio/score', 'game/audio/director', 'game/audio/player',
    'game/settingsStore',
  ])(
    '%s.ts imports nothing from React or the DOM',
    (name) => {
      const source = readFileSync(resolve(process.cwd(), `src/features/terminal/${name}.ts`), 'utf8');
      expect(source).not.toMatch(/from ['"]react/);
      expect(source).not.toMatch(/\b(document|window|localStorage)\b/);
    },
  );
});

describe('play', () => {
  const data = { profile, skills, experience, education, projects };
  const env: Env = { fs: buildFileSystem(data), data, navItems, now: new Date(0), themeName: 'matrix', random: () => 0.5 };
  const run = (line: string) => execute(line, initialState(), env);

  it('is in the fun group and help explains it', () => {
    expect(commands.find((command) => command.name === 'play')?.group).toBe('fun');
    expect(run('help play').lines.join(' ')).toMatch(/Game Boy adventure/);
    expect(run('help').lines.join('\n')).toMatch(/fun .*play/);
  });

  it('starts the game and says how to leave', () => {
    const result = run('play');
    expect(result.effects).toEqual([{ type: 'game' }]);
    expect(result.lines.join(' ')).toMatch(/Esc or q/);
  });

  it('answers an unknown argument with a usage line instead of starting the game', () => {
    for (const line of ['play skp', 'play skip skip', 'play now']) {
      const result = run(line);
      expect(result.effects).toEqual([]);
      expect(result.lines.join(' ')).toContain('Usage: play [skip]');
    }
  });

  it('prints the whole career as text with play skip, and starts no game', () => {
    const result = run('play skip');
    expect(result.effects).toEqual([]);
    const text = result.lines.join('\n');
    expect(text).toContain('Betabit');
    expect(text).toContain('HAN University of Applied Sciences');
    expect(text).toContain(projects[0]!.name);
    expect(text).toContain(profile.links.email);
  });

  it('takes skip in any case, and PLAY alone still opens the game', () => {
    for (const line of ['play SKIP', 'PLAY Skip']) {
      const result = run(line);
      expect(result.effects).toEqual([]);
      expect(result.lines).toEqual(run('play skip').lines);
    }
    expect(run('PLAY').effects).toEqual([{ type: 'game' }]);
  });
});
