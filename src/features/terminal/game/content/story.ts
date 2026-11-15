import type { Education } from '../../../../data/education.ts';
import type { Job } from '../../../../data/experience.ts';
import type { Project } from '../../../../data/projects.ts';
import { contactLines } from '../../content.ts';
import type { FsData } from '../../fs.ts';
import type { Action, Cond, Spot } from '../engine/types.ts';
import type { MapSpec, ObjectSpec } from '../engine/world.ts';
import { BADGES } from './battles.ts';
import { ACADEMY, CONTACT, LIBRARY, OFFICE, TOWN, WORKSHOP } from './maps.ts';

/**
 * Who and what is on the maps, and what they say. HOW TO EDIT
 *
 * - The facts (schools, employers, projects, skills, contact details) are read from src/data. Do not type them
 *   here: change the data module and the people in the game say the new thing.
 * - Everything else (greetings, jokes, signs, boss lines) is plain text in this file. Change it freely. A text is
 *   wrapped and split into pages by the game; each string in a `say` list starts on a new page.
 * - Only printable ASCII has a glyph in the font; accents are folded (é becomes e) and anything else shows as `?`.
 * - The helpers below (sign, person, chest, door, boss...) cover the usual things. An object is a list of
 *   branches: the first whose `when` holds runs its actions in order (say, give, take, flag, badge, heal, battle,
 *   warp, ending). See engine/types.ts.
 * - After a change run `npm test`: a bot plays the whole game and fails if it can no longer be finished.
 */

// --- helpers --------------------------------------------------------------------------------------------------

const sign = (text: string): ObjectSpec => ({
  sprite: 'sign',
  solid: true,
  trigger: 'interact',
  branches: [{ do: [{ say: [text] }] }],
});

const person = (sprite: string, lines: string[]): ObjectSpec => ({
  sprite,
  solid: true,
  trigger: 'interact',
  branches: [{ do: [{ say: lines }] }],
});

/** A spot on the map that is just a name (the start, an unused seat). */
const marker = (under?: string): ObjectSpec => ({ solid: false, trigger: 'interact', branches: [], under });

const chest = (flag: string, item: string, under?: string): ObjectSpec => ({
  sprite: 'chest',
  spriteWhen: { flag, sprite: 'chest-open' },
  solid: true,
  trigger: 'interact',
  under,
  branches: [{ when: { notFlag: flag }, do: [{ flag }, { give: item }] }, { do: [{ say: ['It is empty.'] }] }],
});

/** A door you walk into. With a lock it only lets you through while `when` holds, and says `deny` otherwise. */
const door = (to: Spot, lock?: { when: Cond; deny: string }): ObjectSpec => ({
  sprite: 'door',
  solid: true,
  trigger: 'step',
  branches: lock ? [{ when: lock.when, do: [{ warp: to }] }, { do: [{ say: [lock.deny] }] }] : [{ do: [{ warp: to }] }],
});

/** The mat at the bottom of a room: step on it to go back to town, in front of that building's door. */
const exitTo = (townDoor: string): ObjectSpec => ({
  sprite: 'mat',
  solid: false,
  trigger: 'step',
  branches: [{ do: [{ warp: { map: 'town', at: townDoor, dy: 1, dir: 'down' } }] }],
});

/** Into a building: you arrive on the cell above its mat. */
const into = (map: string): Spot => ({ map, at: 'm', dy: -1, dir: 'up' });

/** A coffee machine: restores energy and moves, and is where a defeat brings you back to. Never leaves you dry. */
const coffee = (): ObjectSpec => ({
  sprite: 'coffee',
  solid: true,
  trigger: 'interact',
  branches: [
    {
      when: { noItem: 'coffee' },
      do: [{ heal: true }, { say: ['Fresh coffee! Energy and moves are restored. Here, one to go.'] }, { give: 'coffee' }],
    },
    { do: [{ heal: true }, { say: ['Fresh coffee! Energy and moves are restored.'] }] },
  ],
});

/** A boss stands in the way until beaten, then it is gone. `win` runs after the victory. */
const boss = (enemy: string, intro: string[], win: Action[]): ObjectSpec => ({
  sprite: 'boss',
  solid: true,
  trigger: 'interact',
  hideWhen: { flag: `beat:${enemy}` },
  branches: [{ do: [{ say: intro }, { battle: enemy, win: [{ flag: `beat:${enemy}` }, ...win] }] }],
});

/**
 * Seats `speeches` on the numbered characters of a map: the first speech on `1`, the next on `2`. If there are
 * more speeches than seats, the last person tells the rest too; seats nobody needs stay empty.
 */
function seat(chars: string[], speeches: string[][], sprites: string[]): Record<string, ObjectSpec> {
  const used = speeches.slice(0, chars.length).map((lines, i) =>
    i === chars.length - 1 ? speeches.slice(i).flat() : lines,
  );
  return Object.fromEntries(
    chars.map((char, i) => [char, used[i] ? person(sprites[i % sprites.length]!, used[i]) : marker()]),
  );
}

