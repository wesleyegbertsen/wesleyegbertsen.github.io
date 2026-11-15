import { education } from '../../../../data/education.ts';
import { experience } from '../../../../data/experience.ts';
import { profile } from '../../../../data/profile.ts';
import { projects } from '../../../../data/projects.ts';
import { skills } from '../../../../data/skills.ts';
import type { FsData } from '../../fs.ts';
import { trackFor } from '../audio/director.ts';
import { playthrough, routeTo } from '../engine/bot.ts';
import { initialGame, step } from '../engine/engine.ts';
import { maxHpOf } from '../engine/level.ts';
import { fold } from '../engine/text.ts';
import { NO_INPUT, type Action, type GameMap, type GameState, type Input } from '../engine/types.ts';
import { DELTA, resolveSpot } from '../engine/world.ts';
import { AREAS, BOSS_MIN_LEVEL, CAVE_LEVEL, DEEP_CAVE_LEVEL, STAMP } from './battles.ts';
import { TRACKS } from './music.ts';
import { HOBBIES } from './story.ts';
import { buildWorld } from './world.ts';

/**
 * What lies beyond the town, and what was tidied in it: the lamp posts, the corner by the Contact Office, the
 * roads east and west, Hobby Hills and its stamp rally, the dark cave. And the promise that none of it is needed.
 */

const data: FsData = { profile, skills, experience, education, projects };
const world = buildWorld(data);
const { town, east, hills, west, cave } = world.maps as Record<string, GameMap>;
const OUTSIDE = [town!, east!, hills!, west!];

const press = (state: GameState, input: Partial<Input>) => step(state, { ...NO_INPUT, ...input }, world, { instant: true }).state;
const busy = (state: GameState) => !!state.dialogue || !!state.battle || !!state.menu || !!state.learn;
function settle(state: GameState): GameState {
  let current = state;
  for (let i = 0; i < 400 && busy(current); i++) current = press(current, { a: true });
  expect(busy(current)).toBe(false);
  return current;
}
const started = () => settle(press(initialGame(world, 3), { a: true }));
/** Standing somewhere on a map, as if walked there. */
const at = (map: string, char: string, extra: Partial<GameState> = {}, dx = 0, dy = 0): GameState => ({ ...started(), ...resolveSpot(world, { map, at: char, dx, dy }), ...extra });

function goTo(state: GameState, id: string): GameState {
  let current = state;
  for (let i = 0; i < 900; i++) {
    const route = routeTo(world, current, id);
    if (!route) throw new Error(`No way to ${id} from ${current.map} ${current.x},${current.y}`);
    current = settle(press(current, { dir: route[0]!, pressed: route[0]! }));
    if (route.length === 1) return current;
  }
  throw new Error(`Never got to ${id}`);
}
const talk = (state: GameState, id: string) => settle(press(goTo(state, id), { a: true }));

const tileOf = (map: GameMap, x: number, y: number) => map.tiles[map.cells[y]?.[x] ?? ''];
const cellsOf = (map: GameMap, test: (x: number, y: number) => boolean) =>
  map.cells.flatMap((row, y) => row.flatMap((_, x) => (test(x, y) ? [{ x, y }] : [])));
const deep = (list: Action[]): Action[] => list.flatMap((action) => ('battle' in action ? [action, ...deep(action.win)] : [action]));
const said = (map: GameMap) => map.objects.flatMap((object) => object.branches.flatMap((branch) => deep(branch.do)).flatMap((action) => ('say' in action ? action.say : []))).join('\n');

/** The cells that can be walked to from a cell without stepping on tall grass, a solid tile or a thing. */
function dryReach(map: GameMap, from: { x: number; y: number }): Set<string> {
  const seen = new Set([`${from.x},${from.y}`]);
  const queue = [from];
  for (let cell = queue.shift(); cell; cell = queue.shift()) {
    for (const { dx, dy } of Object.values(DELTA)) {
      const x = cell.x + dx;
      const y = cell.y + dy;
      const tile = tileOf(map, x, y);
      if (seen.has(`${x},${y}`) || !tile || tile.solid || tile.grass) continue;
      if (map.objects.some((object) => object.x === x && object.y === y && object.solid)) continue;
      seen.add(`${x},${y}`);
      queue.push({ x, y });
    }
  }
  return seen;
}

