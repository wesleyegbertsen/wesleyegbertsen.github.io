import { education } from '../../../../data/education.ts';
import { experience } from '../../../../data/experience.ts';
import { profile } from '../../../../data/profile.ts';
import { projects } from '../../../../data/projects.ts';
import { skills } from '../../../../data/skills.ts';
import type { FsData } from '../../fs.ts';
import { routeTo } from '../engine/bot.ts';
import { initialGame, step } from '../engine/engine.ts';
import { fold } from '../engine/text.ts';
import { NO_INPUT, type Action, type Branch, type Cond, type Dir, type GameMap, type GameObject, type GameState, type Input, type World } from '../engine/types.ts';
import { placeOf } from '../engine/wander.ts';
import { DELTA, passable, resolveSpot } from '../engine/world.ts';
import { tiles } from '../assets/atlas.ts';
import { COLLECT } from './battles.ts';
import { buildWorld } from './world.ts';

/** The town as a place to be: scenery, townsfolk, stars and errands, and the promise that none of it is in the way. */

const data: FsData = { profile, skills, experience, education, projects };
const world = buildWorld(data);
const town = world.maps.town!;

const press = (state: GameState, input: Partial<Input>) => step(state, { ...NO_INPUT, ...input }, world, { instant: true }).state;
const busy = (state: GameState) => !!state.dialogue || !!state.battle || !!state.menu || !!state.learn;
/** Presses A until the text and the battles are over. */
function settle(state: GameState): GameState {
  let current = state;
  for (let i = 0; i < 400 && busy(current); i++) current = press(current, { a: true });
  expect(busy(current)).toBe(false);
  return current;
}
const started = () => settle(press(initialGame(world, 3), { a: true }));

/**
 * Walks to a thing as the browser pilot does: plan, one step, plan again, so someone who strolls into the way is
 * walked around. Ends facing it (or on it, or through it when it is a door). Battles on the way are fought.
 */
function goTo(state: GameState, id: string): GameState {
  let current = state;
  for (let i = 0; i < 600; i++) {
    const route = routeTo(world, current, id);
    if (!route) throw new Error(`No way to ${id} from ${current.map} ${current.x},${current.y}`);
    current = settle(press(current, { dir: route[0]!, pressed: route[0]! }));
    if (route.length === 1) return current;
  }
  throw new Error(`Never got to ${id}`);
}
const talk = (state: GameState, id: string) => settle(press(goTo(state, id), { a: true }));

const deep = (list: Action[]): Action[] => list.flatMap((action) => ('battle' in action ? [action, ...deep(action.win)] : [action]));
const tileOf = (map: GameMap, x: number, y: number) => map.tiles[map.cells[y]?.[x] ?? ''];
const strollers = (map: GameMap) => map.objects.filter((object) => object.wander);

