import { execFileSync } from 'node:child_process';
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
import { lit } from '../engine/light.ts';
import { fold } from '../engine/text.ts';
import { NO_INPUT, type Action, type Dir, type GameMap, type GameObject, type GameState, type Input } from '../engine/types.ts';
import { placeOf } from '../engine/wander.ts';
import { BOSS_TICKS, QUICK_TICKS, curtainOf } from '../engine/transition.ts';
import { DELTA, landing, resolveSpot } from '../engine/world.ts';
import { coinsFor } from '../engine/shop.ts';
import { AREAS, BOSS_MIN_LEVEL, CAVE_LEVEL, DEEP_CAVE_LEVEL, FINAL_BOSSES, FINAL_LEVEL, REWARDS, STAMP } from './battles.ts';
import { TRACKS } from './music.ts';
import { DEEP_FLAGS, DEEP_TEXT, FINALE, HILLS_FOLK, HOBBIES, ROUTE_BACK, STOP_NAMES } from './story.ts';
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

type Cell = { x: number; y: number };
const DIRS = Object.keys(DELTA) as Dir[];
const keyOf = (cell: Cell) => `${cell.x},${cell.y}`;
const keyOfPair = ([x, y]: [number, number]) => `${x},${y}`;
/** Whether the player can stand on a cell: ground that is not solid, with nothing solid on it. */
const standable = (map: GameMap, x: number, y: number) => {
  const tile = tileOf(map, x, y);
  return !!tile && !tile.solid && !map.objects.some((object) => object.x === x && object.y === y && object.solid);
};
/**
 * Where one press takes the player from a cell, as the engine moves: a step, or a hop over a ledge that is jumped
 * that way (`ledges` off: as if the ledges were plain walls).
 */
function moves(map: GameMap, cell: Cell, ledges = true): Cell[] {
  return DIRS.flatMap((dir) => {
    const to = landing(map, cell.x, cell.y, dir);
    return to && (ledges || !to.jump) && standable(map, to.x, to.y) ? [{ x: to.x, y: to.y }] : [];
  });
}
/** The fewest cells of tall grass that must be stepped on to get from a cell to each cell that can be reached. */
function grassTo(map: GameMap, from: Cell, ledges = true): Map<string, number> {
  const best = new Map([[keyOf(from), 0]]);
  const queue = [{ ...from, cost: 0 }];
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const cell = queue.shift()!;
    if (cell.cost > best.get(keyOf(cell))!) continue;
    for (const to of moves(map, cell, ledges)) {
      const cost = cell.cost + (tileOf(map, to.x, to.y)!.grass ? 1 : 0);
      if ((best.get(keyOf(to)) ?? Infinity) <= cost) continue;
      best.set(keyOf(to), cost);
      queue.push({ ...to, cost });
    }
  }
  return best;
}

