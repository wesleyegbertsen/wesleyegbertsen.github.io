import { education } from '../../../../data/education.ts';
import { experience } from '../../../../data/experience.ts';
import { profile } from '../../../../data/profile.ts';
import { projects } from '../../../../data/projects.ts';
import { skills } from '../../../../data/skills.ts';
import type { FsData } from '../../fs.ts';
import type { Action } from '../engine/types.ts';
import { CAFE_TEXT, DEEP_TEXT, HILLS_FOLK, HOBBIES } from './story.ts';
import { buildWorld } from './world.ts';

/**
 * The voice of the game: signs and people speak in the world, short, and never like a tutorial. The words are
 * Wesley's to change; what is checked here is what they must not do.
 */

const data: FsData = { profile, skills, experience, education, projects };
const world = buildWorld(data);

const deep = (list: Action[]): Action[] => list.flatMap((action) => ('battle' in action ? [action, ...deep(action.win)] : [action]));
/** Every line any sign, person, door or thing says, by the id of what says it. */
const lines = Object.values(world.maps).flatMap((map) =>
  map.objects.flatMap((object) => object.branches.flatMap((branch) => deep(branch.do)).flatMap((action) => ('say' in action ? action.say.map((text) => ({ id: object.id, text })) : []))),
);
/**
 * The notes that put a room into words for whoever cannot see it (where the plates are, the whole slick floor): a
 * description of the place, not a direction. They may name places.
 */
const described = new Set([...DEEP_TEXT.slickWords, DEEP_TEXT.boulders.at(-1)!]);
const spoken = [...lines.map((line) => line.text).filter((text) => !described.has(text)), ...world.intro, ...world.hints.map((hint) => hint.text)];

/** The words of a tutorial: keys, step-by-step directions, and where things are in town. */
const TUTORIAL = [
  /\bpress(es)?\b/i,
  /\b(START|SELECT)\b/,
  /\bbutton\b/i,
  /\b(north|south|east|west)\s*:/i,
  /\bto the (north|south|east|west)\b/i,
  /\b(top|bottom) (left|right)\b/i,
  /\b(top|bottom|left side|right side) of (the )?town\b/i,
  /\bwalk (it|up to|into)\b/i,
  /\bcome back (at|with)\b/i,
  /\bgo (to|and)\b/i,
  /\bshows how many\b/i,
  /\bhands out\b/i,
];

describe('the voice of the game', () => {
  it('never talks like a tutorial: no keys, no step-by-step, no saying where things are', () => {
    expect(spoken.length).toBeGreaterThan(80);
    for (const text of spoken) for (const word of TUTORIAL) expect(text, `${word}`).not.toMatch(word);
  });

  it('keeps signs short: a name and a line at the most', () => {
    const signs = Object.values(world.maps).flatMap((map) => map.objects.filter((object) => object.sprite === 'sign'));
    expect(signs.length).toBeGreaterThanOrEqual(10);
    for (const sign of signs) {
      const text = sign.branches.flatMap((branch) => branch.do).flatMap((action) => ('say' in action ? action.say : []));
      expect(text.length, sign.id).toBeLessThanOrEqual(2);
      for (const line of text) expect(line.length, sign.id).toBeLessThanOrEqual(110);
    }
  });

  it('opens with a short intro and riddles for hints', () => {
    expect(world.intro.length).toBeLessThanOrEqual(2);
    for (const hint of world.hints) expect(hint.text.length).toBeLessThanOrEqual(100);
  });

  it('still tells the career: every school, employer, project and skill is said by someone', () => {
    const all = spoken.join('\n');
    for (const school of education) expect(all, school.school).toContain(school.school);
    for (const job of experience) expect(all, job.company).toContain(job.company.replace(/\s*\(.*\)$/, ''));
    for (const project of projects) expect(all, project.name).toContain(project.name);
    for (const skill of skills) expect(all, skill.name).toContain(skill.name);
    for (const stop of HOBBIES) for (const line of stop.lines) expect(all).toContain(line);
  });

  it('has a cryptic hint in the cave, the people of the hills and the cafe in the same voice', () => {
    expect(DEEP_TEXT.hint.join(' ')).toMatch(/crack/i);
    for (const text of [...HILLS_FOLK.rally('Wes', 10), ...CAFE_TEXT.barista, ...CAFE_TEXT.refill, ...CAFE_TEXT.sign]) {
      for (const word of TUTORIAL) expect(text).not.toMatch(word);
    }
  });
});