describe('the lamp posts', () => {
  const lamps = (map: GameMap) => cellsOf(map, (x, y) => tileOf(map, x, y)!.sprite === 'lamp');

  it('stand still: one picture, no second frame', () => {
    for (const map of OUTSIDE) for (const tile of Object.values(map.tiles)) if (tile.sprite === 'lamp') expect(tile.animated).toBeFalsy();
  });

  it('all stand right beside a road, on every outdoor map', () => {
    for (const map of OUTSIDE) {
      expect(lamps(map).length, map.id).toBeGreaterThanOrEqual(4);
      for (const lamp of lamps(map)) {
        const beside = Object.values(DELTA).some(({ dx, dy }) => tileOf(map, lamp.x + dx, lamp.y + dy)?.road);
        expect(beside, `${map.id} lamp at ${lamp.x},${lamp.y}`).toBe(true);
      }
    }
  });

  it('line the main road of the town at even distances', () => {
    const main = town!.cells.findIndex((row) => row.filter((char) => town!.tiles[char]!.road).length > town!.width - 4);
    const along = lamps(town!).filter((lamp) => lamp.y === main + 1).map((lamp) => lamp.x);
    expect(along.length).toBeGreaterThanOrEqual(4);
    const gaps = along.slice(1).map((x, i) => x - along[i]!);
    expect(new Set(gaps).size).toBe(1);
  });
});

describe('the corner by the Contact Office', () => {
  const BUILDING = ['roof', 'roof-bell', 'awning', 'wall', 'pane', 'plaque-contact', 'plaque-office', 'brick', 'glass', 'slate'];
  const object = (char: string) => town!.objects.find((candidate) => candidate.id === `town:${char}`)!;
  /** The eight cells around a cell hold nothing but ground and the walls of a building. */
  function clear(x: number, y: number, name: string, allowed: string[] = []) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tile = tileOf(town!, x + dx, y + dy)!;
        if (tile.solid) expect(BUILDING, `${name}: ${tile.sprite} at ${x + dx},${y + dy}`).toContain(tile.sprite);
        const thing = town!.objects.find((candidate) => candidate.x === x + dx && candidate.y === y + dy && candidate.sprite);
        if (thing) expect(allowed, `${name}: ${thing.id} at ${x + dx},${y + dy}`).toContain(thing.id);
      }
    }
  }

  it('leaves room around the door, the sign and the sign of the Office next door', () => {
    const door = object('P');
    clear(door.x, door.y + 1, 'the door front', ['town:P']);
    clear(object('p').x, object('p').y, 'the sign');
    clear(object('o').x, object('o').y, 'the Office sign', ['town:O']);
  });

  it('has no market, bench, lamp or flower bed against the building, and a gap to the Office', () => {
    const door = object('P');
    const walls = cellsOf(town!, (x, y) => tileOf(town!, x, y)!.sprite === 'plaque-contact' || (y === door.y && Math.abs(x - door.x) <= 3 && tileOf(town!, x, y)!.solid));
    const right = Math.max(...walls.map((cell) => cell.x));
    const office = Math.min(...cellsOf(town!, (x, y) => y <= door.y && ['brick', 'glass', 'plaque-office'].includes(tileOf(town!, x, y)!.sprite)).map((cell) => cell.x));
    expect(office - right).toBeGreaterThanOrEqual(5);
    for (let y = door.y - 2; y <= door.y + 3; y++) {
      for (let x = right + 1; x < office; x++) {
        expect(['stall', 'bench', 'lamp', 'flowerbed', 'crate', 'barrel'], `${x},${y}`).not.toContain(tileOf(town!, x, y)!.sprite);
      }
    }
    // At most two things stand between the two buildings (the mailbox and the Office's sign), and the postman.
    const between = town!.objects.filter((candidate) => candidate.sprite && candidate.x >= right && candidate.x < office && candidate.y <= door.y + 3);
    expect(between.map((candidate) => candidate.id).sort()).toEqual(['town:B', 'town:o']);
  });

  it('reads plainly on the bridge sign', () => {
    const text = said(town!);
    expect(text).not.toMatch(/STREAM OF CONSCIOUSNESS/i);
    expect(text).toContain('BRIDGE. North: the ACADEMY, THE OFFICE and the WORKSHOP. South: the LIBRARY.');
  });
});

