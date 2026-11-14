import { education } from '../../data/education.ts';
import { experience } from '../../data/experience.ts';
import { profile } from '../../data/profile.ts';
import { projects } from '../../data/projects.ts';
import { skills } from '../../data/skills.ts';
import {
  aboutLines,
  contactLines,
  educationListLines,
  employerLines,
  experienceListLines,
  projectListLines,
  projectMarkdownLines,
  schoolLines,
  skillsLines,
} from './content.ts';

const text = (lines: string[]) => lines.join('\n');

describe('content', () => {
  it('about has the name, the role and the tagline', () => {
    const about = text(aboutLines(profile));
    expect(about).toContain(profile.name);
    expect(about).toContain(profile.role);
    expect(about).toContain(profile.tagline);
  });

  it('contact has every link', () => {
    const contact = text(contactLines(profile));
    expect(contact).toContain(profile.links.github);
    expect(contact).toContain(profile.links.email);
    expect(contact).toContain(profile.links.linkedin);
  });

  it('skills lists every skill and its note', () => {
    const out = text(skillsLines(skills));
    for (const skill of skills) {
      expect(out).toContain(skill.name);
      if (skill.note) expect(out).toContain(skill.note);
    }
  });

  it('the experience list has every job with its company and dates, and "present" for the current one', () => {
    const out = text(experienceListLines(experience));
    for (const job of experience) {
      expect(out).toContain(job.title);
      expect(out).toContain(job.company);
      expect(out).toContain(job.start);
    }
    expect(out).toContain('present');
  });

  it('an employer file lists each of its jobs with the stack', () => {
    const robin = experience.filter((job) => job.company.startsWith('RobinHQ.com'));
    const out = text(employerLines(robin));
    for (const job of robin) {
      expect(out).toContain(job.title);
      expect(out).toContain(job.stack[0]!);
    }
  });

  it('the education list has every school with its program and years', () => {
    const out = text(educationListLines(education));
    for (const school of education) {
      expect(out).toContain(school.school);
      expect(out).toContain(school.program);
      expect(out).toContain(school.start);
      expect(out).toContain(school.end);
    }
  });

  it('a school file has the profile when there is one', () => {
    const han = education.find((school) => school.profile)!;
    expect(text(schoolLines(han))).toContain(han.profile!);
  });

  it('the project list has the id, name and tagline of each project', () => {
    const out = text(projectListLines(projects));
    for (const project of projects) {
      expect(out).toContain(project.id);
      expect(out).toContain(project.name);
      expect(out).toContain(project.tagline);
    }
  });

  it('a project file is markdown with the description, tech and links', () => {
    for (const project of projects) {
      const lines = projectMarkdownLines(project);
      expect(lines[0]).toBe(`# ${project.name}`);
      const out = text(lines);
      expect(out).toContain(project.description);
      for (const tech of project.tech) expect(out).toContain(tech);
      expect(out).toContain(project.links.live);
      expect(out).toContain(project.links.github);
    }
  });
});
