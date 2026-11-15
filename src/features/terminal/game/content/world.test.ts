import { education } from '../../../../data/education.ts';
import { experience } from '../../../../data/experience.ts';
import { profile } from '../../../../data/profile.ts';
import { projects } from '../../../../data/projects.ts';
import { skills } from '../../../../data/skills.ts';
import type { FsData } from '../../fs.ts';
import { sprites, tiles } from '../assets/atlas.ts';
import { maxDamage, minDamage } from '../engine/battle.ts';
import { playthrough } from '../engine/bot.ts';
import { COLS, ROWS, fold, wrap } from '../engine/text.ts';
import type { Action, World } from '../engine/types.ts';
import { resolveSpot } from '../engine/world.ts';
import { buildWorld } from './world.ts';

const data: FsData = { profile, skills, experience, education, projects };
const world = buildWorld(data);

/** Every action in the world, the ones behind a won battle included. */
function actions(w: World): Action[] {
  const flat = (list: Action[]): Action[] => list.flatMap((action) => ('battle' in action ? [action, ...flat(action.win)] : [action]));
  return Object.values(w.maps).flatMap((map) => map.objects.flatMap((object) => object.branches.flatMap((branch) => flat(branch.do))));
}

const spoken = (w: World) =>
  actions(w)
    .flatMap((action) => ('say' in action ? action.say : []))
    .map(fold)
    .join('\n');

describe('the world', () => {
  it('only names sprites that are on the sheets', () => {
    const drawable = { ...tiles, ...sprites };
    for (const map of Object.values(world.maps)) {
      for (const [char, tile] of Object.entries(map.tiles)) {
        expect(tiles, `${map.id} '${char}'`).toHaveProperty([tile.sprite]);
        if (tile.under) expect(tiles, `${map.id} '${char}'`).toHaveProperty([tile.under]);
        if (tile.animated) expect(tiles, `${map.id} '${char}'`).toHaveProperty([`${tile.sprite}-b`]);
      }
      for (const object of map.objects) {
        if (object.sprite) expect(drawable, object.id).toHaveProperty([object.sprite]);
        if (object.spriteWhen) expect(drawable, object.id).toHaveProperty([object.spriteWhen.sprite]);
        if (object.animated) expect(drawable, object.id).toHaveProperty([`${object.sprite}-b`]);
      }
    }
    for (const enemy of Object.values(world.enemies)) expect(sprites).toHaveProperty([enemy.sprite]);
  });

  it('only refers to things that exist', () => {
    for (const action of actions(world)) {
      if ('warp' in action) expect(() => resolveSpot(world, action.warp)).not.toThrow();
      if ('give' in action) expect(world.items).toHaveProperty([action.give]);
      if ('take' in action) expect(world.items).toHaveProperty([action.take]);
      if ('battle' in action) expect(world.enemies).toHaveProperty([action.battle]);
      if ('badge' in action) expect(world.badges.map((badge) => badge.id)).toContain(action.badge);
    }
    for (const map of Object.values(world.maps)) {
      for (const enemy of map.encounters?.enemies ?? []) expect(world.enemies).toHaveProperty([enemy]);
    }
    for (const id of [...world.playerMoves, ...Object.keys(world.startItems)]) {
      expect({ ...world.moves, ...world.items }).toHaveProperty([id]);
    }
  });

  it('tells every school, employer, project, skill and contact detail from the data', () => {
    const text = spoken(world);
    for (const school of education) expect(text).toContain(fold(school.school));
    for (const job of experience) {
      expect(text).toContain(fold(job.company.replace(/\s*\(.*\)$/, '')));
    }
    for (const project of projects) expect(text).toContain(fold(project.name));
    for (const skill of skills) expect(text).toContain(fold(skill.name));
    expect(text).toContain(profile.links.email);
    expect(text).toContain(profile.links.github);
    expect(text).toContain(profile.links.linkedin);
    expect(text).toContain(profile.name);
  });

  it('follows the data instead of repeating it: other data, other lines', () => {
    const other = buildWorld({
      ...data,
      profile: { ...profile, name: 'Ada Lovelace' } as unknown as FsData['profile'],
      experience: [{ ...experience[0]!, company: 'Analytical Engines Ltd' }],
      education: [{ ...education[0]!, school: 'Home Schooling' }],
      projects: [],
      skills: [{ id: 'notes', name: 'Note G' }],
    });
    const text = spoken(other);
    expect(text).toContain('Analytical Engines Ltd');
    expect(text).toContain('Home Schooling');
    expect(text).toContain('Note G');
    expect(text).toContain('Ada Lovelace');
    expect(text).not.toContain('Betabit');
    expect(other.intro.join(' ')).toContain("Ada's career");
  });

  it('seats everyone even when the data outgrows the seats', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ ...experience[0]!, id: `job-${i}`, company: `Company ${i}` }));
    const text = spoken(buildWorld({ ...data, experience: many }));
    for (const job of many) expect(text).toContain(job.company);
  });

  it('keeps battle lines short enough for the text box', () => {
    const names = [...world.playerMoves.map((id) => world.moves[id]!.name), world.fallbackMove.name];
    for (const enemy of Object.values(world.enemies)) {
      const lines = [
        enemy.defeat,
        `A wild ${enemy.name} appeared!`,
        `There is no running from ${enemy.name}!`,
        ...names.map((name) => `You use ${name}! ${enemy.name} loses 99 HP.`),
        ...enemy.moves.map((move) => `${enemy.name} uses ${move.name}! You lose 99 HP.`),
        ...enemy.moves.map((move) => `${enemy.name} uses ${move.name}, but misses!`),
      ];
      for (const line of lines) expect(wrap(line, COLS).length, line).toBeLessThanOrEqual(ROWS);
    }
  });
});

describe('balance', () => {
  // The promise to every visitor: pressing A (the first move, every turn) wins, from full energy, at the worst luck.
  it.each(Object.entries(world.enemies))('%s can be beaten with the first move alone at the worst luck', (_id, enemy) => {
    const first = world.moves[world.playerMoves[0]!]!;
    expect(first.accuracy).toBe(1);
    const turns = Math.ceil(enemy.hp / minDamage(first));
    const worst = (turns - 1) * Math.max(...enemy.moves.map(maxDamage));
    expect(worst).toBeLessThan(world.baseHp);
    expect(turns).toBeLessThanOrEqual(first.pp);
  });
});

describe('a whole playthrough', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('a bot finishes the game with default choices and no defeat (seed %i)', (seed) => {
    const run = playthrough(world, seed);
    expect(run.stuck).toBe(false);
    expect(run.state.finished).toBe(true);
    expect(run.state.scene).toBe('ending');
    expect(run.defeats).toBe(0);
    expect(run.state.badges).toHaveLength(world.badges.length);
    expect(run.events.filter((event) => event.kind === 'badge')).toHaveLength(world.badges.length);
    expect(run.events.at(-1)?.kind).toBe('ending');
  });

  it('can be finished without a single project in the data', () => {
    expect(playthrough(buildWorld({ ...data, projects: [] })).state.finished).toBe(true);
  });

  it('cannot be finished when a lock has no key: the bot notices', () => {
    const broken = buildWorld(data);
    const examiner = broken.maps.academy!.objects.find((object) => object.id === 'academy:E')!;
    examiner.branches = [{ do: [{ say: ['I am on a break.'] }] }];
    const run = playthrough(broken);
    expect(run.stuck).toBe(true);
    expect(run.state.finished).toBe(false);
  });
});