describe('the roads out of town', () => {
  it('lead east to the hills and west to the cave, and back', () => {
    let state = goTo(started(), 'town:)');
    expect(state.map).toBe('east');
    state = goTo(state, 'east:)');
    expect(state.map).toBe('hills');
    state = goTo(state, 'hills:(');
    expect(state.map).toBe('east');
    state = goTo(state, 'east:(');
    expect(state).toMatchObject({ map: 'town', x: town!.width - 2 });
    state = goTo(state, 'town:(');
    expect(state.map).toBe('west');
    state = goTo(state, 'west:)');
    expect(state).toMatchObject({ map: 'town', x: 1 });
  });

  it('can be walked from end to end without a step in the tall grass, and have tall grass beside the road', () => {
    for (const map of [east!, west!]) {
      const ends = map.objects.filter((object) => object.trigger === 'step');
      expect(ends).toHaveLength(2);
      const reach = dryReach(map, { x: ends[0]!.x, y: ends[0]!.y });
      // The far end, or (for the cave mouth, which is solid) the cell in front of it.
      const far = ends[1]!;
      expect([...reach].some((key) => key === `${far.x},${far.y}` || key === `${far.x + 1},${far.y}` || key === `${far.x - 1},${far.y}`), map.id).toBe(true);
      expect(cellsOf(map, (x, y) => !!tileOf(map, x, y)!.grass).length, map.id).toBeGreaterThanOrEqual(30);
      // A coffee machine on the road, for after a rough battle.
      expect(map.objects.some((object) => object.sprite === 'coffee' && reach.has(`${object.x},${object.y + 1}`)), map.id).toBe(true);
    }
  });

  it('say on their signposts how strong the wild things are', () => {
    expect(said(east!)).toContain(`Lv ${AREAS.east!.levels[0]} to ${AREAS.east!.levels[1]}`);
    expect(said(west!)).toContain(`Lv ${AREAS.west!.levels[0]} to ${AREAS.west!.levels[1]}`);
    expect(said(west!)).toContain(`Lv ${CAVE_LEVEL} and up`);
  });

  it('have a chest in the tall grass each', () => {
    for (const map of [east!, west!]) {
      const chest = map.objects.find((object) => object.sprite === 'chest')!;
      expect(tileOf(map, chest.x, chest.y)!.grass, map.id).toBe(true);
    }
  });
});