describe('the town', () => {
  it('is bigger than the screen in both directions and has more to it than grass and paths', () => {
    expect(town.width).toBeGreaterThanOrEqual(28);
    expect(town.height).toBeGreaterThanOrEqual(22);
    const used = new Set(town.cells.flat().map((char) => town.tiles[char]!.sprite));
    for (const sprite of ['pine', 'bush', 'rock', 'fence', 'hedge', 'flowerbed', 'water', 'lily', 'duck', 'bridge', 'cobble', 'lamp', 'bench', 'stall', 'crate', 'barrel', 'mailbox', 'flag']) {
      expect(used, sprite).toContain(sprite);
    }
    const things = new Set(town.objects.map((object) => object.sprite));
    for (const sprite of ['fountain', 'well', 'star', 'postman', 'kid', 'elder', 'dog', 'gardener']) expect(things, sprite).toContain(sprite);
  });

  it('gives every building its own walls, roof, door and plaque', () => {
    const used = new Set(town.cells.flat().map((char) => town.tiles[char]!.sprite));
    for (const sprite of ['roof', 'roof-bell', 'awning', 'slate', 'brick', 'tin', 'planks', 'shingle', 'column', 'canopy']) expect(used, sprite).toContain(sprite);
    for (const name of ['academy', 'office', 'workshop', 'library', 'contact', 'cafe']) expect(used).toContain(`plaque-${name}`);
    const doors = ['A', 'O', 'S', 'L', 'P', 'X'].map((char) => town.objects.find((object) => object.id === `town:${char}`)!.sprite);
    expect(new Set(doors).size).toBe(4);
  });

  it('has animated tiles, and every one of them has its second picture', () => {
    const animated = Object.values(town.tiles).filter((tile) => tile.animated);
    expect(animated.length).toBeGreaterThanOrEqual(5);
  });

  const ROOMS = ['academy', 'office', 'workshop', 'library', 'contact', 'cafe'];

  it('furnishes every room: no room is a bare box', () => {
    for (const map of Object.values(world.maps)) {
      if (!ROOMS.includes(map.id)) continue;
      const furniture = new Set(
        map.cells.flat().filter((char) => map.tiles[char]!.solid && map.tiles[char]!.sprite !== 'iwall').map((char) => map.tiles[char]!.sprite),
      );
      expect(furniture.size, map.id).toBeGreaterThanOrEqual(5);
    }
    const floors = new Set(ROOMS.map((id) => world.maps[id]!.tiles._!.sprite));
    expect(floors.size).toBeGreaterThanOrEqual(4);
  });

  it('draws every fence with the piece for its neighbours, and leaves no post standing on its own', () => {
    let count = 0;
    for (const map of Object.values(world.maps)) {
      const fence = (x: number, y: number) => tileOf(map, x, y)?.sprite === 'fence';
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          if (!fence(x, y)) continue;
          count++;
          const look = tileOf(map, x, y)!.look!;
          const at = `${map.id} ${x},${y}`;
          expect(Object.keys(tiles), at).toContain(look);
          // Up and down is drawn as up and down, across as across.
          const sides = look.slice('fence'.length);
          expect(sides.includes('n'), at).toBe(fence(x, y - 1));
          expect(sides.includes('s'), at).toBe(fence(x, y + 1));
          expect(sides.includes('e'), at).toBe(fence(x + 1, y));
          expect(sides.includes('w'), at).toBe(fence(x - 1, y));
          expect([fence(x - 1, y), fence(x + 1, y), fence(x, y - 1), fence(x, y + 1)].some(Boolean), `${at}: a post on its own`).toBe(true);
        }
      }
    }
    expect(count).toBeGreaterThanOrEqual(10);
    // The rabbit of Hobby Hills is in a pen: fenced above, below and behind, open towards the path.
    const hills = world.maps.hills!;
    const rabbit = hills.objects.find((object) => object.sprite === 'bunny')!;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0]] as const) expect(tileOf(hills, rabbit.x + dx, rabbit.y + dy)!.sprite).toBe('fence');
    expect(tileOf(hills, rabbit.x + 1, rabbit.y)!.solid).toBe(false);
  });

  it('keeps the way into every room clear, and everything in it within reach of the door', () => {
    for (const id of ROOMS) {
      const map = world.maps[id]!;
      const mat = map.objects.find((object) => object.id === `${id}:m`)!;
      // Whoever walks in arrives above the mat, facing up: that cell and the one ahead are free.
      const free = (x: number, y: number) => !tileOf(map, x, y)!.solid && !map.objects.some((object) => object.x === x && object.y === y && object.solid);
      expect(free(mat.x, mat.y - 1), `${id}: the cell in front of the door`).toBe(true);
      expect(free(mat.x, mat.y - 2), `${id}: the cell ahead of that`).toBe(true);
      // Everything that can be talked to or used has a free cell beside it that is walked to from the door. Doors
      // inside the room count as open (the key card of the Office is in the bag).
      const state: GameState = { ...started(), map: id, x: mat.x, y: mat.y - 1, items: { keycard: 1 }, level: 10 };
      const open = (x: number, y: number) => {
        if (tileOf(map, x, y)?.solid !== false) return false;
        const object = map.objects.find((candidate) => candidate.x === x && candidate.y === y);
        return !object || passable(object, state);
      };
      const reach = new Set([`${mat.x},${mat.y - 1}`]);
      const queue = [{ x: mat.x, y: mat.y - 1 }];
      for (let cell = queue.shift(); cell; cell = queue.shift()) {
        for (const { dx, dy } of Object.values(DELTA)) {
          const next = { x: cell.x + dx, y: cell.y + dy };
          if (reach.has(`${next.x},${next.y}`) || !open(next.x, next.y)) continue;
          reach.add(`${next.x},${next.y}`);
          queue.push(next);
        }
      }
      for (const object of map.objects) {
        if (object.trigger !== 'interact' || object.branches.length === 0) continue;
        const beside = Object.values(DELTA).some(({ dx, dy }) => reach.has(`${object.x + dx},${object.y + dy}`));
        expect(beside, object.id).toBe(true);
      }
    }
  });
});