const firstName = (data: FsData) => data.profile.name.split(' ')[0]!;

// --- the facts, as speech --------------------------------------------------------------------------------------

function schoolSpeech(school: Education, who: string): string[] {
  return [
    `${school.school}. ${who} sat right there, ${school.start} to ${school.end}.`,
    `The programme: ${school.program}${school.profile ? `, profile ${school.profile}` : ''}.`,
  ];
}

/** The jobs grouped per employer, in the order of the data (newest first). */
export function employers(jobs: readonly Job[]): Job[][] {
  const groups = new Map<string, Job[]>();
  for (const job of jobs) {
    const name = job.company.replace(/\s*\(.*\)$/, '');
    groups.set(name, [...(groups.get(name) ?? []), job]);
  }
  return [...groups.values()];
}

function employerSpeech(jobs: Job[], who: string): string[] {
  const newest = jobs[0]!;
  const oldest = jobs.at(-1)!;
  const name = newest.company.replace(/\s*\(.*\)$/, '');
  const until = newest.end ?? 'today';
  const tools = `The tools: ${newest.stack.slice(0, 6).join(', ')}${newest.stack.length > 6 ? ' and more' : ''}.`;
  if (jobs.length === 1) {
    const verb = newest.end === null ? 'works' : 'worked';
    return [`${name}, ${newest.location}. ${who} ${verb} here as ${newest.title}, ${newest.start} to ${until}.`, tools];
  }
  return [
    `${name}, ${newest.location}. ${who} was here from ${oldest.start} to ${until}.`,
    `It started as ${oldest.title} and grew into ${newest.title}.`,
    tools,
  ];
}

function projectSpeech(project: Project): string[] {
  return [
    `${project.name}: ${project.tagline}`,
    ...project.description.split(/(?<=\.)\s+/),
    `Built with ${project.tech.join(', ')}.`,
    `Try it: ${project.links.live}`,
  ];
}

function shelfSpeeches(data: FsData, shelves: number): string[][] {
  const names = data.skills.map((skill) => (skill.note ? `${skill.name} (${skill.note})` : skill.name));
  const size = Math.max(1, Math.ceil(names.length / shelves));
  const groups: string[][] = [];
  for (let i = 0; i < names.length; i += size) groups.push(names.slice(i, i + size));
  return groups.map((group, i) => [`Shh. Shelf ${i + 1} of ${groups.length}: ${group.join(', ')}.`]);
}

// --- the maps --------------------------------------------------------------------------------------------------