describe('Hobby Hills', () => {
  const WANTED = ['astronomy', 'animals', 'gaming', 'japan', 'cats', 'retro', 'soldering', 'language', 'homeserver', 'science'];

  it('has one stop per hobby, each with its own picture and a text of its own', () => {
    expect(HOBBIES.map((stop) => stop.id).sort()).toEqual([...WANTED].sort());
    expect(new Set(HOBBIES.map((stop) => stop.sprite)).size).toBe(HOBBIES.length);
    expect(new Set(HOBBIES.map((stop) => stop.lines.join(' '))).size).toBe(HOBBIES.length);
    for (const stop of HOBBIES) {
      const object = hills!.objects.find((candidate) => candidate.id === `hills:${stop.at}`)!;
      expect(object.sprite, stop.id).toBe(stop.sprite);
      expect(object.trigger).toBe('interact');
      expect(stop.lines.length).toBeGreaterThanOrEqual(2);
      // Short and friendly: a stop is two or three pages at most.
      for (const line of stop.lines) expect(fold(line).length, line).toBeLessThanOrEqual(110);
    }
  });

  it('has no wild enemies, a signpost with the name from the data, and can be walked without leaving the paths much', () => {
    expect(hills!.encounters).toBeUndefined();
    expect(cellsOf(hills!, (x, y) => !!tileOf(hills!, x, y)!.grass)).toEqual([]);
    expect(said(hills!)).toContain(`What ${profile.name.split(' ')[0]} does when the laptop is closed.`);
    const entrance = resolveSpot(world, { map: 'hills', at: '(', dx: 1 });
    const reach = dryReach(hills!, entrance);
    for (const stop of HOBBIES) {
      const object = hills!.objects.find((candidate) => candidate.id === `hills:${stop.at}`)!;
      expect(Object.values(DELTA).some(({ dx, dy }) => reach.has(`${object.x + dx},${object.y + dy}`)), stop.id).toBe(true);
    }
  });

  it('stamps the card once per stop, in passing, and counts the stamps on the Start menu', () => {
    expect(world.collect![1]).toEqual({ item: STAMP, total: 10, label: 'STAMPS', mark: '#' });
    const first = HOBBIES[0]!;
    const before = goTo(at('hills', '(', {}, 1), `hills:${first.at}`);
    const told = step(before, { ...NO_INPUT, a: true }, world, { instant: true });
    expect(told.events[0]?.text).toContain(fold(first.lines[0]!).slice(0, 20));
    let state = told.state;
    const events = [...told.events];
    for (let i = 0; i < 20 && state.dialogue; i++) {
      const next = step(state, { ...NO_INPUT, a: true }, world, { instant: true });
      state = next.state;
      events.push(...next.events);
    }
    expect(state.items[STAMP]).toBe(1);
    expect(state.flags[`hobby:${first.id}`]).toBe(true);
    expect(state.notice?.text).toBe('# 1/10');
    expect(events.at(-1)).toEqual({ kind: 'item', text: 'Found a HOBBY STAMP! 1 of 10.' });
    // Again: the same text, no second stamp.
    const again = settle(press(state, { a: true }));
    expect(again.items[STAMP]).toBe(1);
  });

  it('rewards a full card with a charm and a lunch, once', () => {
    let state = at('hills', '(', {}, 1);
    state = talk(state, 'hills:?');
    expect(state.items.omamori).toBeUndefined();
    for (const stop of HOBBIES) state = talk(state, `hills:${stop.at}`);
    expect(state.items[STAMP]).toBe(10);
    state = talk(state, 'hills:?');
    expect(state.items).toMatchObject({ omamori: 1, bento: 1 });
    expect(state.flags['rally:done']).toBe(true);
    state = talk(state, 'hills:?');
    expect(state.items).toMatchObject({ omamori: 1, bento: 1 });
    expect(world.items.bento!.heal).toBeGreaterThan(0);
  });
});