/** What is water, and what stands in it or lies on it. */
const WET = ['water', 'lily', 'duck', 'reeds'];
const ON_WATER = ['jetty', 'stones'];
/** The cells of the pond the duck swims in: the water that hangs together with it. A stepping stone ends it. */
function pondOf(map: GameMap): Cell[] {
  const duck = cellsOf(map, (x, y) => tileOf(map, x, y)!.sprite === 'duck')[0]!;
  const seen = new Set([keyOf(duck)]);
  const queue = [duck];
  for (let cell = queue.shift(); cell; cell = queue.shift()) {
    for (const { dx, dy } of Object.values(DELTA)) {
      const next = { x: cell.x + dx, y: cell.y + dy };
      if (seen.has(keyOf(next)) || !WET.includes(tileOf(map, next.x, next.y)?.sprite ?? '')) continue;
      seen.add(keyOf(next));
      queue.push(next);
    }
  }
  return [...seen].map((key) => ({ x: Number(key.split(',')[0]), y: Number(key.split(',')[1]) }));
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

  // The two roads are routes. `town` is where the road comes in from town, `far` where it leads: the cell the
  // player stands on at that end (for the cave mouth, which is a door in the rock, the cell in front of it).
  // `back` is the way home, and the only way the ledges are hopped.
  const ROUTES = [
    { map: east!, town: resolveSpot(world, { map: 'east', at: '(' }), far: resolveSpot(world, { map: 'east', at: ')' }), back: 'left' },
    { map: west!, town: resolveSpot(world, { map: 'west', at: ')' }), far: resolveSpot(world, { map: 'west', at: 'D', dx: 1 }), back: 'right' },
  ] as const;
  const ledgesOf = (map: GameMap) => cellsOf(map, (x, y) => !!tileOf(map, x, y)!.ledge);

  it('cannot be walked out without the tall grass: two bands of it lie across the way, five cells each at the least', () => {
    for (const { map, town, far } of ROUTES) {
      const out = grassTo(map, town).get(keyOf(far));
      expect(out, map.id).toBeGreaterThanOrEqual(10);
      // Fair, not a slog: no more than a handful of steps in it per band.
      expect(out, map.id).toBeLessThanOrEqual(14);
      expect(cellsOf(map, (x, y) => !!tileOf(map, x, y)!.grass).length, map.id).toBeGreaterThanOrEqual(30);
    }
  });

  it('can be walked back dry, by hopping down the ledges, which only go that way', () => {
    for (const { map, town, far, back } of ROUTES) {
      expect(grassTo(map, far).get(keyOf(town)), map.id).toBe(0);
      // Without the hops the way back is the way out: through the grass.
      expect(grassTo(map, far, false).get(keyOf(town)), map.id).toBeGreaterThanOrEqual(10);
      const ledges = ledgesOf(map);
      // Two lines of them across the road, some distance apart.
      const lines = [...new Set(ledges.map((cell) => cell.x))].sort((a, b) => a - b);
      expect(lines, map.id).toHaveLength(2);
      expect(lines[1]! - lines[0]!, map.id).toBeGreaterThanOrEqual(6);
      for (const line of lines) expect(tileOf(map, line, town.y)!.ledge, `${map.id} ${line}`).toBe(back);
      for (const cell of ledges) {
        const tile = tileOf(map, cell.x, cell.y)!;
        expect(tile.ledge, `${map.id} ${keyOf(cell)}`).toBe(back);
        // A wall for everyone and everything that does not hop it.
        expect(tile.solid).toBe(true);
        // Room to take off and to land: plain ground, nothing on it.
        const { dx } = DELTA[back];
        expect(standable(map, cell.x - dx, cell.y), `${map.id} ${keyOf(cell)} take-off`).toBe(true);
        expect(standable(map, cell.x + dx, cell.y), `${map.id} ${keyOf(cell)} landing`).toBe(true);
        expect(tileOf(map, cell.x + dx, cell.y)!.grass, `${map.id} ${keyOf(cell)} landing`).toBeFalsy();
      }
    }
    // Only the routes have ledges.
    for (const map of Object.values(world.maps)) if (map !== east && map !== west) expect(ledgesOf(map), map.id).toEqual([]);
  });

  it('never trap the player: from every cell that can be stood on, both ends can be reached', () => {
    for (const { map, town, far } of ROUTES) {
      const fromTown = grassTo(map, town);
      const cells = cellsOf(map, (x, y) => standable(map, x, y));
      expect(cells.length, map.id).toBeGreaterThan(100);
      for (const cell of cells) {
        // No pocket that cannot be walked into, and none that cannot be walked out of.
        expect(fromTown.has(keyOf(cell)), `${map.id} ${keyOf(cell)} from town`).toBe(true);
        const reach = grassTo(map, cell);
        expect(reach.has(keyOf(town)), `${map.id} ${keyOf(cell)} to the town end`).toBe(true);
        expect(reach.has(keyOf(far)), `${map.id} ${keyOf(cell)} to the far end`).toBe(true);
      }
    }
  });

  it('have a coffee machine that is reached dry from both ends, for after a rough battle', () => {
    for (const { map, town, far } of ROUTES) {
      const machines = map.objects.filter((object) => object.sprite === 'coffee');
      expect(machines, map.id).toHaveLength(1);
      const beside = (reach: Map<string, number>) => Object.values(DELTA).some(({ dx, dy }) => reach.get(`${machines[0]!.x + dx},${machines[0]!.y + dy}`) === 0);
      expect(beside(grassTo(map, town)), `${map.id} from town`).toBe(true);
      expect(beside(grassTo(map, far)), `${map.id} from the far end`).toBe(true);
    }
  });

  it('are walked back in the engine with one key held: two hops, no step in the grass, no battle', () => {
    for (const { map, town, far, back } of ROUTES) {
      let state: GameState = { ...started(), map: map.id, x: far.x, y: far.y, dir: back, area: map.name };
      const cues: string[] = [];
      for (let i = 0; i < 40 && state.map === map.id; i++) {
        const next = step(state, { ...NO_INPUT, dir: back, pressed: back }, world, { instant: true });
        cues.push(...next.cues);
        state = next.state;
        expect(state.battle, `${map.id} ${state.x},${state.y}`).toBeNull();
        if (state.map === map.id) expect(tileOf(map, state.x, state.y)!.grass, `${map.id} ${state.x},${state.y}`).toBeFalsy();
      }
      expect(state.map, map.id).toBe('town');
      expect(cues.filter((cue) => cue === 'jump'), map.id).toHaveLength(2);
      expect(cues).not.toContain('bump');
      // Walking out along the road, the first ledge is a wall.
      let out: GameState = { ...started(), map: map.id, x: town.x, y: town.y, area: map.name };
      const ahead = back === 'left' ? 'right' : 'left';
      for (let i = 0; i < 40; i++) out = press(out, { dir: ahead, pressed: ahead });
      expect(out.map, map.id).toBe(map.id);
      expect(tileOf(map, out.x + DELTA[ahead].dx, out.y)!.ledge, map.id).toBe(back);
      expect(Math.abs(out.x - far.x), map.id).toBeGreaterThan(5);
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

  it('say on their signposts how strong the wild things are, that the way out crosses the grass and the way back does not', () => {
    for (const map of [east!, west!]) {
      expect(said(map), map.id).toContain('The way there crosses tall grass.');
      expect(said(map), map.id).toContain(ROUTE_BACK);
      expect(said(map), map.id).not.toMatch(/road itself is safe/i);
    }
    expect(ROUTE_BACK).toMatch(/ledges/);
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

  it('rewards a full card with a charm, a lunch and some coins, once', () => {
    let state = at('hills', '(', {}, 1);
    state = talk(state, 'hills:?');
    expect(state.items.omamori).toBeUndefined();
    for (const stop of HOBBIES) state = talk(state, `hills:${stop.at}`);
    expect(state.items[STAMP]).toBe(10);
    const purse = state.coins;
    state = talk(state, 'hills:?');
    expect(state.items).toMatchObject({ omamori: 1, bento: 1 });
    expect(state.flags['rally:done']).toBe(true);
    expect(REWARDS.rally).toBeGreaterThan(0);
    expect(state.coins).toBe(purse + REWARDS.rally);
    state = talk(state, 'hills:?');
    expect(state.items).toMatchObject({ omamori: 1, bento: 1 });
    expect(state.coins).toBe(purse + REWARDS.rally);
    expect(world.items.bento!.heal).toBeGreaterThan(0);
  });
});

describe('Hobby Hills as a place', () => {
  const entrance = resolveSpot(world, { map: 'hills', at: '(', dx: 1 });
  const thing = (char: string) => hills!.objects.find((object) => object.id === `hills:${char}`)!;
  const stopsOf = () => HOBBIES.map((stop) => ({ ...stop, ...thing(stop.at) }));
  const strollers = hills!.objects.filter((object) => object.wander);
  const spritesUsed = new Set(hills!.cells.flat().map((char) => hills!.tiles[char]!.sprite));
  const onlyTalks = (char: string) => thing(char).branches.flatMap((branch) => deep(branch.do)).every((action) => 'say' in action);
  /** The road cells that hang together with a cell (the entrance, unless told otherwise), with some cells closed. */
  function roads(closed: string[] = [], from: Cell = entrance): Set<string> {
    const seen = new Set([keyOf(from)]);
    const queue: Cell[] = [from];
    for (let cell = queue.shift(); cell; cell = queue.shift()) {
      for (const { dx, dy } of Object.values(DELTA)) {
        const next = { x: cell.x + dx, y: cell.y + dy };
        if (seen.has(keyOf(next)) || closed.includes(keyOf(next)) || !tileOf(hills!, next.x, next.y)?.road) continue;
        seen.add(keyOf(next));
        queue.push(next);
      }
    }
    return seen;
  }
  /** How many steps it is from a road to a cell beside a thing, over ground that can be stood on. */
  function stepsFromRoad(object: { x: number; y: number }): number {
    const network = roads();
    const start = Object.values(DELTA).map(({ dx, dy }) => ({ x: object.x + dx, y: object.y + dy })).filter((cell) => standable(hills!, cell.x, cell.y));
    const seen = new Set(start.map(keyOf));
    let front = start;
    for (let steps = 0; front.length > 0; steps++) {
      if (front.some((cell) => network.has(keyOf(cell)))) return steps;
      front = front.flatMap((cell) => moves(hills!, cell)).filter((cell) => !seen.has(keyOf(cell)) && !!seen.add(keyOf(cell)));
    }
    return Infinity;
  }

  it('has a ring road that is one closed loop, with the entrance on it', () => {
    const network = roads();
    const cells = [...network].map((key) => ({ x: Number(key.split(',')[0]), y: Number(key.split(',')[1]) }));
    // The entrance meets the ring at its left side; its top and bottom are where that side ends.
    const left = entrance.x + 1;
    const side = cells.filter((cell) => cell.x === left).map((cell) => cell.y);
    const top = Math.min(...side);
    const bottom = Math.max(...side);
    const right = Math.max(...cells.filter((cell) => cell.y === top).map((cell) => cell.x));
    // It goes round most of the map.
    expect(right - left).toBeGreaterThanOrEqual(hills!.width - 8);
    expect(bottom - top).toBeGreaterThanOrEqual(hills!.height - 10);
    const ring = cellsOf(hills!, (x, y) => x >= left && x <= right && y >= top && y <= bottom && (x === left || x === right || y === top || y === bottom));
    for (const cell of ring) expect(network.has(keyOf(cell)), keyOf(cell)).toBe(true);
    // A loop: with any one cell of it closed, the rest is still one road.
    for (const cell of ring) {
      const rest = roads([keyOf(cell)], ring.find((other) => other !== cell));
      expect(ring.every((other) => other === cell || rest.has(keyOf(other))), keyOf(cell)).toBe(true);
    }
    // Paths lead from the ring to the pond, on three sides of it at the least.
    const paths = cells.filter((cell) => cell.x > left && cell.x < right && cell.y > top && cell.y < bottom);
    const atShore = paths.filter((cell) => Object.values(DELTA).some(({ dx, dy }) => tileOf(hills!, cell.x + dx, cell.y + dy)!.sprite === 'shore'));
    expect(atShore.length).toBeGreaterThanOrEqual(3);
    // Nothing that strolls is ever dropped onto it: the way in is a road cell.
    expect(tileOf(hills!, entrance.x, entrance.y)!.road).toBe(true);
  });

  it('keeps every stop easy to find: on the ring road or a path, or three steps from one at the most', () => {
    for (const stop of stopsOf()) expect(stepsFromRoad(stop), stop.id).toBeLessThanOrEqual(3);
    // Most of them are right beside a road or one step from it.
    expect(stopsOf().filter((stop) => stepsFromRoad(stop) <= 1).length).toBeGreaterThanOrEqual(7);
    // The rally keeper and the coffee machine too.
    expect(stepsFromRoad(thing('?'))).toBeLessThanOrEqual(1);
    expect(stepsFromRoad(thing('k'))).toBeLessThanOrEqual(1);
  });

  it('has signposts that name every stop, at the entrance and at two corners of the ring', () => {
    const signs = hills!.objects.filter((object) => object.sprite === 'sign');
    expect(signs.length).toBeGreaterThanOrEqual(3);
    for (const sign of signs) expect(stepsFromRoad(sign), sign.id).toBe(0);
    const text = said(hills!);
    for (const stop of HOBBIES) {
      expect(STOP_NAMES[stop.id], stop.id).toBeDefined();
      expect(text, stop.id).toContain(`the ${STOP_NAMES[stop.id]}`);
    }
    expect(Object.keys(STOP_NAMES).sort()).toEqual(HOBBIES.map((stop) => stop.id).sort());
    expect(text).toContain('The ring road passes every stop');
  });

  it('is no longer mostly grass: water, sand, cobbles, fences, flower beds, benches, trees and houses', () => {
    for (const sprite of ['water', 'shore', 'reeds', 'jetty', 'stones', 'bridge', 'cobble', 'fence', 'flowerbed', 'flowers', 'bench', 'tree', 'pine', 'bush', 'boulder', 'lamp', 'roof', 'wall', 'pane', 'tin', 'planks']) {
      expect(spritesUsed, sprite).toContain(sprite);
    }
    // Inside the border of trees, less than two cells in five are plain grass.
    const inside = cellsOf(hills!, (x, y) => x > 0 && y > 0 && x < hills!.width - 1 && y < hills!.height - 1);
    const plain = inside.filter((cell) => tileOf(hills!, cell.x, cell.y)!.sprite === 'grass' && !hills!.objects.some((object) => object.x === cell.x && object.y === cell.y));
    expect(plain.length / inside.length).toBeLessThan(0.4);
    // Still no tall grass, and nothing wild.
    expect(spritesUsed).not.toContain('tallgrass');
    expect(hills!.encounters).toBeUndefined();
  });

  it('has a stream out of the pond, with stepping stones over it and a bridge under the ring road', () => {
    const wet = (x: number, y: number) => WET.includes(tileOf(hills!, x, y)?.sprite ?? '');
    const pond = new Set(pondOf(hills!).map(keyOf));
    const stream = cellsOf(hills!, (x, y) => wet(x, y) && !pond.has(`${x},${y}`));
    expect(stream.length).toBeGreaterThanOrEqual(6);
    const stones = cellsOf(hills!, (x, y) => tileOf(hills!, x, y)!.sprite === 'stones');
    expect(stones.length).toBeGreaterThanOrEqual(2);
    const reach = dryReach(hills!, entrance);
    for (const cell of stones) {
      // Water on two opposite sides, ground to step from and to on the other two.
      const across = [DELTA.left, DELTA.right].every(({ dx }) => wet(cell.x + dx, cell.y)) ? [DELTA.up, DELTA.down] : [DELTA.left, DELTA.right];
      for (const { dx, dy } of across) expect(standable(hills!, cell.x + dx, cell.y + dy), keyOf(cell)).toBe(true);
      expect(reach.has(keyOf(cell)), keyOf(cell)).toBe(true);
    }
    const bridges = cellsOf(hills!, (x, y) => tileOf(hills!, x, y)!.sprite === 'bridge');
    expect(bridges).toHaveLength(1);
    expect(roads().has(keyOf(bridges[0]!))).toBe(true);
    expect(wet(bridges[0]!.x - 1, bridges[0]!.y) && wet(bridges[0]!.x + 1, bridges[0]!.y)).toBe(true);
    // Both banks of the stream can be walked to without crossing the road: the stones are the way over.
    expect(reach.has(`${stones.at(-1)!.x},${stones.at(-1)!.y - 1}`)).toBe(true);
    expect(reach.has(`${stones.at(-1)!.x},${stones.at(-1)!.y + 1}`)).toBe(true);
  });

  it('has houses nobody is home in: a door with a note under a roof of two rows, on a road', () => {
    const doors = hills!.objects.filter((object) => object.sprite?.startsWith('door'));
    expect(doors.length).toBeGreaterThanOrEqual(3);
    const roofs = new Set<string>();
    for (const door of doors) {
      expect(door.trigger, door.id).toBe('interact');
      expect(onlyTalks(door.id.split(':')[1]!), door.id).toBe(true);
      const roof = tileOf(hills!, door.x, door.y - 1)!.sprite;
      expect(['roof', 'tin', 'slate', 'shingle'], door.id).toContain(roof);
      roofs.add(roof);
      // A proper roof: two rows of it over the whole front (the door and the wall on both sides), and no third.
      for (const dx of [-1, 0, 1]) {
        for (const dy of [-1, -2]) expect(tileOf(hills!, door.x + dx, door.y + dy)!.sprite, `${door.id} roof at ${door.x + dx},${door.y + dy}`).toBe(roof);
        expect(tileOf(hills!, door.x + dx, door.y - 3)!.sprite, door.id).not.toBe(roof);
      }
      expect(tileOf(hills!, door.x, door.y + 1)!.road, door.id).toBe(true);
      expect(roads().has(`${door.x},${door.y + 1}`), door.id).toBe(true);
      // Walls on both sides of it.
      expect(tileOf(hills!, door.x - 1, door.y)!.solid && tileOf(hills!, door.x + 1, door.y)!.solid, door.id).toBe(true);
    }
    expect(roofs.size).toBeGreaterThanOrEqual(2);
  });

  it('has people who talk about the hobbies, some standing and some strolling, and all of them optional', () => {
    const first = profile.name.split(' ')[0]!;
    const text = said(hills!);
    for (const lines of [HILLS_FOLK.gamer(first), HILLS_FOLK.keeper(first), HILLS_FOLK.kid(), HILLS_FOLK.angler(), HILLS_FOLK.dog(), HILLS_FOLK.cat()]) {
      for (const line of lines) {
        expect(text).toContain(line);
        expect(fold(line).length, line).toBeLessThanOrEqual(110);
      }
    }
    expect(HILLS_FOLK.gamer(first).join(' ')).toContain(first);
    const people = hills!.objects.filter((object) => ['dev', 'gardener', 'elder', 'kid', 'dog', 'cat', 'maker'].includes(object.sprite ?? '') && !HOBBIES.some((stop) => `hills:${stop.at}` === object.id));
    expect(people.length).toBeGreaterThanOrEqual(7);
    expect(strollers.length).toBeGreaterThanOrEqual(3);
    expect(people.filter((object) => !object.wander).length).toBeGreaterThanOrEqual(4);
    for (const person of people) if (person.id !== 'hills:?') expect(onlyTalks(person.id.split(':')[1]!), person.id).toBe(true);
    // The angler stands on the jetty, at its end: water ahead and on both sides.
    const angler = thing('E');
    expect(tileOf(hills!, angler.x, angler.y)!.sprite).toBe('jetty');
    expect(tileOf(hills!, angler.x, angler.y + 1)!.sprite).toBe('jetty');
    expect(WET).toContain(tileOf(hills!, angler.x, angler.y - 1)!.sprite);
  });

  it('lets the ones who stroll walk for minutes without a step on a road, on a thing, on each other or out of range', () => {
    for (const a of strollers) {
      for (const b of strollers) {
        if (a !== b) expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)), `${a.id} and ${b.id}`).toBeGreaterThan(a.wander!.radius + b.wander!.radius);
      }
    }
    const seen = new Map(strollers.map((object) => [object.id, new Set<string>()]));
    let state = at('hills', '(', {}, 1);
    for (let tick = 0; tick < 20_000; tick++) {
      state = step(state, NO_INPUT, world).state;
      const places = strollers.map((object) => placeOf(object, state));
      strollers.forEach((object, i) => {
        const spot = places[i]!;
        const tile = tileOf(hills!, spot.x, spot.y)!;
        if (tile.solid || tile.road || tile.grass) throw new Error(`${object.id} stands on ${tile.sprite} at ${spot.x},${spot.y}`);
        if (Math.max(Math.abs(spot.x - object.x), Math.abs(spot.y - object.y)) > object.wander!.radius) throw new Error(`${object.id} left its range`);
        if (hills!.objects.some((other) => other !== object && !other.wander && other.x === spot.x && other.y === spot.y)) throw new Error(`${object.id} stands on a thing at ${spot.x},${spot.y}`);
        seen.get(object.id)!.add(keyOf(spot));
      });
    }
    for (const [id, cells] of seen) expect(cells.size, id).toBeGreaterThan(3);
  });

  it('never lets a stroller shut a stop, the keeper or the coffee off: there is a second cell to stand on, or one out of their reach', () => {
    const inRange = (cell: Cell) => strollers.some((object) => Math.max(Math.abs(cell.x - object.x), Math.abs(cell.y - object.y)) <= object.wander!.radius && !tileOf(hills!, cell.x, cell.y)!.road);
    for (const target of [...stopsOf(), thing('?'), thing('k'), thing('E')]) {
      const beside = Object.values(DELTA).map(({ dx, dy }) => ({ x: target.x + dx, y: target.y + dy })).filter((cell) => standable(hills!, cell.x, cell.y));
      const free = beside.filter((cell) => !inRange(cell));
      expect(free.length > 0 || beside.length >= 2, target.id).toBe(true);
    }
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

  it('switches to the wild tune for a cave monster', () => {
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
  });

  it('is a cave, not a tunnel: rooms, and more than one way to its main rooms', () => {
    // The room in the far west, with the second coffee machine: no single patch of rubble is the only way there.
    const j = thing('j');
    const front = `${j.x + 1},${j.y}`;
    expect(reach().has(front)).toBe(true);
    for (const cell of rubble) expect(reach([`${cell.x},${cell.y}`]).has(front), `${cell.x},${cell.y}`).toBe(true);
    // Rooms: at least four places where a 3 by 3 block is open floor.
    const rooms = cellsOf(cave!, (x, y) => [0, 1, 2].every((dy) => [0, 1, 2].every((dx) => walkable(x + dx, y + dy))));
    expect(rooms.length).toBeGreaterThanOrEqual(4);
    // It fills the map in all directions from the mouth.
    const cells = [...reach()].map((key) => key.split(',').map(Number));
    expect(Math.min(...cells.map(([x]) => x!))).toBeLessThanOrEqual(3);
    expect(Math.min(...cells.map(([, y]) => y!))).toBeLessThanOrEqual(2);
    expect(Math.max(...cells.map(([, y]) => y!))).toBeGreaterThanOrEqual(cave!.height - 3);
    expect(rubble.length).toBeGreaterThanOrEqual(10);
  });

  it('has dead ends and side rooms that are worth the walk: chests, a note, scratches and someone who is lost', () => {
    const open = reach();
    const beside = (char: string) => Object.values(DELTA).some(({ dx, dy }) => open.has(`${thing(char).x + dx},${thing(char).y + dy}`));
    for (const char of ['E', 'F', 'G', 'a', 'b', 'd', 'n', 'k', 'j']) expect(beside(char), char).toBe(true);
    // The prize went down a floor with the boss: three chests are left up here.
    expect(cave!.objects.filter((object) => object.sprite === 'chest')).toHaveLength(3);
    let state = inside({ level: 10, hp: 57, maxHp: 57 });
    for (const [char, item] of [['E', 'energydrink'], ['F', 'pizza'], ['G', 'energydrink']] as const) {
      const before = state.items[item] ?? 0;
      state = talk(state, `cave:${char}`);
      expect(state.items[item], char).toBe(before + 1);
    }
    expect(said(cave!)).toContain('I came down here to find the root cause.');
    // A dead end: the room of chest F hangs on one tunnel. Close that and it is cut off.
    const f = thing('F');
    const tunnel = cellsOf(cave!, (x, y) => walkable(x, y) && y > f.y + 1 && y < f.y + 5 && Math.abs(x - f.x) <= 1);
    expect(tunnel.length).toBeGreaterThan(0);
    const cut = reach(tunnel.map((cell) => `${cell.x},${cell.y}`));
    expect(cut.has(`${f.x + 1},${f.y}`)).toBe(false);
    expect(open.has(`${f.x + 1},${f.y}`)).toBe(true);
  });

  it('draws the post-mortem as a paper pinned to the rock and the scratches as scratches, both in a wall', () => {
    expect(thing('b').sprite).toBe('notice');
    expect(thing('a').sprite).toBe('scratches');
    expect(said(cave!)).toContain('A post-mortem, pinned to the wall.');
    expect(said(cave!)).toContain('Scratched into the rock');
    for (const char of ['a', 'b', 'd']) {
      const { x, y } = thing(char);
      // Rock to the left, to the right and above; the floor in front.
      expect([walkable(x - 1, y), walkable(x + 1, y), walkable(x, y - 1), walkable(x, y + 1)], char).toEqual([false, false, false, true]);
    }
    expect(cave!.objects.some((object) => object.sprite === 'sign')).toBe(false);
  });

  it('no longer has the last chamber: its doorway in the middle is bricked up, and the boss is not on this floor', () => {
    const wall = thing('d');
    expect(wall.sprite).toBe('scratches');
    expect(said(cave!)).toContain(DEEP_TEXT.bricked[0]!);
    // The short tunnel up from the middle room ends at it.
    expect(reach().has(`${wall.x},${wall.y + 1}`)).toBe(true);
    expect(walkable(wall.x, wall.y - 1)).toBe(false);
    const ids = cave!.objects.map((object) => object.id);
    for (const gone of ['cave:D', 'cave:B', 'cave:C']) expect(ids).not.toContain(gone);
    const battles = cave!.objects.flatMap((object) => object.branches.flatMap((branch) => deep(branch.do))).filter((action) => 'battle' in action);
    expect(battles).toEqual([]);
    expect(cave!.areas).toBeUndefined();
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

describe('the ladder down', () => {
  const thing = (char: string) => cave!.objects.find((object) => object.id === `cave:${char}`)!;
  const walkable = (x: number, y: number) => !!tileOf(cave!, x, y) && !tileOf(cave!, x, y)!.solid;
  const mouth = resolveSpot(world, { map: 'cave', at: 'm', dx: -1 });
  /** The cracked wall and the rock behind it: the things that are gone once the crack was looked at. */
  const secret = (object: GameObject) => object.hideWhen?.flag === DEEP_FLAGS.crack;
  /**
   * How many steps it is from the mouth to each cell, walking round the things that stand in the way, with the
   * cracked wall still shut or `open`. `closed` cells are shut.
   */
  function steps(open: boolean, closed: string[] = []): Map<string, number> {
    const dist = new Map([[keyOf(mouth), 0]]);
    const queue: Cell[] = [mouth];
    for (let cell = queue.shift(); cell; cell = queue.shift()) {
      for (const { dx, dy } of Object.values(DELTA)) {
        const next = { x: cell.x + dx, y: cell.y + dy };
        if (dist.has(keyOf(next)) || closed.includes(keyOf(next)) || !walkable(next.x, next.y)) continue;
        if (cave!.objects.some((object) => object.x === next.x && object.y === next.y && object.solid && !(open && secret(object)))) continue;
        dist.set(keyOf(next), dist.get(keyOf(cell))! + 1);
        queue.push(next);
      }
    }
    return dist;
  }
  /** The fewest steps to stand on a thing (the ladder) or beside it (everything else). */
  const walkTo = (object: GameObject, dist: Map<string, number>) =>
    Math.min(...[{ dx: 0, dy: 0 }, ...Object.values(DELTA)].map(({ dx, dy }) => dist.get(`${object.x + dx},${object.y + dy}`) ?? Infinity));
  const ladder = thing('L');
  const crack = thing('w');
  const shut = steps(false);
  const opened = steps(true);
  /** The cells behind the cracked wall: the ones that can only be walked to once it is open. */
  const hidden = [...opened.keys()].filter((key) => !shut.has(key)).map((key) => key.split(',').map(Number) as [number, number]);
  /** In front of the crack, facing it. */
  const atCrack = (extra: Partial<GameState> = {}) => at('cave', 'w', { level: CAVE_LEVEL, dir: 'right', ...extra }, -1);

  it('is behind a wall: with the cracked wall shut there is no way to it, and no other way round', () => {
    expect(walkTo(ladder, shut)).toBe(Infinity);
    expect(walkTo(ladder, opened)).toBeLessThan(Infinity);
    expect(routeTo(world, atCrack(), 'cave:L')).toBeNull();
    // The wall is three cells thick: the crack, and two cells of rock behind it that fall away with it.
    const wall = cave!.objects.filter(secret);
    expect(wall.map((object) => object.id).sort()).toEqual(['cave:w', 'cave:x', 'cave:y']);
    for (const object of wall) expect(object.solid, object.id).toBe(true);
    expect(wall.filter((object) => object.branches.length > 0)).toEqual([crack]);
    // Walking into it is walking into rock.
    const bumped = step(atCrack(), { ...NO_INPUT, dir: 'right', pressed: 'right' }, world, { instant: true });
    expect(bumped.state).toMatchObject({ x: crack.x - 1, y: crack.y });
    expect(bumped.cues).toEqual(['bump']);
    expect(bumped.events).toEqual([]);
  });

  it('cannot be seen before the wall is open: from nowhere a player can stand does the light reach floor behind it', () => {
    expect(hidden.length).toBeGreaterThanOrEqual(7);
    // The wall itself is drawn as rock: the crack almost, the two cells behind it exactly.
    expect(crack.sprite).toBe('crack');
    expect(thing('x').sprite).toBe('cavewall');
    expect(thing('y').sprite).toBe('cavewall');
    const drawnAsRock = (x: number, y: number) => cave!.objects.some((object) => object.x === x && object.y === y && secret(object));
    const floor = hidden.filter(([x, y]) => !drawnAsRock(x, y));
    expect(floor.length).toBeGreaterThanOrEqual(4);
    expect(floor.map(keyOfPair)).toContain(keyOf(ladder));
    // Every cell behind it that would show as floor is black from every cell that can be stood on (a step under
    // way is between two such cells, and never nearer to a cell than both of its ends).
    for (const [x, y] of floor) {
      for (const from of shut.keys()) {
        const [px, py] = from.split(',').map(Number) as [number, number];
        expect(lit(x, y, px, py, cave!.dark!, cave!.lights), `${x},${y} seen from ${from}`).toBe(3);
      }
    }
    // The chest room above all: that is where the tunnel's mouth used to show.
    const f = thing('F');
    const room = [...shut.keys()].map((key) => key.split(',').map(Number) as [number, number]).filter(([x, y]) => Math.abs(x - f.x) <= 4 && Math.abs(y - f.y) <= 1);
    expect(room.length).toBeGreaterThanOrEqual(6);
    for (const [px, py] of room) {
      for (const { dx, dy } of Object.values(DELTA)) {
        const seen = !walkable(px + dx, py + dy) || shut.has(`${px + dx},${py + dy}`) || cave!.objects.some((object) => object.x === px + dx && object.y === py + dy);
        expect(seen, `${px + dx},${py + dy}`).toBe(true);
      }
    }
  });

  it('opens when the crack is looked at: a rumble, a line that says so, and it stays open', () => {
    // First what is seen: one page, and the wall still stands while it is read.
    const seen = step(atCrack(), { ...NO_INPUT, a: true }, world, { instant: true });
    expect(seen.cues).toEqual(['confirm']);
    expect(seen.events.map((event) => event.text)).toEqual(DEEP_TEXT.crack);
    expect(seen.state.dialogue?.pages).toHaveLength(1);
    expect(seen.state.flags[DEEP_FLAGS.crack]).toBeUndefined();
    // Then it gives way: the rumble of a gate, and a line that says so, on one page (the status region shows it whole).
    const told = step(seen.state, { ...NO_INPUT, a: true }, world, { instant: true });
    expect(told.cues).toEqual(['confirm', 'gate']);
    expect(told.events.map((event) => event.text)).toEqual(DEEP_TEXT.crackOpen);
    expect(told.state.dialogue?.pages).toHaveLength(1);
    expect(told.state.flags[DEEP_FLAGS.crack]).toBe(true);
    const after = settle(told.state);
    expect(DEEP_TEXT.crackOpen.join(' ')).toMatch(/gives way/);
    // Through where the wall was, to the ladder and down.
    const through = press(after, { dir: 'right', pressed: 'right' });
    expect(through).toMatchObject({ x: crack.x, y: crack.y });
    expect(goTo(after, 'cave:L').map).toBe('deep');
    // For good: nothing in the game takes that flag back, so nobody is ever shut in behind it.
    const undone = Object.values(world.maps).flatMap((map) => map.objects.flatMap((object) => object.branches.flatMap((branch) => deep(branch.do)))).flatMap((action) => ('unflag' in action ? action.unflag : []));
    expect(undone).not.toContain(DEEP_FLAGS.crack);
    // Coming back up the ladder, the way out through the wall is open.
    const up = goTo({ ...at('deep', 'u', { level: CAVE_LEVEL, flags: after.flags }, 0, 1) }, 'deep:u');
    expect(up.map).toBe('cave');
    expect(routeTo(world, up, 'cave:m')).not.toBeNull();
  });

  it('looks almost like the rock around it: the crack is a few pixels of the wall, no more', () => {
    const script = "import('./scripts/sprites/scenery.mjs').then(({ scenery }) => console.log(JSON.stringify({ crack: scenery.crack, wall: scenery.cavewall })))";
    const { crack: drawn, wall } = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' })) as { crack: string[]; wall: string[] };
    const rock = wall.length === 8 ? [...wall, ...wall].map((row) => row + row) : wall;
    expect(drawn).toHaveLength(16);
    const differ = drawn.flatMap((row, y) => [...row].filter((dot, x) => dot !== rock[y]![x])).length;
    // Enough to be found by someone who looks, too little to catch the eye in passing.
    expect(differ).toBeGreaterThanOrEqual(5);
    expect(differ).toBeLessThanOrEqual(16);
  });

  it('is the furthest thing from the mouth, at the end of a tunnel that leads nowhere else', () => {
    const others = cave!.objects.filter((object) => object !== ladder && object.id !== 'cave:m' && !secret(object));
    const furthest = Math.max(...others.map((object) => walkTo(object, opened)));
    expect(walkTo(ladder, opened)).toBeGreaterThan(furthest + 5);
    expect(walkTo(ladder, opened)).toBeGreaterThanOrEqual(30);
    // Nothing else is behind the wall: no chest, no note, no coffee.
    for (const [x, y] of hidden) {
      const beside = cave!.objects.filter((object) => object !== ladder && !secret(object) && Math.abs(object.x - x) + Math.abs(object.y - y) <= 1);
      expect(beside.map((object) => object.id), `${x},${y}`).toEqual([]);
    }
    // The wall is in the chest room in the north-west, the far dead end, and wild things live on the way there.
    const f = thing('F');
    expect(crack.y).toBe(f.y);
    expect(crack.x - f.x).toBeLessThanOrEqual(5);
    expect(shut.has(`${crack.x - 1},${crack.y}`)).toBe(true);
    expect(dryReach(cave!, mouth).has(`${crack.x - 1},${crack.y}`)).toBe(false);
    expect(hidden.some(([x, y]) => tileOf(cave!, x, y)!.grass)).toBe(true);
  });

  it('is not signposted: no sign points at it and nothing names it, but one person in the cave gives a hint', () => {
    const everything = Object.values(world.maps).filter((map) => map.id !== 'deep').map(said).join('\n') + world.intro.join('\n') + world.hints.map((hint) => hint.text).join('\n');
    expect(everything).not.toMatch(/ladder|second floor|floor below|lower floor|deeper|deep cave|downstairs|way down/i);
    expect(cave!.objects.some((object) => object.sprite === 'sign')).toBe(false);
    // The hint: the one who is lost says what to look for and the kind of place, not where it is.
    const sayOf = (object: GameObject) => object.branches.flatMap((branch) => deep(branch.do)).flatMap((action) => ('say' in action ? action.say : [])).join(' ');
    const hinting = cave!.objects.filter((object) => !secret(object) && /crack/i.test(sayOf(object)));
    expect(hinting.map((object) => object.id)).toEqual(['cave:n']);
    expect(sayOf(thing('n'))).toContain(DEEP_TEXT.hint.join(' '));
    expect(DEEP_TEXT.hint.join(' ')).toMatch(/dead end/i);
    expect(DEEP_TEXT.hint.join(' ')).not.toMatch(/north|west|east|south|left|right|chest|pizza|corner/i);
    // Both can be walked to while the wall is shut: the hint, and the place it is about.
    expect(walkTo(thing('n'), shut)).toBeLessThan(Infinity);
    expect(shut.has(`${crack.x - 1},${crack.y}`)).toBe(true);
    expect(routeTo(world, at('cave', 'm', { level: CAVE_LEVEL, dir: 'left' }, -1), 'cave:n')).not.toBeNull();
    expect(routeTo(world, at('cave', 'm', { level: CAVE_LEVEL, dir: 'left' }, -1), 'cave:w')).not.toBeNull();
    // The paper, the scratches and the one who gives the hint are nowhere near it.
    for (const char of ['a', 'b', 'd', 'n']) expect(walkTo(ladder, opened) - walkTo(thing(char), opened), char).toBeGreaterThan(12);
    // It is a hole in the floor with a ladder in it, not daylight like the way out.
    expect(ladder.sprite).toBe('hole');
    expect(thing('m').sprite).toBe('caveexit');
  });

  it('lies right behind the bricked-up doorway, where the last chamber was: close by, and a long walk', () => {
    const wall = thing('d');
    expect(Math.abs(wall.x - ladder.x) + Math.abs(wall.y - ladder.y)).toBeLessThanOrEqual(4);
    expect(walkTo(ladder, opened) - opened.get(`${wall.x},${wall.y + 1}`)!).toBeGreaterThanOrEqual(20);
    // The bricks say that something is behind them, and that this is not the way in.
    expect(DEEP_TEXT.bricked.join(' ')).toMatch(/draught/);
  });

  it('asks for no level, leads to the deep cave and back, and says where the player is', () => {
    expect(ladder.branches).toHaveLength(1);
    expect(ladder.branches[0]!.when).toBeUndefined();
    const before = { ...at('cave', 'L', { level: CAVE_LEVEL, dir: 'down' as const, flags: { [DEEP_FLAGS.crack]: true as const } }, 0, -1) };
    const down = step(before, { ...NO_INPUT, dir: 'down', pressed: 'down' }, world, { instant: true });
    const top = world.maps.deep!.objects.find((object) => object.id === 'deep:u')!;
    expect(down.state).toMatchObject({ map: 'deep', x: top.x, y: top.y + 1, dir: 'down' });
    expect(down.cues).toContain('cave');
    expect(down.events.map((event) => event.text)).toContain('The Deep Cave');
    expect(down.state.banner?.text).toBe('The Deep Cave');
    expect(top.sprite).toBe('ladder');
    // Back up: beside the hole, on the one cell of the tunnel that leads to it.
    const up = step(down.state, { ...NO_INPUT, dir: 'up', pressed: 'up' }, world, { instant: true });
    expect(up.state).toMatchObject({ map: 'cave', x: ladder.x, y: ladder.y - 1, dir: 'up' });
    expect(up.cues).toContain('cave');
    expect(opened.has(`${ladder.x},${ladder.y - 1}`)).toBe(true);
  });
});

describe('the deep cave', () => {
  const below = world.maps.deep!;
  const thing = (char: string) => below.objects.find((object) => object.id === `deep:${char}`)!;
  const walkable = (x: number, y: number) => !!tileOf(below, x, y) && !tileOf(below, x, y)!.solid;
  const solved = { [DEEP_FLAGS.plates]: true as const, [DEEP_FLAGS.shipped]: true as const };
  /** Past the last gate, in front of the heavy door, every puzzle solved. */
  const atDoor = (extra: Partial<GameState> = {}): GameState => ({ ...at('deep', 'D', { level: 10, hp: 57, maxHp: 57, dir: 'down', flags: solved, ...extra }, 0, -1) });

  it('is dark like the floor above, with the same tune, and the boss tune for THE OUTAGE', () => {
    expect(below.dark).toBe(1);
    expect(below.name).toBe('The Deep Cave');
    expect(trackFor(atDoor(), world)).toBe('cave');
    const boss = thing('B');
    let fight = press({ ...atDoor({ level: 9 }), x: boss.x, y: boss.y - 1 }, { a: true });
    for (let i = 0; i < 10 && fight.dialogue; i++) fight = press(fight, { a: true });
    expect(fight.battle).toMatchObject({ enemy: 'outage', wild: false, level: 10 });
    expect(trackFor(fight, world)).toBe(world.music!.boss);
  });

  it('has the door to the last chamber in a wall that is walked down into, for level 5', () => {
    expect(DEEP_CAVE_LEVEL).toBe(BOSS_MIN_LEVEL.outage);
    const door = thing('D');
    expect(walkable(door.x - 1, door.y)).toBe(false);
    expect(walkable(door.x + 1, door.y)).toBe(false);
    expect(walkable(door.x, door.y - 1)).toBe(true);
    const stopped = press(atDoor({ level: DEEP_CAVE_LEVEL - 1 }), { dir: 'down', pressed: 'down' });
    expect(stopped.y).toBe(door.y - 1);
    expect(stopped.dialogue?.pages.flat().join(' ')).toContain(`Lv ${DEEP_CAVE_LEVEL} and up`);
    expect(routeTo(world, atDoor({ level: DEEP_CAVE_LEVEL - 1 }), 'deep:B')).toBeNull();
    const through = step(atDoor({ level: DEEP_CAVE_LEVEL }), { ...NO_INPUT, dir: 'down', pressed: 'down' }, world, { instant: true });
    expect(through.state.y).toBe(door.y);
    expect(routeTo(world, through.state, 'deep:B')).not.toBeNull();
    // One more step and the label says where this is.
    const inRoom = step(through.state, { ...NO_INPUT, dir: 'down', pressed: 'down' }, world, { instant: true });
    expect(inRoom.state.banner?.text).toBe('Incident Room');
    expect(inRoom.events.map((event) => event.text)).toContain('Incident Room');
  });

  it('is as easy to find as it was: past the last gate one short corridor leads to the door, with coffee beside it', () => {
    const gate = thing('G');
    const door = thing('D');
    const coffee = thing('j');
    // From the cell behind the gate to the cell in front of the door: a few steps, no rubble, nothing to solve.
    const route = routeTo(world, { ...atDoor(), x: gate.x - 1, y: gate.y, dir: 'left' }, 'deep:D');
    expect(route).not.toBeNull();
    expect(route!.length).toBeLessThanOrEqual(5);
    expect(Math.abs(coffee.x - door.x) + Math.abs(coffee.y - (door.y - 1))).toBe(1);
    // The corridor has no turn-offs: every cell of it has the gate on one side and the door or the coffee on the other.
    const corridor = cellsOf(below, (x, y) => y === gate.y && x < gate.x && walkable(x, y) && !below.objects.some((object) => object.x === x && object.y === y));
    expect(corridor.length).toBeLessThanOrEqual(4);
    for (const cell of corridor) expect(walkable(cell.x, cell.y - 1)).toBe(false);
    // And the gate is gone for good once the pipeline has shipped.
    expect(gate.hideWhen).toEqual({ flag: DEEP_FLAGS.shipped });
    expect(thing('g').hideWhen).toEqual({ flag: DEEP_FLAGS.plates });
  });

  it('has a boss guarding a chest with a medal and ten max energy for good, and a ladder out', () => {
    const boss = thing('B');
    const beforeBoss = { ...atDoor(), x: boss.x, y: boss.y - 1 };
    // The chest and the ladder are behind the boss: no way to them while it stands.
    expect(routeTo(world, beforeBoss, 'deep:c')).toBeNull();
    expect(routeTo(world, beforeBoss, 'deep:L')).toBeNull();
    let state = settle(press(beforeBoss, { a: true }));
    expect(state.flags['beat:outage']).toBe(true);
    const energy = state.maxHp;
    state = talk(state, 'deep:c');
    expect(state.items.medal).toBe(1);
    expect(state.bonusHp).toBe(10);
    expect(state.maxHp).toBe(energy + 10);
    expect(state.maxHp).toBe(maxHpOf(world, state));
    state = talk(state, 'deep:c');
    expect(state.items.medal).toBe(1);
    expect(state.bonusHp).toBe(10);
    state = goTo(state, 'deep:L');
    expect(state).toMatchObject({ map: 'west', dir: 'right' });
  });

  it('has coffee where the player arrives and in front of the last door; a defeat costs the walk from there and no puzzle', () => {
    expect(below.objects.filter((object) => object.sprite === 'coffee').map((object) => object.id).sort()).toEqual(['deep:j', 'deep:k']);
    const top = thing('u');
    expect(routeTo(world, { ...atDoor({ flags: {} }), x: top.x, y: top.y + 1 }, 'deep:k')!.length).toBeLessThanOrEqual(4);
    const rested = talk(atDoor({ hp: 5 }), 'deep:j');
    expect(rested.hp).toBe(rested.maxHp);
    expect(rested.heal).toMatchObject({ map: 'deep' });
    // Lose to the boss on purpose: one energy, and it always gets a turn.
    const boss = thing('B');
    let state = press({ ...rested, x: boss.x, y: boss.y - 1, dir: 'down', items: { coffee: 1, stamp: 4 }, xp: 300, roam: { 'deep:1': { x: 16, y: 2, fromX: 16, fromY: 3, at: 0 }, 'deep:2': { x: 15, y: 4, fromX: 14, fromY: 4, at: 0 } } }, { a: true });
    for (let i = 0; i < 10 && state.dialogue; i++) state = press(state, { a: true });
    expect(state.battle?.enemy).toBe('outage');
    state = { ...state, hp: 1, maxHp: 1 };
    for (let i = 0; i < 300 && state.battle; i++) state = press(state, { a: true });
    state = settle(state);
    expect(state.flags['beat:outage']).toBeUndefined();
    expect(state).toMatchObject({ map: 'deep', x: rested.heal.x, y: rested.heal.y, xp: 300 });
    expect(state.items).toEqual({ coffee: 1, stamp: 4 });
    // The puzzles stay solved and the boulders stay on their plates.
    expect(state.flags).toMatchObject(solved);
    expect(state.roam['deep:1']).toMatchObject({ x: 16, y: 2 });
    expect(routeTo(world, state, 'deep:D')).not.toBeNull();
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

  it('pays out after the third battle, before the contact details: once, with a line of its own', () => {
    const { state, said } = watch(facing());
    const pay = `You got ${REWARDS.finale} COINS!`;
    expect(said.filter((line) => line === pay)).toHaveLength(1);
    const text = said.join('\n');
    expect(text.indexOf(pay)).toBeGreaterThan(text.indexOf(world.enemies.impostor!.defeat));
    expect(text.indexOf(pay)).toBeLessThan(text.indexOf('how to reach me'));
    // Wesley says what it is for, right before it.
    expect(said[said.indexOf(pay) - 1]).toBe(fold(FINALE.pay.at(-1)!));
    const drops = FINAL_BOSSES.reduce((sum, id) => sum + coinsFor(world.enemies[id]!.level, false, world), 0);
    expect(state.coins).toBe(facing().coins + drops + REWARDS.finale);
    // Coming back after a defeat pays the same, once.
    const back = watch(facing({ flags: { 'beat:interview': true, 'beat:review': true } }));
    expect(back.said.filter((line) => line === pay)).toHaveLength(1);
  });

  it('plays the whole transition for the first battle and the short one for those that follow, and never flashes', () => {
    // With motion, A held down on every tick: as fast as anyone can go through it.
    const play = (from: GameState) => {
      let state = from;
      const ways: Record<string, { ticks: number; quick: boolean; cue: string }> = {};
      const bright: boolean[] = [];
      for (let i = 0; i < 60000 && !state.finished; i++) {
        const next = step(state, { ...NO_INPUT, a: true }, world);
        const { battle } = next.state;
        if (battle && battle !== state.battle && state.battle?.enemy !== battle.enemy) ways[battle.enemy] = { ticks: battle.intro, quick: !!battle.quick, cue: next.cues.at(-1) ?? '' };
        state = next.state;
        // Bright: a wash of the transition, or the battle screen itself (its ground is the lightest shade).
        const curtain = state.battle && curtainOf(state.battle);
        bright.push(curtain ? curtain.flash : !!state.battle);
      }
      const onsets = bright.map((on, i) => on && !bright[i - 1]);
      let worst = 0;
      for (let i = 0; i < onsets.length; i++) if (onsets[i]) worst = Math.max(worst, onsets.slice(i, i + 60).filter(Boolean).length);
      return { state, ways, worst };
    };
    const whole = play(facing({ level: world.levels.max }));
    expect(whole.state.finished).toBe(true);
    expect(whole.ways).toEqual({
      interview: { ticks: BOSS_TICKS, quick: false, cue: 'showdown' },
      review: { ticks: QUICK_TICKS, quick: true, cue: 'round' },
      impostor: { ticks: QUICK_TICKS, quick: true, cue: 'round' },
    });
    expect(whole.worst).toBeLessThan(3);
    // Back after a defeat: the boss that won is the first of that talk, so it gets the whole show again.
    const back = play(facing({ level: world.levels.max, flags: { 'beat:interview': true } }));
    expect(back.ways).toEqual({ review: { ticks: BOSS_TICKS, quick: false, cue: 'showdown' }, impostor: { ticks: QUICK_TICKS, quick: true, cue: 'round' } });
    expect(back.worst).toBeLessThan(3);
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
          if (cond.level !== undefined) expect(['west:D', 'deep:D'], object.id).toContain(object.id);
          for (const item of [cond.item, cond.noItem, cond.count?.item]) {
            if (item && extra.includes(item)) expect(object.id).toBe('hills:?');
          }
          for (const flag of [cond.flag, cond.notFlag]) {
            if (flag && /^(hobby|rally|chest:(prize|cave|east|west)|beat:outage|deep:|git:|cave:)/.test(flag)) expect(['hills', 'cave', 'deep', 'east', 'west'], object.id).toContain(map.id);
          }
        }
      }
    }
    // Nothing on the old maps leads into the new ones except the two ends of the main road.
    const ways = Object.values(world.maps).flatMap((map) =>
      map.objects.flatMap((object) => object.branches.flatMap((branch) => deep(branch.do)).flatMap((action) => ('warp' in action ? [`${object.id}>${action.warp.map}`] : []))),
    );
    expect(ways.filter((way) => /^(town|academy|office|workshop|library|contact|cafe):.*>(east|west|hills|cave|deep)$/.test(way)).sort()).toEqual(['town:(>west', 'town:)>east']);
    // And the deep cave hangs on the cave alone: the ladder down, and the ladder out to the road.
    expect(ways.filter((way) => />deep$/.test(way))).toEqual(['cave:L>deep']);
    expect(ways.filter((way) => /^deep:/.test(way)).sort()).toEqual(['deep:L>west', 'deep:u>cave']);
    // The flags of the puzzles are asked for by the deep cave only.
    // (The fifth is the cracked wall on the first floor of the cave.)
    expect(Object.values(DEEP_FLAGS)).toHaveLength(5);
  });
});

describe('small things that looked wrong', () => {
  it('rims the pond of Hobby Hills with a shore, not with the hedge of the Library', () => {
    const sprites = (map: GameMap) => new Set(map.cells.flat().map((char) => map.tiles[char]!.sprite));
    expect(sprites(hills!)).toContain('shore');
    expect(sprites(hills!)).not.toContain('hedge');
    expect(sprites(town!)).toContain('hedge');
    // Every cell of the pond has more pond, the shore, or something that stands in or on the water on all four sides.
    for (const cell of pondOf(hills!)) {
      for (const { dx, dy } of Object.values(DELTA)) {
        expect([...WET, ...ON_WATER, 'shore'], `${cell.x + dx},${cell.y + dy}`).toContain(tileOf(hills!, cell.x + dx, cell.y + dy)!.sprite);
      }
    }
  });

  it('makes the pond of Hobby Hills look meant: a jetty to walk out on, and reeds at its edge', () => {
    const pond = new Set(pondOf(hills!).map(keyOf));
    expect(pond.size).toBeGreaterThanOrEqual(12);
    const wet = (x: number, y: number) => pond.has(`${x},${y}`);
    const jetty = cellsOf(hills!, (x, y) => tileOf(hills!, x, y)!.sprite === 'jetty');
    expect(jetty.length).toBeGreaterThanOrEqual(1);
    const reach = dryReach(hills!, resolveSpot(world, { map: 'hills', at: '(', dx: 1 }));
    for (const cell of jetty) {
      // Planks that run north to south: water on both sides, and the shore or more jetty at an end.
      expect(wet(cell.x - 1, cell.y) && wet(cell.x + 1, cell.y), keyOf(cell)).toBe(true);
      expect(['shore', 'jetty'], keyOf(cell)).toContain(tileOf(hills!, cell.x, cell.y + 1)!.sprite);
      expect(tileOf(hills!, cell.x, cell.y)!.solid).toBe(false);
      // Not a road: someone may stand there.
      expect(tileOf(hills!, cell.x, cell.y)!.road).toBeFalsy();
    }
    // It can be walked onto from the shore (or, where somebody stands on it, up to them).
    expect(jetty.some((cell) => reach.has(keyOf(cell)) || reach.has(`${cell.x},${cell.y + 1}`))).toBe(true);
    const reeds = cellsOf(hills!, (x, y) => tileOf(hills!, x, y)!.sprite === 'reeds');
    expect(reeds.length).toBeGreaterThanOrEqual(2);
    for (const cell of reeds) {
      expect(tileOf(hills!, cell.x, cell.y)!.solid, keyOf(cell)).toBe(true);
      // In the water, at its edge: the shore is right beside them.
      const around = Object.values(DELTA).map(({ dx, dy }) => tileOf(hills!, cell.x + dx, cell.y + dy)!.sprite);
      expect(around, keyOf(cell)).toContain('shore');
      expect(around.every((sprite) => [...WET, ...ON_WATER, 'shore'].includes(sprite)), keyOf(cell)).toBe(true);
    }
    // The things in and on the water move with it: each has its second picture.
    for (const sprite of ['jetty', 'stones', 'reeds']) {
      const tile = Object.values(hills!.tiles).find((candidate) => candidate.sprite === sprite)!;
      expect(tile.animated, sprite).toBe(true);
    }
  });

  it('rims the duck pond in town with a sandy shore, open in one place where the pond runs into the stream', () => {
    // The shore marks out the pond: the water inside the box of the sand is the pond, the rest is the stream.
    const shore = cellsOf(town!, (x, y) => tileOf(town!, x, y)!.sprite === 'shore');
    expect(shore.length).toBeGreaterThanOrEqual(16);
    const [left, right] = [Math.min(...shore.map((c) => c.x)), Math.max(...shore.map((c) => c.x))];
    const [top, bottom] = [Math.min(...shore.map((c) => c.y)), Math.max(...shore.map((c) => c.y))];
    const water = pondOf(town!);
    const inBox = (cell: Cell) => cell.x >= left && cell.x <= right && cell.y >= top && cell.y <= bottom;
    const pond = water.filter(inBox);
    const wet = new Set(water.map(keyOf));
    expect(pond.length).toBeGreaterThanOrEqual(18);
    // The pond and the stream are one water now: the duck's water reaches the stream under the bridge.
    const bridge = cellsOf(town!, (x, y) => tileOf(town!, x, y)!.sprite === 'bridge')[0]!;
    expect(wet.has(`${bridge.x + 1},${bridge.y}`)).toBe(true);
    // It runs out through exactly one gap in the rim, on the edge of the box, straight into the stream below it.
    const gaps = pond.filter((cell) => cell.x === left || cell.x === right || cell.y === top || cell.y === bottom);
    expect(gaps).toHaveLength(1);
    const gap = gaps[0]!;
    expect(gap.y).toBe(bottom);
    expect(WET).toContain(tileOf(town!, gap.x, gap.y + 1)!.sprite);
    expect(inBox({ x: gap.x, y: gap.y + 1 })).toBe(false);
    // Water is never walked on, the gap included.
    for (const cell of water) expect(tileOf(town!, cell.x, cell.y)!.solid, keyOf(cell)).toBe(true);
    const AROUND = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({ dx, dy }))).filter(({ dx, dy }) => dx !== 0 || dy !== 0);
    // Every other cell of the pond has more water or the shore on all sides, across its corners too.
    for (const cell of pond) {
      for (const { dx, dy } of AROUND) {
        const next = { x: cell.x + dx, y: cell.y + dy };
        if (!wet.has(keyOf(next))) expect(tileOf(town!, next.x, next.y)!.sprite, `round ${keyOf(cell)}: ${keyOf(next)}`).toBe('shore');
      }
    }
    // The shore is that rim and nothing else: every cell of it lies at the pond, can be stood on (no lamp, sign or
    // bench is left on it) and is walked to from the start of the game. It is a ring cut once: the two cells at the
    // gap are its ends, every other cell has two neighbours on the sand.
    const reach = dryReach(town!, resolveSpot(world, world.start));
    const ends: Cell[] = [];
    for (const cell of shore) {
      expect(AROUND.some(({ dx, dy }) => pond.some((p) => p.x === cell.x + dx && p.y === cell.y + dy)), keyOf(cell)).toBe(true);
      expect(standable(town!, cell.x, cell.y), keyOf(cell)).toBe(true);
      expect(reach.has(keyOf(cell)), keyOf(cell)).toBe(true);
      const onSand = Object.values(DELTA).filter(({ dx, dy }) => tileOf(town!, cell.x + dx, cell.y + dy)!.sprite === 'shore');
      if (onSand.length === 1) ends.push(cell);
      else expect(onSand, keyOf(cell)).toHaveLength(2);
    }
    expect(ends.map(keyOf).sort()).toEqual([`${gap.x - 1},${gap.y}`, `${gap.x + 1},${gap.y}`].sort());
    // What stood in the way stands beside it now: the signpost by the main road, where it is read from the road
    // and from the sand, the bench east of the pond, and the lamps in their line along the road.
    const sign = town!.objects.find((object) => object.id === 'town:9')!;
    expect(tileOf(town!, sign.x, sign.y)!.sprite).toBe('grass');
    expect(tileOf(town!, sign.x, sign.y - 1)!.road).toBe(true);
    expect(tileOf(town!, sign.x, sign.y + 1)!.sprite).toBe('shore');
    expect(said(town!)).toContain('DUCK POND.');
    const benches = cellsOf(town!, (x, y) => tileOf(town!, x, y)!.sprite === 'bench');
    expect(benches.some((bench) => Object.values(DELTA).some(({ dx, dy }) => tileOf(town!, bench.x + dx, bench.y + dy)!.sprite === 'shore'))).toBe(true);
    // The star behind the pond is still found, and reeds grow in the water at its edge.
    expect(routeTo(world, started(), 'town:2')).not.toBeNull();
    const reeds = pond.filter((cell) => tileOf(town!, cell.x, cell.y)!.sprite === 'reeds');
    expect(reeds.length).toBeGreaterThanOrEqual(2);
    for (const cell of reeds) expect(Object.values(DELTA).some(({ dx, dy }) => tileOf(town!, cell.x + dx, cell.y + dy)!.sprite === 'shore'), keyOf(cell)).toBe(true);
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
