import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { matrixLine, neofetchLines } from './art.ts';
import { commandNames, commands } from './commands.ts';

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
      'sudo', 'rm', 'matrix', 'cowsay', 'neofetch',
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
  it.each(['parser', 'content', 'fs', 'commands', 'shell', 'art', 'complete'])(
    '%s.ts imports nothing from React or the DOM',
    (name) => {
      const source = readFileSync(resolve(process.cwd(), `src/features/terminal/${name}.ts`), 'utf8');
      expect(source).not.toMatch(/from ['"]react/);
      expect(source).not.toMatch(/\b(document|window|localStorage)\b/);
    },
  );
});
