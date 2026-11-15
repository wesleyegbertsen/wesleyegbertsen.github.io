import { education } from '../../../../data/education.ts';
import { experience } from '../../../../data/experience.ts';
import { profile } from '../../../../data/profile.ts';
import { projects } from '../../../../data/projects.ts';
import { skills } from '../../../../data/skills.ts';
import type { FsData } from '../../fs.ts';
import { sprites, tiles } from '../assets/atlas.ts';
import { maxDamage, minDamage } from '../engine/battle.ts';
import { playthrough } from '../engine/bot.ts';
import { attackBonus, enemyHpAt, maxHpOf } from '../engine/level.ts';
import { COLS, ROWS, fold, wrap } from '../engine/text.ts';
import type { Action, EnemyDef, World } from '../engine/types.ts';
import { areaAt, resolveSpot, tileAt } from '../engine/world.ts';
import { AREAS, BOSS_MIN_LEVEL, FINAL_BOSSES, FINAL_LEVEL, LEARN } from './battles.ts';
import { REGIONS } from './maps.ts';
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
      if ('shop' in action) expect(world.shops).toHaveProperty([action.shop]);
      if ('coins' in action) expect(action.coins).toBeGreaterThan(0);
    }
    for (const shop of Object.values(world.shops)) for (const entry of shop.stock) expect(world.items).toHaveProperty([entry.item]);
    for (const map of Object.values(world.maps)) {
      for (const enemy of map.encounters?.enemies ?? []) expect(world.enemies).toHaveProperty([enemy]);
    }
    for (const id of [...world.playerMoves, ...Object.values(world.learn), ...Object.keys(world.startItems)]) {
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
    const names = [...Object.values(world.moves).map((move) => move.name), world.fallbackMove.name];
    for (const enemy of Object.values(world.enemies)) {
      const lines = [
        enemy.defeat,
        `A wild ${enemy.name} appeared!`,
        `${enemy.name} wants to battle!`,
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
  // The promise to every visitor: pressing A (the first move, every turn) wins, from full energy, at the worst
  // luck. It is made for the weakest player a place can see: level 1 where a place is open from the start, the
  // level a door asks for where there is one; no badges, no prize. And for the strongest enemy of the place.
  const first = world.moves[world.playerMoves[0]!]!;

  /** The worst case of a fight with the first move only: what the player has left, and the turns it takes. */
  function worstCase(enemy: EnemyDef, enemyLevel: number, playerLevel: number, badges = 0) {
    const energy = maxHpOf(world, { level: playerLevel, badges: world.badges.slice(0, badges).map((badge) => badge.id), bonusHp: 0 });
    const hit = minDamage(first) + attackBonus(playerLevel, world);
    const turns = Math.ceil(enemyHpAt(enemy, enemyLevel, world) / hit);
    // The enemy answers every turn but the last, always hits, always for the most.
    const taken = (turns - 1) * Math.max(...enemy.moves.map(maxDamage));
    return { left: energy - taken, turns };
  }

  it('rests on a first move that never misses and can never be swapped out', () => {
    expect(first.accuracy).toBe(1);
    expect(first.heal).toBeUndefined();
    expect(Object.values(LEARN)).not.toContain(world.playerMoves[0]);
  });

  const wild = Object.entries(AREAS).flatMap(([area, { enemies }]) => enemies.map((id) => [area, id] as const));
  it.each(wild)('%s: a wild %s can be beaten with the first move alone at the worst luck', (area, id) => {
    const { minLevel, levels } = AREAS[area]!;
    const enemy = world.enemies[id]!;
    // At the top of the range of the place, against the lowest level a player can have there.
    const { left, turns } = worstCase(enemy, levels[1], minLevel);
    expect(left, `${enemy.name} Lv${levels[1]} against a Lv${minLevel} player`).toBeGreaterThan(0);
    expect(turns).toBeLessThanOrEqual(first.pp);
    // And a stronger player never does worse.
    for (let level = minLevel; level <= world.levels.max; level++) expect(worstCase(enemy, levels[1], level).left).toBeGreaterThan(0);
  });

  it.each(Object.entries(BOSS_MIN_LEVEL))('the boss %s can be beaten with the first move alone at the worst luck', (id, minLevel) => {
    const enemy = world.enemies[id]!;
    // The last fight is behind a door that asks for every badge, so those count there. Each of its three battles
    // starts from full energy and full PP: a coffee is handed over in between (regions.test.ts checks that).
    const badges = FINAL_BOSSES.includes(id) ? world.badges.length : 0;
    const { left, turns } = worstCase(enemy, enemy.level, minLevel, badges);
    expect(left, `${enemy.name} against a Lv${minLevel} player`).toBeGreaterThan(0);
    expect(turns).toBeLessThanOrEqual(first.pp);
  });

  it('makes the last fight the hardest, at a level every player has by then', () => {
    // The four badge bosses must be beaten to get in, and together they are worth the level the proof assumes.
    const earned = ['exam', 'legacy', 'scope', 'deadline'].reduce((sum, id) => sum + world.enemies[id]!.level * world.levels.bossXp, 0);
    expect(earned).toBeGreaterThanOrEqual(world.levels.xp[FINAL_LEVEL - 2]!);
    expect(FINAL_BOSSES).toHaveLength(3);
    const badge = Math.max(...['exam', 'legacy', 'scope', 'deadline'].map((id) => world.enemies[id]!.hp));
    let last = badge;
    for (const id of FINAL_BOSSES) {
      expect(BOSS_MIN_LEVEL[id]).toBe(FINAL_LEVEL);
      expect(world.enemies[id]!.hp, id).toBeGreaterThan(last);
      expect(world.enemies[id]!.moves.length).toBeGreaterThanOrEqual(3);
      expect(world.enemies[id]!.tune).toBe('final');
      last = world.enemies[id]!.hp;
    }
  });

  it('covers every enemy: each one lives in one place or is a boss', () => {
    const placed = [...Object.values(AREAS).flatMap((area) => area.enemies), ...Object.keys(BOSS_MIN_LEVEL)];
    expect([...placed].sort()).toEqual(Object.keys(world.enemies).sort());
    expect(new Set(placed).size).toBe(placed.length);
    // The bosses are the ones somebody on a map starts a battle with.
    const fought = new Set(actions(world).flatMap((action) => ('battle' in action ? [action.battle] : [])));
    expect([...fought].sort()).toEqual(Object.keys(BOSS_MIN_LEVEL).sort());
  });

  it('puts the wild enemies of AREAS on the maps, with levels that fit', () => {
    for (const [id, area] of Object.entries(AREAS)) {
      expect(world.maps[id]?.encounters, id).toEqual({ enemies: area.enemies, rate: area.rate, levels: area.levels });
      expect(world.maps[id]!.cells.flat().some((char) => world.maps[id]!.tiles[char]!.grass), id).toBe(true);
      expect(area.levels[0]).toBeLessThanOrEqual(area.levels[1]);
      // Nobody is stronger than the place says: an enemy's own level is within the range.
      for (const enemy of area.enemies) expect(world.enemies[enemy]!.level, enemy).toBeLessThanOrEqual(area.levels[1]);
      expect(area.rate).toBeGreaterThan(0);
      expect(area.rate).toBeLessThanOrEqual(0.2);
    }
    const withWild = Object.values(world.maps).filter((map) => map.encounters).map((map) => map.id);
    expect(withWild.sort()).toEqual(Object.keys(AREAS).sort());
  });

  it('makes the places further out tougher, and the levels reachable', () => {
    expect(AREAS.east!.levels[1]).toBeGreaterThan(AREAS.town!.levels[1]);
    expect(AREAS.west!.levels[1]).toBeGreaterThan(AREAS.town!.levels[1]);
    expect(AREAS.cave!.levels[1]).toBeGreaterThan(AREAS.west!.levels[1]);
    expect(world.levels.max).toBe(10);
    expect(world.levels.xp).toHaveLength(world.levels.max - 1);
    expect([...world.levels.xp].sort((a, b) => a - b)).toEqual(world.levels.xp);
    expect(Object.keys(world.learn).map(Number)).toEqual([5, 10]);
    // The four badge bosses alone are worth at least level 5: every player meets the first offer of a move.
    const main = ['exam', 'legacy', 'scope', 'deadline'].reduce((sum, id) => sum + world.enemies[id]!.level * world.levels.bossXp, 0);
    expect(main).toBeGreaterThanOrEqual(world.levels.xp[3]!);
  });

  it('gives every area variety: several enemies, each with its own picture, name and attacks', () => {
    expect(AREAS.town!.enemies.length).toBeGreaterThanOrEqual(4);
    expect(AREAS.east!.enemies.length).toBeGreaterThanOrEqual(3);
    expect(AREAS.west!.enemies.length).toBeGreaterThanOrEqual(3);
    expect(AREAS.cave!.enemies.length).toBeGreaterThanOrEqual(6);
    const all = Object.values(world.enemies);
    expect(new Set(all.map((enemy) => enemy.sprite)).size).toBe(all.length);
    expect(new Set(all.map((enemy) => enemy.name)).size).toBe(all.length);
    const attacks = all.flatMap((enemy) => enemy.moves.map((move) => move.name));
    expect(new Set(attacks).size).toBe(attacks.length);
    for (const enemy of all) expect(enemy.moves.length, enemy.name).toBeGreaterThanOrEqual(2);
  });
});

describe('a whole playthrough', () => {
  // Slower since round seven: the one place to rest is the cafe, and the bot walks back to it.
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('a bot finishes the game with default choices and no defeat (seed %i)', { timeout: 30_000 }, (seed) => {
    const run = playthrough(world, seed);
    expect(run.stuck).toBe(false);
    expect(run.state.finished).toBe(true);
    expect(run.state.scene).toBe('ending');
    expect(run.defeats).toBe(0);
    expect(run.state.badges).toHaveLength(world.badges.length);
    expect(run.events.filter((event) => event.kind === 'badge')).toHaveLength(world.badges.length);
    expect(run.events.at(-1)?.kind).toBe('ending');
    // On the way it saw the rest of the world too, without getting stuck: the hills, the cave and its boss.
    expect(run.state.items.stamp).toBe(10);
    expect(run.state.items.omamori).toBe(1);
    expect(run.state.flags['beat:outage']).toBe(true);
    expect(run.state.items.medal).toBe(1);
    // It grew on the way, took the offered moves and kept the first one.
    expect(run.state.level).toBeGreaterThanOrEqual(8);
    expect(run.state.moves[0]).toBe(world.playerMoves[0]);
    expect(run.state.moves).toHaveLength(world.playerMoves.length);
    expect(run.state.moves.some((id) => Object.values(world.learn).includes(id))).toBe(true);
    expect(run.events.some((event) => /^You grew to Lv/.test(event.text))).toBe(true);
    expect(run.state.maxHp).toBe(world.baseHp + world.hpPerBadge * world.badges.length + world.levels.hpPerLevel * (run.state.level - 1) + 10);
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

describe('the names of places', () => {
  /** The label is a box of the name's width plus 11 pixels on a screen of 160: 24 characters fit. */
  const FITS = 24;

  it('gives every map a name that fits the label and the font', () => {
    for (const map of Object.values(world.maps)) {
      expect(map.name.length, map.id).toBeGreaterThan(0);
      expect(map.name.length, map.id).toBeLessThanOrEqual(FITS);
      expect(fold(map.name), map.id).toBe(map.name);
    }
    expect(new Set(Object.values(world.maps).map((map) => map.name)).size).toBe(Object.keys(world.maps).length);
  });

  it('keeps every named part on its map, around the thing it is named for, apart from the others', () => {
    expect(Object.keys(REGIONS).length).toBeGreaterThan(0);
    for (const [id, parts] of Object.entries(REGIONS)) {
      const map = world.maps[id]!;
      expect(map, id).toBeDefined();
      expect(map.areas?.map((area) => area.name)).toEqual(parts.map((part) => part.name));
      const taken = new Set<string>();
      for (const part of parts) {
        expect(part.name.length, part.name).toBeLessThanOrEqual(FITS);
        expect(fold(part.name)).toBe(part.name);
        expect(part.name).not.toBe(map.name);
        expect(part.x >= 0 && part.y >= 0 && part.x + part.w <= map.width && part.y + part.h <= map.height, part.name).toBe(true);
        // The thing it is named for stands inside it.
        const thing = map.objects.find((object) => object.id === `${id}:${part.holds}`)!;
        expect(thing, `${id}:${part.holds}`).toBeDefined();
        expect(areaAt(map, thing.x, thing.y), part.name).toBe(part.name);
        // There is ground to walk on in it, and a way in: a cell beside it that is not solid.
        let floor = 0;
        let doorstep = 0;
        for (let y = part.y - 1; y <= part.y + part.h; y++) {
          for (let x = part.x - 1; x <= part.x + part.w; x++) {
            if (tileAt(map, x, y).solid) continue;
            if (areaAt(map, x, y) === part.name) {
              floor++;
              expect(taken.has(`${x},${y}`), `${part.name} ${x},${y}`).toBe(false);
              taken.add(`${x},${y}`);
            } else doorstep++;
          }
        }
        expect(floor, part.name).toBeGreaterThan(0);
        expect(doorstep, part.name).toBeGreaterThan(0);
      }
    }
  });

  it('names the plaza, and in the deep cave the three puzzle rooms and the last chamber', () => {
    expect(world.maps.town!.areas?.map((area) => area.name)).toEqual(['Fountain Plaza']);
    expect(world.maps.cave!.areas).toBeUndefined();
    expect(world.maps.deep!.areas?.map((area) => area.name)).toEqual(['Boulder Hall', 'Slick Rock', 'Pipeline Room', 'Incident Room']);
    // Every cobble of the plaza is in it, and the road past it is not.
    const town = world.maps.town!;
    const fountain = town.objects.find((object) => object.id === 'town:F')!;
    let cobbles = 0;
    for (const side of [-1, 1]) {
      for (let x = fountain.x + side; tileAt(town, x, fountain.y).sprite === 'cobble'; x += side) {
        expect(areaAt(town, x, fountain.y), String(x)).toBe('Fountain Plaza');
        // Just past the last cobble the town is the town again.
        if (tileAt(town, x + side, fountain.y).sprite !== 'cobble') expect(areaAt(town, x + side, fountain.y), String(x + side)).toBe('Career Town');
        cobbles++;
      }
    }
    expect(cobbles).toBeGreaterThanOrEqual(6);
    for (let x = 0; x < town.width; x++) {
      if (tileAt(town, x, fountain.y + 2).sprite === 'path') expect(areaAt(town, x, fountain.y + 2)).toBe('Career Town');
    }
  });
});