describe('the roads', () => {
  const road = (x: number, y: number) => !!tileOf(town, x, y)?.road;
  /** Every cell that can be reached from the start over road cells alone. */
  function network(): Set<string> {
    const start = resolveSpot(world, world.start);
    const seen = new Set([`${start.x},${start.y}`]);
    const queue = [start];
    for (let cell = queue.shift(); cell; cell = queue.shift()) {
      for (const { dx, dy } of Object.values(DELTA)) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        if (seen.has(`${x},${y}`) || !road(x, y)) continue;
        seen.add(`${x},${y}`);
        queue.push({ map: 'town', x, y });
      }
    }
    return seen;
  }

  it('start under the player and reach the front of every door, without a gap', () => {
    const start = resolveSpot(world, world.start);
    expect(road(start.x, start.y)).toBe(true);
    const roads = network();
    const doors = town.objects.filter((object) => object.trigger === 'step' && object.solid);
    // The five of the main path and the cafe.
    expect(doors.map((door) => door.id).sort()).toEqual(['town:A', 'town:L', 'town:O', 'town:P', 'town:S', 'town:X']);
    for (const door of doors) expect(roads, door.id).toContain(`${door.x},${door.y + 1}`);
    // And both ends of the main road, where it leaves town.
    for (const char of ['(', ')']) {
      const end = town.objects.find((object) => object.id === `town:${char}`)!;
      expect(roads, end.id).toContain(`${end.x},${end.y}`);
    }
  });

  it('are where every way out of a building puts the player, on any map where people stroll', () => {
    const all = Object.values(world.maps).flatMap((map) => map.objects.flatMap((object) => object.branches.flatMap((branch) => deep(branch.do))));
    for (const action of all) {
      if (!('warp' in action)) continue;
      const spot = resolveSpot(world, action.warp);
      const map = world.maps[spot.map]!;
      if (strollers(map).length > 0) expect(tileOf(map, spot.x, spot.y)?.road, `${spot.map} ${spot.x},${spot.y}`).toBe(true);
    }
  });

  it('are never needed by someone who gives a main-path item: nobody on the main path strolls', () => {
    for (const map of Object.values(world.maps)) {
      for (const object of strollers(map)) {
        const actions = object.branches.flatMap((branch) => deep(branch.do));
        expect(actions.every((action) => 'say' in action), object.id).toBe(true);
      }
    }
  });
});