/** Every map with its things, built from the data. */
export function buildMaps(data: FsData): MapSpec[] {
  const who = firstName(data);
  const all = BADGES.length;

  const town: MapSpec = {
    id: 'town',
    name: 'Career Town',
    rows: TOWN,
    ground: '.',
    encounters: { enemies: ['bug'], rate: 0.15 },
    objects: {
      '@': marker('='),
      A: door(into('academy')),
      a: sign('ACADEMY. Where it all started.'),
      O: door(into('office'), {
        when: { item: 'diploma' },
        deny: 'THE OFFICE only hires graduates. Come back with a DIPLOMA from the ACADEMY.',
      }),
      o: sign('THE OFFICE. Graduates only.'),
      S: door(into('workshop')),
      s: sign('WORKSHOP. Side projects are built here.'),
      L: door(into('library'), {
        when: { item: 'librarycard' },
        deny: 'Members only. The WORKSHOP hands out LIBRARY CARDs.',
      }),
      l: sign('LIBRARY. Members only.'),
      P: door(into('contact'), {
        when: { badges: all },
        deny: `The CONTACT OFFICE opens for holders of ${all} badges.`,
      }),
      p: sign(`CONTACT OFFICE. Opens for ${all} badges.`),
      k: coffee(),
      C: chest('chest:pizza', 'pizza', '"'),
    },
  };

  const schools = [...data.education].reverse().map((school) => schoolSpeech(school, who));
  const academy: MapSpec = {
    id: 'academy',
    name: 'Academy',
    rows: ACADEMY,
    ground: '_',
    objects: {
      ...seat(['1', '2', '3'], schools, ['teacher', 'librarian', 'teacher']),
      E: boss(
        'exam',
        ['Heard about every school? Then prove it.', 'Nobody leaves the ACADEMY without the FINAL EXAM!'],
        [
          { badge: 'education' },
          { give: 'diploma' },
          { say: ['THE OFFICE across town only hires graduates. Show them your DIPLOMA.'] },
        ],
      ),
      k: coffee(),
      m: exitTo('A'),
    },
  };

  // The first colleague lends the key card, for a coffee.
  const [first, ...others] = employers(data.experience).map((jobs) => employerSpeech(jobs, who));
  const colleagues = seat(['2', '3', '4', '5', '6'], others, ['maker', 'teacher', 'dev', 'librarian']);
  const lender: ObjectSpec = {
    sprite: 'dev',
    solid: true,
    trigger: 'interact',
    branches: [
      { when: { flag: 'keycard' }, do: [{ say: [...(first ?? []), 'Thanks for the coffee! The server room is up there.'] }] },
      {
        when: { item: 'coffee' },
        do: [
          { say: [...(first ?? []), 'Is that COFFEE I smell? Trade you: my KEY CARD for a cup.'] },
          { take: 'coffee' },
          { flag: 'keycard' },
          { give: 'keycard' },
        ],
      },
      { do: [{ say: [...(first ?? []), 'I would lend you my KEY CARD, but not before coffee. The machine is in the corner.'] }] },
    ],
  };
  const office: MapSpec = {
    id: 'office',
    name: 'The Office',
    rows: OFFICE,
    ground: '_',
    objects: {
      '1': lender,
      ...colleagues,
      D: {
        sprite: 'door',
        solid: true,
        trigger: 'step',
        branches: [
          { when: { item: 'keycard' }, do: [], pass: true },
          { do: [{ say: ['The server room is locked. A colleague with a KEY CARD could help.'] }] },
        ],
      },
      B: boss(
        'legacy',
        ['Deep in the server room, something old stirs...', 'It is LEGACY CODE! Nobody dares to touch it.'],
        [{ badge: 'experience' }, { say: ['Years of experience, earned. The other buildings have badges too.'] }],
      ),
      k: coffee(),
      m: exitTo('O'),
    },
  };

  const workshop: MapSpec = {
    id: 'workshop',
    name: 'Workshop',
    rows: WORKSHOP,
    ground: '_',
    objects: {
      ...seat(['1', '2'], data.projects.map(projectSpeech), ['maker', 'dev']),
      L: person('cat', ['Purr... (The workshop cat. Every project here was supervised by her.)']),
      C: chest('chest:duck', 'duck'),
      B: boss(
        'scope',
        ['Psst. Could the project ALSO do this? And this? And...', 'It is SCOPE CREEP!'],
        [
          { badge: 'projects' },
          { give: 'librarycard' },
          { say: ['The LIBRARY is at the bottom right of town. Your card opens it.'] },
        ],
      ),
      k: coffee(),
      m: exitTo('S'),
    },
  };

  const library: MapSpec = {
    id: 'library',
    name: 'Library',
    rows: LIBRARY,
    ground: '_',
    objects: {
      ...seat(['1', '2', '3', '4'], shelfSpeeches(data, 4), ['librarian', 'teacher', 'dev', 'maker']),
      B: boss(
        'deadline',
        ['Tick. Tock. This badge is due... NOW!', 'It is the DEADLINE!'],
        [{ badge: 'skills' }, { say: [`Skills, proven. With ${all} badges the CONTACT OFFICE at the top of town opens.`] }],
      ),
      k: coffee(),
      m: exitTo('L'),
    },
  };

  const contact: MapSpec = {
    id: 'contact',
    name: 'Contact Office',
    rows: CONTACT,
    ground: '_',
    objects: {
      H: {
        sprite: 'wesley',
        solid: true,
        trigger: 'interact',
        branches: [
          {
            do: [
              {
                say: [
                  `You made it! I am ${data.profile.name}, ${data.profile.role}.`,
                  'Thanks for walking through my career. Want to talk? This is how to reach me:',
                  ...contactLines(data.profile),
                ],
              },
              { ending: true },
            ],
          },
        ],
      },
      m: exitTo('P'),
    },
  };

  return [town, academy, office, workshop, library, contact];
}

/** The first lines of the game. */
export const intro = (data: FsData): string[] => [
  `Welcome to Career Town! Here, ${firstName(data)}'s career is a place to explore.`,
  `Every building is a chapter with a badge to win. Collect all ${BADGES.length} and the CONTACT OFFICE opens.`,
  'Walk up to people and press A to talk. START opens your bag, SELECT gives a hint.',
];

/** What Select says: the first one whose condition holds. */
export const HINTS: { when?: Cond; text: string }[] = [
  { when: { badges: BADGES.length }, text: 'All badges! The CONTACT OFFICE at the top of town is open.' },
  { when: { notFlag: 'beat:exam' }, text: 'Start at the ACADEMY, top left. Talk to everyone, then face the examiner.' },
  { when: { notFlag: 'beat:legacy' }, text: 'Your DIPLOMA opens THE OFFICE, top right. Someone there wants coffee.' },
  { when: { notFlag: 'beat:scope' }, text: 'The WORKSHOP on the left side of town has a badge too.' },
  { text: 'Your LIBRARY CARD opens the LIBRARY, bottom right.' },
];

/** The lines of the ending screen. */
export const ending = (data: FsData): string[] => [
  'THE END',
  `Thanks for visiting ${firstName(data)}'s career town.`,
  'The contact details are on this page.',
];