describe('the cave', () => {
  const mouth = () => at('west', 'D', {}, 1);

  it('turns a beginner away at its mouth and lets level 3 in', () => {
    expect(CAVE_LEVEL).toBe(3);
    const low = press(mouth(), { dir: 'left', pressed: 'left' });
    expect(low.map).toBe('west');
    expect(low.dialogue?.pages.flat().join(' ')).toContain(`Come back at Lv ${CAVE_LEVEL}`);
    const high = press({ ...mouth(), level: CAVE_LEVEL }, { dir: 'left', pressed: 'left' });
    expect(high.map).toBe('cave');
    expect(high.dialogue).toBeNull();
  });

  it('is dark, and has a tune of its own that is not the town\'s', () => {
    expect(cave!.dark).toBe(1);
    for (const map of OUTSIDE) expect(map.dark).toBeUndefined();
    const inside = at('cave', 'm', { level: 3 }, 0, -1);
    expect(trackFor(inside, world)).toBe('cave');
    expect(TRACKS.cave).toBeDefined();
    expect(trackFor(at('east', '(', {}, 1), world)).toBe('route');
    expect(trackFor(at('west', ')', {}, -1), world)).toBe('route');
    expect(trackFor(at('hills', '(', {}, 1), world)).toBe('hills');
  });

  it('switches to the wild tune for a cave monster and to the boss tune for THE OUTAGE', () => {
    // Onto the first rubble, until something jumps out.
    const rubble = cellsOf(cave!, (x, y) => !!tileOf(cave!, x, y)!.grass)[0]!;
    let state: GameState | null = null;
    for (let seed = 1; seed < 80 && !state?.battle; seed++) {
      state = press({ ...at('cave', 'm', { level: 3, seed }), x: rubble.x - 1, y: rubble.y }, { dir: 'right', pressed: 'right' });
    }
    expect(state!.battle?.wild).toBe(true);
    expect(AREAS.cave!.enemies).toContain(state!.battle!.enemy);
    expect(state!.battle!.level).toBeGreaterThanOrEqual(AREAS.cave!.levels[0]);
    expect(state!.battle!.level).toBeLessThanOrEqual(AREAS.cave!.levels[1]);
    expect(trackFor(state!, world)).toBe(world.music!.wild);

    const boss = cave!.objects.find((object) => object.id === 'cave:B')!;
    let fight = press({ ...at('cave', 'm', { level: 9 }), x: boss.x - 1, y: boss.y, dir: 'right' }, { a: true });
    for (let i = 0; i < 10 && fight.dialogue; i++) fight = press(fight, { a: true });
    expect(fight.battle).toMatchObject({ enemy: 'outage', wild: false, level: 10 });
    expect(trackFor(fight, world)).toBe(world.music!.boss);
  });

  it('winds: the way to the boss is long, and cannot be walked without crossing rubble', () => {
    const start = resolveSpot(world, { map: 'cave', at: 'm', dy: -1 });
    const boss = cave!.objects.find((object) => object.id === 'cave:B')!;
    const dry = dryReach(cave!, start);
    expect(dry.has(`${boss.x - 1},${boss.y}`)).toBe(false);
    // Up to the door of the last chamber, which is nearly all of it.
    const route = routeTo(world, at('cave', 'm', { level: 9 }, 0, -1), 'cave:D');
    expect(route).not.toBeNull();
    expect(route!.length).toBeGreaterThan(60);
    // It turns many times.
    const turns = route!.filter((dir, i) => i > 0 && dir !== route![i - 1]).length;
    expect(turns).toBeGreaterThanOrEqual(8);
  });

  it('keeps the last chamber for level 5: the boss cannot be reached below it', () => {
    expect(DEEP_CAVE_LEVEL).toBe(BOSS_MIN_LEVEL.outage);
    expect(DEEP_CAVE_LEVEL).toBeGreaterThanOrEqual(CAVE_LEVEL);
    const door = cave!.objects.find((object) => object.id === 'cave:D')!;
    const before = { ...at('cave', 'm', { level: DEEP_CAVE_LEVEL - 1 }), x: door.x - 1, y: door.y, dir: 'right' as const };
    const stopped = press(before, { dir: 'right', pressed: 'right' });
    expect(stopped.x).toBe(door.x - 1);
    expect(stopped.dialogue?.pages.flat().join(' ')).toContain(`Lv ${DEEP_CAVE_LEVEL} and up`);
    expect(routeTo(world, before, 'cave:B')).toBeNull();
    const through = press({ ...before, level: DEEP_CAVE_LEVEL }, { dir: 'right', pressed: 'right' });
    expect(through.x).toBe(door.x);
    expect(routeTo(world, through, 'cave:B')).not.toBeNull();
  });

  it('has a boss guarding a chest with a medal and ten max energy for good, and a ladder out', () => {
    const boss = cave!.objects.find((object) => object.id === 'cave:B')!;
    const chest = cave!.objects.find((object) => object.id === 'cave:C')!;
    // The chest is behind the boss: no way to it while the boss stands.
    const beforeBoss = { ...at('cave', 'm', { level: 10, hp: 57, maxHp: 57 }), x: boss.x - 1, y: boss.y, dir: 'right' as const };
    expect(routeTo(world, beforeBoss, 'cave:C')).toBeNull();
    let state = settle(press(beforeBoss, { a: true }));
    expect(state.flags['beat:outage']).toBe(true);
    const energy = state.maxHp;
    state = talk(state, 'cave:C');
    expect(state.items.medal).toBe(1);
    expect(state.bonusHp).toBe(10);
    expect(state.maxHp).toBe(energy + 10);
    expect(state.maxHp).toBe(maxHpOf(world, state));
    expect(state.flags['chest:prize']).toBe(true);
    state = talk(state, 'cave:C');
    expect(state.items.medal).toBe(1);
    expect(state.bonusHp).toBe(10);
    expect(Math.abs(chest.x - boss.x)).toBeGreaterThanOrEqual(1);
    state = goTo(state, 'cave:L');
    expect(state.map).toBe('west');
  });

  it('has coffee at the mouth and half way, and a defeat only costs the walk back', () => {
    expect(cave!.objects.filter((object) => object.sprite === 'coffee')).toHaveLength(2);
    const rested = talk(at('cave', 'm', { level: 3, hp: 5 }, 0, -1), 'cave:k');
    expect(rested.hp).toBe(rested.maxHp);
    expect(rested.heal.map).toBe('cave');
    // Beaten deeper in: back at that coffee machine, nothing lost.
    const rubble = cellsOf(cave!, (x, y) => !!tileOf(cave!, x, y)!.grass)[0]!;
    let lost: GameState | null = null;
    for (let seed = 1; seed < 80 && !lost?.battle; seed++) {
      lost = press({ ...rested, seed, hp: 1, xp: 30, items: { coffee: 1, stamp: 4 }, x: rubble.x - 1, y: rubble.y }, { dir: 'right', pressed: 'right' });
    }
    const after = settle(lost!);
    expect(after).toMatchObject({ map: 'cave', x: rested.heal.x, y: rested.heal.y, hp: after.maxHp, xp: 30, level: 3 });
    expect(after.items).toEqual({ coffee: 1, stamp: 4 });
  });
});