describe('the townsfolk', () => {
  it('stroll in ranges of their own that do not overlap', () => {
    const folk = strollers(town);
    expect(folk.length).toBeGreaterThanOrEqual(4);
    for (const a of folk) {
      for (const b of folk) {
        if (a === b) continue;
        const apart = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
        expect(apart, `${a.id} and ${b.id}`).toBeGreaterThan(a.wander!.radius + b.wander!.radius);
      }
    }
  });

  it('walk about for minutes without ever standing on a road, on each other, on a thing or out of range', () => {
    const folk = strollers(town);
    const seen = new Map(folk.map((object) => [object.id, new Set<string>()]));
    let state = started();
    for (let tick = 0; tick < 20_000; tick++) {
      state = step(state, NO_INPUT, world).state;
      const places = folk.map((object) => placeOf(object, state));
      folk.forEach((object, i) => {
        const at = places[i]!;
        const tile = tileOf(town, at.x, at.y)!;
        if (tile.solid || tile.road || tile.grass) throw new Error(`${object.id} stands on ${tile.sprite} at ${at.x},${at.y}`);
        if (Math.max(Math.abs(at.x - object.x), Math.abs(at.y - object.y)) > object.wander!.radius) throw new Error(`${object.id} left its range`);
        if (town.objects.some((other) => other !== object && !other.wander && other.x === at.x && other.y === at.y)) {
          throw new Error(`${object.id} stands on a thing at ${at.x},${at.y}`);
        }
        seen.get(object.id)!.add(`${at.x},${at.y}`);
      });
      if (new Set(places.map((at) => `${at.x},${at.y}`)).size !== places.length) throw new Error('two people on one cell');
    }
    for (const [id, cells] of seen) expect(cells.size, id).toBeGreaterThan(3);
  });

  it('are the same town for every seed: the browser pilot can follow them', () => {
    const run = (seed: number) => {
      let state = settle(press(initialGame(world, seed), { a: true }));
      for (let tick = 0; tick < 3000; tick++) state = step(state, NO_INPUT, world).state;
      return state.roam;
    };
    expect(run(1)).toEqual(run(12345));
  });

  it('say things that follow the data', () => {
    const lines = (w: World) =>
      w.maps.town!.objects.flatMap((object) => object.branches.flatMap((branch) => deep(branch.do)).flatMap((action) => ('say' in action ? action.say : []))).join('\n');
    const text = lines(world);
    expect(text).toContain(profile.role);
    expect(text).toContain(experience.at(-1)!.title);
    expect(text).toContain(skills[0]!.name);
    expect(text).toContain(`${skills.length} skills`);
    expect(text).toContain(experience.find((job) => job.end === null)!.company);

    const other = lines(
      buildWorld({
        ...data,
        profile: { ...profile, name: 'Ada Lovelace', role: 'Analyst' } as unknown as FsData['profile'],
        experience: [{ ...experience.at(-1)!, title: 'Countess of Computing', company: 'Analytical Engines Ltd', start: 'June 1843', end: 'July 1843' }],
        skills: [{ id: 'notes', name: 'Note G' }],
        projects: [],
      }),
    );
    expect(other).toContain('be a Analyst, just like Ada');
    expect(other).toContain('Countess of Computing at Analytical Engines Ltd, back in 1843');
    expect(other).toContain('since 1843');
    expect(other).toContain('Today: Note G.');
    expect(other).toContain('1 employer, ');
    expect(other).toContain('0 side projects and 1 skill ');
    expect(other).not.toContain(profile.role);
  });

  it('only say what the font can draw: nothing turns into a question mark', () => {
    const marks = (text: string) => text.split('?').length - 1;
    for (const map of Object.values(world.maps)) {
      for (const object of map.objects) {
        for (const action of object.branches.flatMap((branch) => deep(branch.do))) {
          if ('say' in action) for (const line of action.say) expect(marks(fold(line)), `${object.id}: ${line}`).toBe(marks(line));
        }
      }
    }
  });
});

