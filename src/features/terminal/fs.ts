import { education as realEducation, type Education } from '../../data/education.ts';
import { experience as realExperience, type Job } from '../../data/experience.ts';
import { profile as realProfile } from '../../data/profile.ts';
import { projects as realProjects, type Project } from '../../data/projects.ts';
import { skills as realSkills, type Skill } from '../../data/skills.ts';
import {
  aboutLines,
  contactLines,
  employerLines,
  projectMarkdownLines,
  schoolLines,
  skillsLines,
} from './content.ts';

export type FsNode = { type: 'dir'; children: Record<string, FsNode> } | { type: 'file'; lines: string[] };

export type FsData = {
  profile: typeof realProfile;
  skills: readonly Skill[];
  experience: readonly Job[];
  education: readonly Education[];
  projects: readonly Project[];
};

export const HOME = '/home/guest';

const realData: FsData = {
  profile: realProfile,
  skills: realSkills,
  experience: realExperience,
  education: realEducation,
  projects: realProjects,
};

const file = (lines: string[]): FsNode => ({ type: 'file', lines });
const dir = (children: Record<string, FsNode>): FsNode => ({ type: 'dir', children });

/** `RobinHQ.com (part of CM.com)` becomes `robinhq-com`: no bracketed part, accents folded, punctuation to dashes. */
export function slugify(name: string): string {
  return name
    .replace(/\s*\(.*\)/, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The home folder is built from the data modules, so a new project, job or school is a new file. */
export function buildFileSystem(data: FsData = realData): FsNode {
  const byEmployer = new Map<string, Job[]>();
  for (const job of data.experience) {
    const slug = slugify(job.company);
    byEmployer.set(slug, [...(byEmployer.get(slug) ?? []), job]);
  }

  const experience = Object.fromEntries(
    [...byEmployer].map(([slug, jobs]) => [`${slug}.txt`, file(employerLines(jobs))]),
  );
  const education = Object.fromEntries(
    data.education.map((school) => [`${school.id}.txt`, file(schoolLines(school))]),
  );
  const projects = Object.fromEntries(
    data.projects.map((project) => [`${project.id}.md`, file(projectMarkdownLines(project))]),
  );

  return dir({
    home: dir({
      guest: dir({
        'about.txt': file(aboutLines(data.profile)),
        'skills.txt': file(skillsLines(data.skills)),
        'contact.txt': file(contactLines(data.profile)),
        experience: dir(experience),
        education: dir(education),
        projects: dir(projects),
      }),
    }),
  });
}

/** An absolute, normalised path for `input`, as typed from `cwd`. `..` at the root stays at the root. */
export function resolvePath(cwd: string, input: string): string {
  let start = cwd;
  let rest = input;
  if (input === '~' || input.startsWith('~/')) {
    start = HOME;
    rest = input.slice(1);
  } else if (input.startsWith('/')) {
    start = '/';
  }

  const parts: string[] = [];
  for (const part of `${start}/${rest}`.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}`;
}

export function getNode(root: FsNode, path: string): FsNode | undefined {
  let node: FsNode | undefined = root;
  for (const part of path.split('/').filter(Boolean)) {
    if (node?.type !== 'dir') return undefined;
    node = Object.hasOwn(node.children, part) ? node.children[part] : undefined;
  }
  return node;
}

/** Names in a folder, sorted, with a trailing `/` on folders. A file lists as itself. */
export function listNames(node: FsNode): string[] {
  if (node.type === 'file') return [];
  return Object.entries(node.children)
    .map(([name, child]) => (child.type === 'dir' ? `${name}/` : name))
    .sort();
}

/** The path as the prompt shows it: home is `~`. */
export function displayPath(path: string): string {
  if (path === HOME) return '~';
  return path.startsWith(`${HOME}/`) ? `~${path.slice(HOME.length)}` : path;
}
