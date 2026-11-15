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
import { AREAS, BOSS_MIN_LEVEL, CAVE_LEVEL, DEEP_CAVE_LEVEL, FINAL_BOSSES, FINAL_LEVEL, STAMP } from './battles.ts';
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

/** One step short of an edge of the town: on the road cell beside it. */
const goToward = (id: string): GameState => {
  const end = town!.objects.find((object) => object.id === id)!;
  return { ...started(), x: end.x + (end.x === 0 ? 1 : -1), y: end.y };
};

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

  it('flies the flag on the plaza in front of the building, not beside the Academy', () => {
    const door = object('P');
    const flags = cellsOf(town!, (x, y) => tileOf(town!, x, y)!.sprite === 'flag');
    expect(flags).toHaveLength(1);
    const flag = flags[0]!;
    expect(tileOf(town!, flag.x, flag.y)!.under).toBe('cobble');
    expect(flag.y).toBeGreaterThan(door.y);
    expect(Math.abs(flag.x - door.x)).toBeLessThanOrEqual(4);
    // Not in the way: off the road, and not next to the door front.
    expect(Math.max(Math.abs(flag.x - door.x), Math.abs(flag.y - (door.y + 1)))).toBeGreaterThan(1);
  });

  it('puts the market by the road, with nothing in the grass beside the vendor', () => {
    const vendor = object('<');
    const stall = cellsOf(town!, (x, y) => tileOf(town!, x, y)!.sprite === 'stall')[0]!;
    expect(stall).toEqual({ x: vendor.x - 1, y: vendor.y });
    // Two cells from the road that runs down the middle of town, and no bush, rock or crate around him.
    const road = town!.cells[vendor.y]!.findIndex((char, x) => x > vendor.x && town!.tiles[char]!.road);
    expect(road - vendor.x).toBe(2);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        expect(tileOf(town!, vendor.x + dx, vendor.y + dy)!.solid, `${vendor.x + dx},${vendor.y + dy}`).toBe(false);
      }
    }
  });

  it('reads plainly on the bridge sign', () => {
    const text = said(town!);
    expect(text).not.toMatch(/CONSCIOUSNESS/i);
    expect(text).toContain('STREAM OF COMMITS.');
    expect(text).toContain('North: the ACADEMY, THE OFFICE and the WORKSHOP. South: the LIBRARY.');
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

  it('have their signpost by the middle of the road, and sound like a path, not a door', () => {
    for (const map of [east!, west!]) {
      const sign = map.objects.find((object) => object.sprite === 'sign')!;
      expect(tileOf(map, sign.x, sign.y + 1)?.road, map.id).toBe(true);
      expect(Math.abs(sign.x - map.width / 2), map.id).toBeLessThanOrEqual(map.width / 4 + 2);
    }
    // Each a quarter of the way in from the town end of its road: the east road's on the left, the west road's on the right.
    const eastSign = east!.objects.find((object) => object.sprite === 'sign')!;
    const westSign = west!.objects.find((object) => object.sprite === 'sign')!;
    expect(eastSign.x / east!.width).toBeLessThan(0.3);
    expect(westSign.x / west!.width).toBeGreaterThan(0.65);
    expect(westSign.x / west!.width).toBeLessThan(0.85);
    expect(west!.width - 1 - westSign.x).toBe(eastSign.x + 1);
    const leaving = step(goToward('town:)'), { ...NO_INPUT, dir: 'right', pressed: 'right' }, world, { instant: true });
    expect(leaving.state.map).toBe('east');
    expect(leaving.cues).toContain('path');
    expect(leaving.cues).not.toContain('door');
    // A real door still sounds like one.
    const door = town!.objects.find((object) => object.id === 'town:A')!;
    const indoors = step({ ...started(), x: door.x, y: door.y + 1 }, { ...NO_INPUT, dir: 'up', pressed: 'up' }, world, { instant: true });
    expect(indoors.state.map).toBe('academy');
    expect(indoors.cues).toContain('door');
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
  const thing = (char: string) => cave!.objects.find((object) => object.id === `cave:${char}`)!;
  const inside = (extra: Partial<GameState> = {}) => at('cave', 'm', { level: 3, dir: 'left', ...extra }, -1);
  const walkable = (x: number, y: number) => !!tileOf(cave!, x, y) && !tileOf(cave!, x, y)!.solid;
  /** The cells that can be walked to from the mouth, rubble and all, with some cells closed off. Solid things block. */
  function reach(closed: string[] = [], open: string[] = []): Set<string> {
    const start = resolveSpot(world, { map: 'cave', at: 'm', dx: -1 });
    const seen = new Set([`${start.x},${start.y}`]);
    const queue = [start];
    for (let cell = queue.shift(); cell; cell = queue.shift()) {
      for (const { dx, dy } of Object.values(DELTA)) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        const key = `${x},${y}`;
        if (seen.has(key) || closed.includes(key) || !walkable(x, y)) continue;
        const object = cave!.objects.find((candidate) => candidate.x === x && candidate.y === y && candidate.solid);
        if (object && !open.includes(object.id)) continue;
        seen.add(key);
        queue.push({ map: 'cave', x, y });
      }
    }
    return seen;
  }
  const rubble = cellsOf(cave!, (x, y) => !!tileOf(cave!, x, y)!.grass);

  it('turns a beginner away at its mouth and lets level 3 in', () => {
    expect(CAVE_LEVEL).toBe(3);
    const low = press(mouth(), { dir: 'left', pressed: 'left' });
    expect(low.map).toBe('west');
    expect(low.dialogue?.pages.flat().join(' ')).toContain(`Come back at Lv ${CAVE_LEVEL}`);
  });

  it('is walked into going left, and the player arrives at its east side still facing left', () => {
    const told = step({ ...mouth(), level: CAVE_LEVEL }, { ...NO_INPUT, dir: 'left', pressed: 'left' }, world, { instant: true });
    const exit = thing('m');
    expect(told.state).toMatchObject({ map: 'cave', x: exit.x - 1, y: exit.y, dir: 'left' });
    expect(told.state.dialogue).toBeNull();
    // The way out is at the right edge of the cave, behind the player.
    expect(exit.x).toBe(cave!.width - 2);
    expect(told.cues).toContain('cave');
    expect(told.cues).not.toContain('door');
    // And out again: walking right, onto the road, facing right.
    const out = step(told.state, { ...NO_INPUT, dir: 'right', pressed: 'right' }, world, { instant: true });
    const door = west!.objects.find((object) => object.id === 'west:D')!;
    expect(out.state).toMatchObject({ map: 'west', x: door.x + 1, y: door.y, dir: 'right' });
    expect(out.cues).toContain('cave');
  });

  it('is dark, and has a tune of its own that is not the town\'s', () => {
    expect(cave!.dark).toBe(1);
    for (const map of OUTSIDE) expect(map.dark).toBeUndefined();
    expect(trackFor(inside(), world)).toBe('cave');
    expect(TRACKS.cave).toBeDefined();
    expect(trackFor(at('east', '(', {}, 1), world)).toBe('route');
    expect(trackFor(at('west', ')', {}, -1), world)).toBe('route');
    expect(trackFor(at('hills', '(', {}, 1), world)).toBe('hills');
  });

  it('switches to the wild tune for a cave monster and to the boss tune for THE OUTAGE', () => {
    const first = rubble.find((cell) => walkable(cell.x + 1, cell.y) && !tileOf(cave!, cell.x + 1, cell.y)!.grass)!;
    let state: GameState | null = null;
    for (let seed = 1; seed < 80 && !state?.battle; seed++) {
      state = press({ ...inside({ seed }), x: first.x + 1, y: first.y }, { dir: 'left', pressed: 'left' });
    }
    expect(state!.battle?.wild).toBe(true);
    expect(AREAS.cave!.enemies).toContain(state!.battle!.enemy);
    expect(state!.battle!.level).toBeGreaterThanOrEqual(AREAS.cave!.levels[0]);
    expect(state!.battle!.level).toBeLessThanOrEqual(AREAS.cave!.levels[1]);
    expect(trackFor(state!, world)).toBe(world.music!.wild);

    const boss = thing('B');
    let fight = press({ ...inside({ level: 9 }), x: boss.x, y: boss.y + 1, dir: 'up' }, { a: true });
    for (let i = 0; i < 10 && fight.dialogue; i++) fight = press(fight, { a: true });
    expect(fight.battle).toMatchObject({ enemy: 'outage', wild: false, level: 10 });
    expect(trackFor(fight, world)).toBe(world.music!.boss);
  });

  it('is a cave, not a tunnel: rooms, and more than one way to everything that matters', () => {
    const door = thing('D');
    const front = `${door.x},${door.y + 1}`;
    expect(reach().has(front)).toBe(true);
    // No single patch of rubble is the only way: close any one of them and the door can still be reached.
    for (const cell of rubble) expect(reach([`${cell.x},${cell.y}`]).has(front), `${cell.x},${cell.y}`).toBe(true);
    // Rooms: at least four places where a 3 by 3 block is open floor.
    const rooms = cellsOf(cave!, (x, y) => [0, 1, 2].every((dy) => [0, 1, 2].every((dx) => walkable(x + dx, y + dy))));
    expect(rooms.length).toBeGreaterThanOrEqual(4);
    // It fills the map in all directions from the mouth.
    const cells = [...reach()].map((key) => key.split(',').map(Number));
    expect(Math.min(...cells.map(([x]) => x!))).toBeLessThanOrEqual(3);
    expect(Math.min(...cells.map(([, y]) => y!))).toBeLessThanOrEqual(2);
    expect(Math.max(...cells.map(([, y]) => y!))).toBeGreaterThanOrEqual(cave!.height - 3);
  });

  it('still makes every way to the last chamber cross rubble', () => {
    const door = thing('D');
    const start = resolveSpot(world, { map: 'cave', at: 'm', dx: -1 });
    expect(dryReach(cave!, start).has(`${door.x},${door.y + 1}`)).toBe(false);
    expect(rubble.length).toBeGreaterThanOrEqual(10);
  });

  it('has dead ends and side rooms that are worth the walk: chests, a note, scratches and someone who is lost', () => {
    const open = reach();
    const beside = (char: string) => Object.values(DELTA).some(({ dx, dy }) => open.has(`${thing(char).x + dx},${thing(char).y + dy}`));
    for (const char of ['E', 'F', 'G', 'a', 'b', 'n', 'k', 'j']) expect(beside(char), char).toBe(true);
    expect(cave!.objects.filter((object) => object.sprite === 'chest')).toHaveLength(4);
    let state = inside({ level: 10, hp: 57, maxHp: 57 });
    for (const [char, item] of [['E', 'energydrink'], ['F', 'pizza'], ['G', 'energydrink']] as const) {
      const before = state.items[item] ?? 0;
      state = talk(state, `cave:${char}`);
      expect(state.items[item], char).toBe(before + 1);
    }
    expect(said(cave!)).toContain('I came down here to find the root cause.');
    // A dead end: the room of chest F hangs on one tunnel. Close that and it is cut off.
    const f = thing('F');
    const tunnel = cellsOf(cave!, (x, y) => walkable(x, y) && y > f.y + 1 && y < f.y + 5 && Math.abs(x - f.x) <= 3);
    expect(tunnel.length).toBeGreaterThan(0);
    const cut = reach(tunnel.map((cell) => `${cell.x},${cell.y}`));
    expect(cut.has(`${f.x - 1},${f.y}`)).toBe(false);
    expect(open.has(`${f.x - 1},${f.y}`)).toBe(true);
  });

  it('draws the post-mortem as a paper pinned to the rock and the scratches as scratches, both in a wall', () => {
    expect(thing('b').sprite).toBe('notice');
    expect(thing('a').sprite).toBe('scratches');
    expect(said(cave!)).toContain('A post-mortem, pinned to the wall.');
    expect(said(cave!)).toContain('Scratched into the rock');
    for (const char of ['a', 'b']) {
      const { x, y } = thing(char);
      // Rock to the left, to the right and above; the floor in front.
      expect([walkable(x - 1, y), walkable(x + 1, y), walkable(x, y - 1), walkable(x, y + 1)], char).toEqual([false, false, false, true]);
    }
    expect(cave!.objects.some((object) => object.sprite === 'sign')).toBe(false);
  });

  it('has the door to the last chamber in a wall that is walked up to from below, for level 5', () => {
    expect(DEEP_CAVE_LEVEL).toBe(BOSS_MIN_LEVEL.outage);
    const door = thing('D');
    expect(walkable(door.x - 1, door.y)).toBe(false);
    expect(walkable(door.x + 1, door.y)).toBe(false);
    expect(walkable(door.x, door.y + 1)).toBe(true);
    const before = { ...inside({ level: DEEP_CAVE_LEVEL - 1 }), x: door.x, y: door.y + 1, dir: 'up' as const };
    const stopped = press(before, { dir: 'up', pressed: 'up' });
    expect(stopped.y).toBe(door.y + 1);
    expect(stopped.dialogue?.pages.flat().join(' ')).toContain(`Lv ${DEEP_CAVE_LEVEL} and up`);
    // Nothing behind the door can be reached while it is shut.
    expect(reach().has(`${door.x},${door.y - 1}`)).toBe(false);
    const through = press({ ...before, level: DEEP_CAVE_LEVEL }, { dir: 'up', pressed: 'up' });
    expect(through.y).toBe(door.y);
    expect(routeTo(world, through, 'cave:B')).not.toBeNull();
  });

  it('has a boss guarding a chest with a medal and ten max energy for good, and a ladder out', () => {
    const boss = thing('B');
    const beforeBoss = { ...inside({ level: 10, hp: 57, maxHp: 57 }), x: boss.x, y: boss.y + 1, dir: 'up' as const };
    // The chest and the ladder are behind the boss: no way to them while it stands, door open or not.
    expect(reach([], ['cave:D']).has(`${thing('L').x},${thing('L').y}`)).toBe(false);
    expect(routeTo(world, beforeBoss, 'cave:C')).toBeNull();
    let state = settle(press(beforeBoss, { a: true }));
    expect(state.flags['beat:outage']).toBe(true);
    const energy = state.maxHp;
    state = talk(state, 'cave:C');
    expect(state.items.medal).toBe(1);
    expect(state.bonusHp).toBe(10);
    expect(state.maxHp).toBe(energy + 10);
    expect(state.maxHp).toBe(maxHpOf(world, state));
    state = talk(state, 'cave:C');
    expect(state.items.medal).toBe(1);
    expect(state.bonusHp).toBe(10);
    state = goTo(state, 'cave:L');
    expect(state).toMatchObject({ map: 'west', dir: 'right' });
  });

  it('has coffee at the mouth and deeper in, and a defeat only costs the walk back', () => {
    expect(cave!.objects.filter((object) => object.sprite === 'coffee')).toHaveLength(2);
    const rested = talk(inside({ hp: 5 }), 'cave:k');
    expect(rested.hp).toBe(rested.maxHp);
    expect(rested.heal.map).toBe('cave');
    const first = rubble.find((cell) => walkable(cell.x + 1, cell.y) && !tileOf(cave!, cell.x + 1, cell.y)!.grass)!;
    let lost: GameState | null = null;
    for (let seed = 1; seed < 80 && !lost?.battle; seed++) {
      lost = press({ ...rested, seed, hp: 1, xp: 30, items: { coffee: 1, stamp: 4 }, x: first.x + 1, y: first.y }, { dir: 'left', pressed: 'left' });
    }
    const after = settle(lost!);
    expect(after).toMatchObject({ map: 'cave', x: rested.heal.x, y: rested.heal.y, hp: after.maxHp, xp: 30, level: 3 });
    expect(after.items).toEqual({ coffee: 1, stamp: 4 });
  });
});

describe('the last fight', () => {
  const host = world.maps.contact!.objects.find((object) => object.id === 'contact:H')!;
  /** In the Contact Office, in front of Wesley: four badges and the level they are worth. */
  const facing = (extra: Partial<GameState> = {}): GameState => {
    const base = { ...started(), map: 'contact', x: host.x, y: host.y + 1, dir: 'up' as const, level: FINAL_LEVEL, xp: world.levels.xp[FINAL_LEVEL - 2]!, badges: world.badges.map((badge) => badge.id) };
    const energy = maxHpOf(world, base);
    return { ...base, hp: energy, maxHp: energy, ...extra };
  };
  /** Presses A to the end and writes down what happened on the way. */
  function watch(from: GameState) {
    let state = from;
    const battles: { enemy: string; hp: number; max: number; pp: number; finished: boolean }[] = [];
    const said: string[] = [];
    let seen = '';
    for (let i = 0; i < 900 && (state === from || busy(state)); i++) {
      const next = step(state, { ...NO_INPUT, a: true }, world, { instant: true });
      state = next.state;
      said.push(...next.events.map((event) => event.text));
      if (state.battle && state.battle.enemy !== seen) {
        seen = state.battle.enemy;
        battles.push({ enemy: seen, hp: state.hp, max: state.maxHp, pp: state.pp[state.moves[0]!]!, finished: state.finished });
      }
    }
    return { state, battles, said };
  }

  it('is three battles in a row, in order, each from full energy and full PP, and only then the ending', () => {
    const { state, battles, said } = watch(facing());
    expect(battles.map((battle) => battle.enemy)).toEqual(FINAL_BOSSES);
    for (const battle of battles) {
      expect(battle.hp, battle.enemy).toBe(battle.max);
      expect(battle.max, battle.enemy).toBeGreaterThanOrEqual(facing().maxHp);
      expect(battle.pp, battle.enemy).toBe(world.moves[world.playerMoves[0]!]!.pp);
      expect(battle.finished).toBe(false);
    }
    expect(state.finished).toBe(true);
    expect(state.scene).toBe('ending');
    const text = said.join('\n');
    // The contact details come after the last boss is beaten, not before.
    const email = text.indexOf('how to reach me');
    expect(email).toBeGreaterThan(text.indexOf(world.enemies.impostor!.defeat));
    expect(text.indexOf('Hired!')).toBeGreaterThan(text.indexOf(world.enemies.interview!.defeat));
    expect(text.indexOf('JOB INTERVIEW wants to battle!')).toBeLessThan(text.indexOf('YEARLY REVIEW wants to battle!'));
    expect(text.indexOf('YEARLY REVIEW wants to battle!')).toBeLessThan(text.indexOf('THE IMPOSTOR wants to battle!'));
    for (const id of FINAL_BOSSES) expect(state.flags[`beat:${id}`]).toBe(true);
  });

  it('does not give the contact details away before it: the first thing Wesley does is fight', () => {
    let state = press(facing(), { a: true });
    const before: string[] = [];
    for (let i = 0; i < 20 && state.dialogue; i++) {
      before.push(state.dialogue.pages[state.dialogue.page]!.join(' '));
      state = press(state, { a: true });
    }
    expect(state.battle?.enemy).toBe('interview');
    expect(before.join(' ')).toContain(profile.name);
    expect(before.join(' ')).not.toContain(profile.links.email);
    expect(state.finished).toBe(false);
  });

  it('plays its own tune, and Wesley keeps facing the player through it', () => {
    let state = press(facing(), { a: true });
    for (let i = 0; i < 20 && state.dialogue; i++) state = press(state, { a: true });
    expect(trackFor(state, world)).toBe('final');
    expect(TRACKS.final?.loop).toBe(true);
    expect(TRACKS.final).not.toBe(TRACKS[world.music!.boss]);
    expect(state.face).toEqual({ id: 'contact:H', dir: 'down' });
  });

  it('loses nothing on a defeat, and goes on with the boss that won', () => {
    // Too weak for the second boss: one energy left when it starts.
    const weak = facing({ flags: { 'beat:interview': true }, hp: 1, items: { coffee: 2, stamp: 3 } });
    let state = press(weak, { a: true });
    for (let i = 0; i < 20 && state.dialogue; i++) state = press(state, { a: true });
    expect(state.battle?.enemy).toBe('review');
    // Lose on purpose: energy 1, and the boss always gets a turn. Take the rest (the last move) so nothing is hit.
    state = { ...state, hp: 1, maxHp: 1 };
    for (let i = 0; i < 300 && state.battle; i++) state = press(state, { a: true });
    state = settle(state);
    expect(state.finished).toBe(false);
    expect(state.flags['beat:interview']).toBe(true);
    expect(state.flags['beat:review']).toBeUndefined();
    expect(state.items).toEqual({ coffee: 2, stamp: 3 });
    expect(state.badges).toHaveLength(4);
    // Again: the second boss, not the first.
    const again = watch({ ...facing({ flags: state.flags }) });
    expect(again.battles.map((battle) => battle.enemy)).toEqual(['review', 'impostor']);
    expect(again.state.finished).toBe(true);
    expect(watch(facing({ flags: { 'beat:interview': true, 'beat:review': true } })).battles.map((battle) => battle.enemy)).toEqual(['impostor']);
  });

  it('is only reached with every badge: the door of the Contact Office still asks for them', () => {
    const door = town!.objects.find((object) => object.id === 'town:P')!;
    expect(door.branches[0]!.when).toEqual({ badges: world.badges.length });
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

describe('small things that looked wrong', () => {
  it('rims the pond of Hobby Hills with a shore, not with the hedge of the Library', () => {
    const sprites = (map: GameMap) => new Set(map.cells.flat().map((char) => map.tiles[char]!.sprite));
    expect(sprites(hills!)).toContain('shore');
    expect(sprites(hills!)).not.toContain('hedge');
    expect(sprites(town!)).toContain('hedge');
    expect(sprites(town!)).not.toContain('shore');
    // Every water cell of the hills has water or shore on all four sides.
    const wet = ['water', 'lily', 'duck'];
    for (const cell of cellsOf(hills!, (x, y) => wet.includes(tileOf(hills!, x, y)!.sprite))) {
      for (const { dx, dy } of Object.values(DELTA)) {
        expect([...wet, 'shore'], `${cell.x + dx},${cell.y + dy}`).toContain(tileOf(hills!, cell.x + dx, cell.y + dy)!.sprite);
      }
    }
  });

  it('stands the water cooler of the Office against the wall by the coffee machine, out of the walkway', () => {
    const office = world.maps.office!;
    const coolers = cellsOf(office, (x, y) => tileOf(office, x, y)!.sprite === 'cooler');
    expect(coolers).toHaveLength(1);
    const cooler = coolers[0]!;
    const coffee = office.objects.find((object) => object.sprite === 'coffee')!;
    expect(cooler).toEqual({ x: coffee.x, y: coffee.y - 1 });
    // In the corner: wall to its right and above it.
    expect(tileOf(office, cooler.x + 1, cooler.y)!.sprite).toBe('iwall');
    expect(tileOf(office, cooler.x, cooler.y - 1)!.solid).toBe(true);
    // The row under the wall is free from the left wall to the cooler: nothing stands in the middle of it.
    for (let x = 1; x < cooler.x; x++) expect(tileOf(office, x, cooler.y)!.solid, String(x)).toBe(false);
  });
});

describe('round five, the small things', () => {
  it('gives the gardener the flower bed he talks about', () => {
    const gardener = town!.objects.find((object) => object.sprite === 'gardener')!;
    const beds = cellsOf(town!, (x, y) => tileOf(town!, x, y)!.sprite === 'flowerbed');
    const near = beds.filter((bed) => Math.max(Math.abs(bed.x - gardener.x), Math.abs(bed.y - gardener.y)) <= 1);
    expect(near.length).toBeGreaterThanOrEqual(2);
    expect(said(town!)).toMatch(/I named this flower bed/);
  });

  it('has no lamp posts on the plaza any more, and a light fence beside it that leaves the roads open', () => {
    const door = town!.objects.find((object) => object.id === 'town:P')!;
    const plaza = cellsOf(town!, (x, y) => tileOf(town!, x, y)!.sprite === 'cobble' && y > door.y && y <= door.y + 3 && Math.abs(x - door.x) <= 4);
    const lamps = cellsOf(town!, (x, y) => tileOf(town!, x, y)!.sprite === 'lamp');
    for (const lamp of lamps) expect(lamp.y <= door.y + 3 && Math.abs(lamp.x - door.x) <= 5, `${lamp.x},${lamp.y}`).toBe(false);
    const left = Math.min(...plaza.map((cell) => cell.x));
    const right = Math.max(...plaza.map((cell) => cell.x));
    const fence = (x: number, y: number) => tileOf(town!, x, y)?.sprite === 'fence';
    const rows = [door.y + 1, door.y + 2, door.y + 3];
    expect(rows.some((y) => fence(left - 1, y))).toBe(true);
    expect(rows.filter((y) => fence(right + 1, y)).length).toBeGreaterThanOrEqual(2);
    // Light: a handful of posts, and none on or across a road.
    const posts = cellsOf(town!, (x, y) => fence(x, y) && y <= door.y + 3 && Math.abs(x - door.x) <= 6);
    expect(posts.length).toBeLessThanOrEqual(6);
    for (let x = left; x <= right; x++) expect(fence(x, door.y + 4), String(x)).toBe(false);
    expect(tileOf(town!, door.x, door.y + 3)!.road).toBe(true);
  });

  it('lets the player walk on the shore of the pond, and not on the water', () => {
    for (const tile of Object.values(hills!.tiles)) {
      if (tile.sprite === 'shore') expect(tile.solid).toBe(false);
      if (['water', 'lily', 'duck'].includes(tile.sprite)) expect(tile.solid).toBe(true);
    }
    const shore = cellsOf(hills!, (x, y) => tileOf(hills!, x, y)!.sprite === 'shore');
    expect(shore.length).toBeGreaterThanOrEqual(16);
    const reach = dryReach(hills!, resolveSpot(world, { map: 'hills', at: '(', dx: 1 }));
    for (const cell of shore) expect(reach.has(`${cell.x},${cell.y}`), `${cell.x},${cell.y}`).toBe(true);
    // All the way round on the sand.
    const state = goTo(at('hills', '(', {}, 1), 'hills:?');
    const walked = press({ ...state, x: shore[0]!.x, y: shore[0]!.y - 1, dir: 'down' }, { dir: 'down', pressed: 'down' });
    expect({ x: walked.x, y: walked.y }).toEqual(shore[0]);
  });
});