describe('none of it is needed', () => {
  it('can still be finished with both roads out of town closed', () => {
    const closed = buildWorld(data);
    for (const char of ['(', ')']) closed.maps.town!.objects.find((object) => object.id === `town:${char}`)!.branches = [];
    const run = playthrough(closed, 2);
    expect(run.state.finished).toBe(true);
    expect(run.state.badges).toHaveLength(world.badges.length);
    expect(run.state.items[STAMP]).toBeUndefined();
    expect(run.state.items.medal).toBeUndefined();
  });

  it('never asks for a level, a stamp or a prize on the way to the ending: only the cave does', () => {
    const extra = ['stamp', 'omamori', 'bento', 'medal'];
    for (const map of Object.values(world.maps)) {
      for (const object of map.objects) {
        const conds = [object.hideWhen, ...object.branches.map((branch) => branch.when)];
        for (const cond of conds) {
          if (!cond) continue;
          if (cond.level !== undefined) expect(['west:D', 'cave:D'], object.id).toContain(object.id);
          for (const item of [cond.item, cond.noItem, cond.count?.item]) {
            if (item && extra.includes(item)) expect(object.id).toBe('hills:?');
          }
          for (const flag of [cond.flag, cond.notFlag]) {
            if (flag && /^(hobby|rally|chest:(prize|cave|east|west)|beat:outage)/.test(flag)) expect(['hills', 'cave', 'east', 'west'], object.id).toContain(map.id);
          }
        }
      }
    }
    // Nothing on the old maps leads into the new ones except the two ends of the main road.
    const ways = Object.values(world.maps).flatMap((map) =>
      map.objects.flatMap((object) => object.branches.flatMap((branch) => deep(branch.do)).flatMap((action) => ('warp' in action ? [`${object.id}>${action.warp.map}`] : []))),
    );
    expect(ways.filter((way) => /^(town|academy|office|workshop|library|contact):.*>(east|west|hills|cave)$/.test(way)).sort()).toEqual(['town:(>west', 'town:)>east']);
  });
});
