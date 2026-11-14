import { education } from '../../data/education.ts';
import { experience } from '../../data/experience.ts';
import { profile } from '../../data/profile.ts';
import { projects } from '../../data/projects.ts';
import { skills } from '../../data/skills.ts';
import { HOME, buildFileSystem, displayPath, getNode, listNames, resolvePath, slugify } from './fs.ts';

const data = { profile, skills, experience, education, projects };
const root = buildFileSystem(data);

describe('buildFileSystem', () => {
  it('has the home folder as the only thing at the root', () => {
    expect(listNames(getNode(root, '/')!)).toEqual(['home/']);
    expect(listNames(getNode(root, '/home')!)).toEqual(['guest/']);
  });

  it('has exactly the files from the ticket in the home folder', () => {
    expect(listNames(getNode(root, HOME)!)).toEqual([
      'about.txt',
      'contact.txt',
      'education/',
      'experience/',
      'projects/',
      'skills.txt',
    ]);
    expect(listNames(getNode(root, `${HOME}/education`)!)).toEqual(['han.txt', 'roc-a12.txt', 'westeraam.txt']);
    expect(listNames(getNode(root, `${HOME}/experience`)!)).toEqual([
      '2m-solutions.txt',
      'betabit.txt',
      'dialogus.txt',
      'isatis.txt',
      'marin.txt',
      'robinhq-com.txt',
    ]);
  });

  it('puts all the jobs at one employer in one file, even when the name differs', () => {
    const file = getNode(root, `${HOME}/experience/robinhq-com.txt`);
    expect(file?.type).toBe('file');
    const text = file?.type === 'file' ? file.lines.join('\n') : '';
    for (const job of experience.filter((j) => j.company.startsWith('RobinHQ.com'))) {
      expect(text).toContain(job.title);
    }
  });

  it('has a file for every project', () => {
    for (const project of projects) {
      expect(getNode(root, `${HOME}/projects/${project.id}.md`)?.type).toBe('file');
    }
  });

  it('adding a project adds a file', () => {
    const extra = { ...projects[0]!, id: 'extra-app', name: 'Extra App' };
    const bigger = buildFileSystem({ ...data, projects: [...projects, extra] });
    const file = getNode(bigger, `${HOME}/projects/extra-app.md`);
    expect(file?.type).toBe('file');
    expect(file?.type === 'file' ? file.lines.join('\n') : '').toContain('Extra App');
  });
});

describe('slugify', () => {
  it('drops a bracketed part, accents and punctuation', () => {
    expect(slugify('RobinHQ.com (part of CM.com)')).toBe('robinhq-com');
    expect(slugify('²M-Solutions')).toBe('2m-solutions');
    expect(slugify('Isatis')).toBe('isatis');
  });
});

describe('resolvePath', () => {
  it('treats ~ and an empty path as home', () => {
    expect(resolvePath('/', '~')).toBe(HOME);
    expect(resolvePath('/', '~/projects')).toBe(`${HOME}/projects`);
  });

  it('keeps an absolute path and normalises . .. and trailing slashes', () => {
    expect(resolvePath(HOME, '/home/guest/education/')).toBe(`${HOME}/education`);
    expect(resolvePath(HOME, './projects/../skills.txt')).toBe(`${HOME}/skills.txt`);
  });

  it('resolves a relative path from the current folder', () => {
    expect(resolvePath(`${HOME}/projects`, '..')).toBe(HOME);
    expect(resolvePath(`${HOME}/projects`, '../about.txt')).toBe(`${HOME}/about.txt`);
  });

  it('stays at the root when .. goes above it', () => {
    expect(resolvePath('/', '..')).toBe('/');
    expect(resolvePath('/home', '../../..')).toBe('/');
  });
});

describe('displayPath', () => {
  it('shows home as ~', () => {
    expect(displayPath(HOME)).toBe('~');
    expect(displayPath(`${HOME}/projects`)).toBe('~/projects');
    expect(displayPath('/home')).toBe('/home');
    expect(displayPath('/')).toBe('/');
  });
});

describe('getNode', () => {
  it('finds nothing for a path that is not there', () => {
    expect(getNode(root, `${HOME}/nope`)).toBeUndefined();
    expect(getNode(root, `${HOME}/about.txt/inside`)).toBeUndefined();
  });
});
