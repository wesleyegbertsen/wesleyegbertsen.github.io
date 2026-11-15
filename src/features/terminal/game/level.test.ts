import { education } from '../../../data/education.ts';
import { experience } from '../../../data/experience.ts';
import { profile } from '../../../data/profile.ts';
import { projects } from '../../../data/projects.ts';
import { skills } from '../../../data/skills.ts';
import { buildLevel } from './level.ts';
import { MAP, SECTION_STARTS } from './map.ts';

const data = { profile, skills, experience, education, projects };
const count = (char: string) => MAP.join('').split(char).length - 1;

describe('the map', () => {
  it('has rows of one width', () => {
    expect(new Set(MAP.map((row) => row.length)).size).toBe(1);
  });

  it('has one start and one flag', () => {
    expect(count('@')).toBe(1);
    expect(count('F')).toBe(1);
  });
});

describe('buildLevel', () => {
  const level = buildLevel(data);

  it('puts the flag in the contact section', () => {
    const contact = SECTION_STARTS.find((section) => section.id === 'contact')!;
    expect(level.flag.col).toBeGreaterThanOrEqual(contact.start);
  });

  it('has a checkpoint at the start of every section', () => {
    const cols = level.checkpoints.map((checkpoint) => checkpoint.col);
    SECTION_STARTS.forEach((section) => expect(cols).toContain(section.start));
  });

  it('labels the items from the data, each employer, school and project once', () => {
    const labels = level.items.map((item) => item.label);
    const employers = new Set(experience.map((job) => job.company.replace(/\s*\(.*\)$/, '')));
    employers.forEach((name) => expect(labels.filter((label) => label === name)).toHaveLength(1));
    education.forEach((school) => expect(labels).toContain(school.school));
    projects.forEach((project) => expect(labels).toContain(project.name));
  });

  it('keeps the markers out of the tiles', () => {
    expect(level.tiles.join('')).not.toMatch(/[@*]/);
  });

  it('fails loudly when a section has too few slots', () => {
    const empty = MAP.map((row) => row.replaceAll('*', ' '));
    expect(() => buildLevel(data, empty)).toThrow(/too few item slots/);
  });
});