describe('the gold stars and the errands', () => {
  const stars = Object.values(world.maps).flatMap((map) => map.objects.filter((object) => object.sprite === 'star'));
  const owned = (state: GameState) => state.items[COLLECT] ?? 0;

  it('counts every star on the ground and the one that is handed out', () => {
    expect(stars.length).toBeGreaterThanOrEqual(8);
    expect(world.collect![0]).toEqual({ item: COLLECT, total: stars.length + 1, label: 'STARS', mark: '*', icon: 'star-mini' });
    expect(new Set(stars.map((object) => object.hideWhen?.flag)).size).toBe(stars.length);
  });

  it('can reach every star from the door of its map', () => {
    const base = { ...started(), items: { keycard: 1 } };
    for (const object of stars) {
      const mapId = object.id.split(':')[0]!;
      const map = world.maps[mapId]!;
      const mat = map.objects.find((candidate) => candidate.id === `${mapId}:m`);
      // The office star lies in the server room: start behind its door, which the key card opens.
      const door = mapId === 'office' ? map.objects.find((candidate) => candidate.id === 'office:D') : undefined;
      const from = door ? { x: door.x, y: door.y - 1 } : mat && mapId !== 'town' ? { x: mat.x, y: mat.y - 1 } : resolveSpot(world, world.start);
      expect(routeTo(world, { ...base, map: mapId, ...from }, object.id), object.id).not.toBeNull();
    }
  });

  it('keeps the main path free of them: doors, bosses, badges and the ending only ask for main-path things', () => {
    const MAIN_ITEMS = ['coffee', 'diploma', 'keycard', 'librarycard'];
    // `finale` is set by the end of the main path itself (Wesley says goodbye differently after it).
    const mainFlag = (flag: string) => flag === 'keycard' || flag === 'finale' || flag.startsWith('beat:') || flag.startsWith('chest:');
    const fine = (cond: Cond | undefined) =>
      !cond ||
      ((cond.item === undefined || MAIN_ITEMS.includes(cond.item)) &&
        (cond.noItem === undefined || MAIN_ITEMS.includes(cond.noItem)) &&
        (cond.flag === undefined || mainFlag(cond.flag)) &&
        (cond.notFlag === undefined || mainFlag(cond.notFlag)) &&
        cond.count === undefined &&
        cond.level === undefined);
    const matters = (branch: Branch) =>
      branch.pass === true || deep(branch.do).some((action) => 'warp' in action || 'badge' in action || 'battle' in action || 'ending' in action || ('give' in action && MAIN_ITEMS.includes(action.give)));
    const optional = (object: GameObject) => object.sprite === 'star';
    // The roads out of town and what lies along them are extra as a whole (regions.test.ts proves that).
    const EXTRA = ['east', 'hills', 'west', 'cave', 'deep'];
    for (const map of Object.values(world.maps)) {
      if (EXTRA.includes(map.id)) continue;
      for (const object of map.objects) {
        if (optional(object)) continue;
        // Every branch before one that matters decides whether it is reached, so all of them must be main-path.
        const last = object.branches.reduce((found, branch, i) => (matters(branch) ? i : found), -1);
        object.branches.slice(0, last + 1).forEach((branch) => expect(fine(branch.when), object.id).toBe(true));
        if (last >= 0) expect(fine(object.hideWhen), object.id).toBe(true);
      }
    }
  });

  it('picks a star up in passing and shows the count', () => {
    const before = goTo(started(), 'town:5');
    expect(owned(before)).toBe(1);
    expect(before.notice?.text).toBe(`* 1/${world.collect![0]!.total}`);
    expect(before.dialogue).toBeNull();
  });

  it('can be finished to the last star: both errands, every star, the trophy', () => {
    const walkThrough = (state: GameState, id: string, dir: Dir) => settle(press(goTo(state, id), { dir, pressed: dir }));
    let state = started();
    for (const id of ['town:5', 'town:6', 'town:2', 'town:1', 'town:4', 'town:3']) state = goTo(state, id);
    expect(owned(state)).toBe(6);

    // The postman hands over the letter; the collector is not impressed yet.
    state = talk(state, 'town:B');
    expect(state.items.letter).toBe(1);
    state = talk(state, 'town:?');
    expect(state.items.trophy).toBeUndefined();

    // The main path, with the side things on the way.
    state = goTo(state, 'town:A');
    state = goTo(state, 'academy:*');
    state = talk(state, 'academy:E');
    state = goTo(state, 'academy:m');
    state = goTo(state, 'town:O');
    state = talk(state, 'office:J');
    expect(state.flags['errand:duck']).toBeUndefined();
    state = talk(state, 'office:1');
    state = walkThrough(state, 'office:D', 'up');
    state = goTo(state, 'office:*');
    state = talk(state, 'office:B');
    state = walkThrough(state, 'office:D', 'down');
    state = goTo(state, 'office:m');
    state = goTo(state, 'town:S');
    state = talk(state, 'workshop:C');
    expect(state.items.duck).toBe(1);
    state = goTo(state, 'workshop:*');
    state = talk(state, 'workshop:B');
    state = goTo(state, 'workshop:m');

    // Back to the office with the duck.
    state = goTo(state, 'town:O');
    state = talk(state, 'office:J');
    expect(state.flags['errand:duck']).toBe(true);
    expect(state.items.duck).toBe(1);
    state = goTo(state, 'office:m');

    state = goTo(state, 'town:L');
    state = goTo(state, 'library:*');
    state = talk(state, 'library:R');
    expect(state.items.letter).toBe(0);
    expect(state.items.energydrink).toBe(1);
    expect(state.flags['errand:letter:done']).toBe(true);
    state = goTo(state, 'library:m');

    expect(owned(state)).toBe(world.collect![0]!.total);
    state = talk(state, 'town:?');
    expect(state.items.trophy).toBe(1);
    state = talk(state, 'town:?');
    expect(state.items.trophy).toBe(1);
    state = talk(state, 'town:B');
    expect(state.finished).toBe(false);
  });
});

