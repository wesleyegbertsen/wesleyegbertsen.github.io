import { education } from '../../data/education.ts';
import { experience } from '../../data/experience.ts';
import { navItems } from '../../data/navigation.ts';
import { profile } from '../../data/profile.ts';
import { projects } from '../../data/projects.ts';
import { skills } from '../../data/skills.ts';
import { complete, type CompleteContext } from './complete.ts';
import { HOME, buildFileSystem } from './fs.ts';

const data = { profile, skills, experience, education, projects };
const ctx: CompleteContext = { cwd: HOME, fs: buildFileSystem(data), data, navItems };

describe('complete', () => {
  it('completes a command name that has one match, with a space', () => {
    expect(complete('he', ctx)).toEqual({ line: 'help ', candidates: [] });
  });

  it('lists the candidates when several commands match, and extends to their common prefix', () => {
    const result = complete('c', ctx);
    expect(result.candidates).toEqual(['cat', 'cd', 'clear', 'contact', 'cowsay']);
    expect(result.line).toBe('c');
    expect(complete('cl', ctx).line).toBe('clear ');
    expect(complete('ne', ctx).line).toBe('neofetch ');
  });

  it('completes play', () => {
    expect(complete('pl', ctx)).toEqual({ line: 'play ', candidates: [] });
  });

  it('completes a file for cat', () => {
    expect(complete('cat ab', ctx)).toEqual({ line: 'cat about.txt ', candidates: [] });
  });

  it('completes a folder for cd with a trailing slash and no space', () => {
    expect(complete('cd pro', ctx).line).toBe('cd projects/');
  });

  it('cd offers folders only', () => {
    expect(complete('cd a', ctx)).toEqual({ line: 'cd a', candidates: [] });
    expect(complete('cd e', ctx).candidates).toEqual(['education/', 'experience/']);
  });

  it('completes inside a folder', () => {
    expect(complete('cat projects/ca', ctx).line).toBe('cat projects/cardipaw.md ');
    expect(complete('ls education/', ctx).candidates).toEqual(['education/han.txt', 'education/roc-a12.txt', 'education/westeraam.txt']);
  });

  it('completes relative to the current folder', () => {
    expect(complete('cat ca', { ...ctx, cwd: `${HOME}/projects` }).line).toBe('cat cardipaw.md ');
  });

  it('completes an open target', () => {
    expect(complete('open car', ctx).line).toBe('open cardipaw ');
    expect(complete('open pro', ctx).line).toBe('open projects ');
  });

  it('completes a command name for help', () => {
    expect(complete('help ne', ctx).line).toBe('help neofetch ');
    expect(complete('help c', ctx).candidates).toEqual(['cat', 'cd', 'clear', 'contact', 'cowsay']);
    expect(complete('help ', ctx).candidates).toHaveLength(24);
  });

  it('completes a theme name', () => {
    expect(complete('theme b', ctx).line).toBe('theme blue ');
  });

  it('leaves alone what it cannot complete', () => {
    expect(complete('zzz', ctx)).toEqual({ line: 'zzz', candidates: [] });
    expect(complete('echo he', ctx)).toEqual({ line: 'echo he', candidates: [] });
    expect(complete('cat nope/x', ctx)).toEqual({ line: 'cat nope/x', candidates: [] });
  });
});
