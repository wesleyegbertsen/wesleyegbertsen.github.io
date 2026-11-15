import type { FsData } from './fs.ts';
import type { Education } from '../../data/education.ts';
import type { Job } from '../../data/experience.ts';
import type { profile as realProfile } from '../../data/profile.ts';
import type { Project } from '../../data/projects.ts';
import type { Skill } from '../../data/skills.ts';

type Profile = typeof realProfile;

/** Plain-text views of the site's data. The commands and the files of the virtual filesystem share them. */

export function aboutLines(profile: Profile): string[] {
  return [profile.name, profile.role, profile.tagline];
}

export function contactLines(profile: Profile): string[] {
  return [
    `GitHub:   ${profile.links.github}`,
    `Email:    ${profile.links.email}`,
    `LinkedIn: ${profile.links.linkedin}`,
  ];
}

export function skillsLines(skills: readonly Skill[]): string[] {
  return skills.map((skill) => (skill.note ? `${skill.name} (${skill.note})` : skill.name));
}

const period = (start: string, end: string | null) => `${start} - ${end ?? 'present'}`;

export function experienceListLines(jobs: readonly Job[]): string[] {
  return jobs.map((job) => `${job.title}, ${job.company} (${period(job.start, job.end)})`);
}

/** One employer: the jobs there, newest first, each with its location and stack. */
export function employerLines(jobs: readonly Job[]): string[] {
  const company = jobs[0]?.company.replace(/\s*\(.*\)$/, '') ?? '';
  return [
    company,
    ...jobs.flatMap((job) => [
      '',
      job.title,
      `${job.location}, ${period(job.start, job.end)}`,
      job.stack.join(', '),
    ]),
  ];
}

export function educationListLines(schools: readonly Education[]): string[] {
  return schools.map((school) => `${school.school}: ${school.program} (${school.start} - ${school.end})`);
}

export function schoolLines(school: Education): string[] {
  return [
    school.school,
    school.program,
    ...(school.profile ? [`Profile: ${school.profile}`] : []),
    `${school.start} - ${school.end}`,
  ];
}

export function projectListLines(projects: readonly Project[]): string[] {
  return projects.map((project) => `${project.id}: ${project.name} - ${project.tagline}`);
}

export function projectMarkdownLines(project: Project): string[] {
  return [
    `# ${project.name}`,
    '',
    project.tagline,
    '',
    project.description,
    '',
    `Tech: ${project.tech.join(', ')}`,
    ...(project.license ? [`License: ${project.license}`] : []),
    `Published: ${project.published}`,
    '',
    `Live:   ${project.links.live}`,
    `GitHub: ${project.links.github}`,
    ...(project.links.extras ?? []).map((extra) => `${extra.label}: ${extra.href}`),
  ];
}

/** The whole career as plain text: what the platformer's skip path prints. */
export function careerLines(data: FsData): string[] {
  return [
    'Experience',
    ...experienceListLines(data.experience),
    '',
    'Education',
    ...educationListLines(data.education),
    '',
    'Projects',
    ...projectListLines(data.projects),
    '',
    'Contact',
    ...contactLines(data.profile),
  ];
}