describe('the mountain by the West Road', () => {
  const west = world.maps.west!;
  const rock = (x: number, y: number) => { const char = west.cells[y]?.[x]; return char === undefined || !!west.tiles[char]!.relief; };
  const lookAt = (x: number, y: number) => west.tiles[west.cells[y]![x]!]!.look!;
  const cells = west.cells.flatMap((row, y) => row.flatMap((char, x) => (west.tiles[char]!.relief ? [{ x, y }] : [])));

  it('is one rock: a face of the right sides wherever it meets open ground, bare rock inside, peaks only on the ridge', () => {
    expect(cells.length).toBeGreaterThan(40);
    for (const { x, y } of cells) {
      const look = lookAt(x, y);
      expect(look, `${x},${y}`).toMatch(/^cliff-(face-[nesw]+|rock-\d|peak-[01])$/);
      expect(Object.keys(tiles), look).toContain(look);
      const open = ([['n', 0, -1], ['e', 1, 0], ['s', 0, 1], ['w', -1, 0]] as const).filter(([, dx, dy]) => !rock(x + dx, y + dy)).map(([side]) => side).join('');
      expect(look, `${x},${y}`).toBe(open ? `cliff-face-${open}` : look);
      if (!open) expect(look).not.toMatch(/face/);
      if (look.startsWith('cliff-peak')) {
        expect(y).toBe(0);
        // Never beside a face: the massifs stand back from the edge.
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1]] as const) if (rock(x + dx, y + dy) && west.cells[y + dy]?.[x + dx]) expect(lookAt(x + dx, y + dy)).not.toMatch(/face/);
      }
    }
    // Inner rock in two pictures, the face facing the road, and a couple of peaks; no single picture fills it.
    const counts = new Map<string, number>();
    for (const { x, y } of cells) counts.set(lookAt(x, y), (counts.get(lookAt(x, y)) ?? 0) + 1);
    expect(counts.has('cliff-face-e')).toBe(true);
    expect(counts.get('cliff-peak-0')).toBeGreaterThanOrEqual(1);
    expect(Math.max(...counts.values()) / cells.length).toBeLessThan(0.5);
    // Solid, but for the mountain under the mouth of the cave, which counts as rock to its neighbours.
    const mouth = west.objects.find((object) => object.id === 'west:D')!;
    expect(mouth.sprite).toBe('cavemouth');
    for (const { x, y } of cells) expect(west.tiles[west.cells[y]![x]!]!.solid, `${x},${y}`).toBe(!(x === mouth.x && y === mouth.y));
    expect(lookAt(mouth.x, mouth.y - 1)).toBe('cliff-face-e');
    expect(lookAt(mouth.x, mouth.y + 1)).toBe('cliff-face-e');
  });
});
