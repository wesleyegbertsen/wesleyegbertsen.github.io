import type { Branch, Cond, Dir, GameMap, GameObject, GameState, Region, Spot, TileDef, World } from './types.ts';
import { placeOf } from './wander.ts';

/** A map as the content modules write it: a text grid, and what each non-legend character is. */
export type MapSpec = {
  id: string;
  name: string;
  rows: string[];
  /** The legend character drawn under objects. */
  ground: string;
  objects: Record<string, ObjectSpec>;
  encounters?: GameMap['encounters'];
  dark?: GameMap['dark'];
  areas?: Region[];
  /** The puzzle of the pressure plates of this map: the flag it sets and what happens then (see GameMap). */
  plates?: Pick<NonNullable<GameMap['plates']>, 'flag' | 'do'>;
};

export type ObjectSpec = Omit<GameObject, 'id' | 'x' | 'y'> & { under?: string };

const VOID: TileDef = { sprite: 'void', solid: true };

export const DELTA: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/**
 * Turns the text grid into a map. Characters of the legend are tiles; every other character must be a key of
 * `objects` and appear exactly once. Mistakes throw, so a typo in a map shows up in the tests, not in the game.
 */
export function parseMap(spec: MapSpec, legend: Record<string, TileDef>): GameMap {
  const width = spec.rows[0]?.length ?? 0;
  const seen = new Set<string>();
  const objects: GameObject[] = [];
  const cells = spec.rows.map((row, y) => {
    if (row.length !== width) throw new Error(`${spec.id}: row ${y} is ${row.length} wide, expected ${width}`);
    return [...row].map((char, x) => {
      if (Object.hasOwn(legend, char)) return char;
      const object = Object.hasOwn(spec.objects, char) ? spec.objects[char] : undefined;
      if (!object) throw new Error(`${spec.id}: unknown character '${char}' at ${x},${y}`);
      if (seen.has(char)) throw new Error(`${spec.id}: '${char}' appears twice`);
      seen.add(char);
      const { under, ...rest } = object;
      objects.push({ ...rest, id: `${spec.id}:${char}`, x, y });
      return under ?? spec.ground;
    });
  });
  for (const char of Object.keys(spec.objects)) {
    if (!seen.has(char)) throw new Error(`${spec.id}: object '${char}' is not on the map`);
  }
  // The plates and the lights are tiles: where they are is read off the grid once.
  const where = <T>(pick: (tile: TileDef, x: number, y: number) => T | undefined): T[] =>
    cells.flatMap((row, y) => row.flatMap((char, x) => pick(legend[char]!, x, y) ?? []));
  const plateCells = where((tile, x, y) => (tile.plate ? { x, y } : undefined));
  if (spec.plates && plateCells.length === 0) throw new Error(`${spec.id}: a plates puzzle without a plate`);
  if (spec.plates && objects.filter((object) => object.push).length < plateCells.length) throw new Error(`${spec.id}: more plates than things to push onto them`);
  const lights = where((tile, x, y) => (tile.light !== undefined ? { x, y, radius: tile.light } : undefined));
  // Tiles that join their neighbours get a cell of their own in the legend, with the picture for their sides.
  const tiles = { ...legend };
  const joined = cells.map((row, y) =>
    row.map((char, x) => {
      const tile = legend[char]!;
      if (tile.relief) {
        const look = reliefLook(tile.sprite, x, y, (dx, dy) => {
          const there = cells[y + dy]?.[x + dx];
          // Off the map is more mountain, not open ground.
          return there === undefined || there === char;
        });
        const key = `${char}:${look}`;
        tiles[key] ??= { ...tile, look };
        return key;
      }
      if (!tile.join) return char;
      const same = (dx: number, dy: number) => cells[y + dy]?.[x + dx] === char;
      const look = joinedLook(tile.sprite, { n: same(0, -1), e: same(1, 0), s: same(0, 1), w: same(-1, 0) });
      const key = `${char}:${look}`;
      tiles[key] ??= { ...tile, look };
      return key;
    }),
  );
  return {
    id: spec.id,
    name: spec.name,
    width,
    height: cells.length,
    cells: joined,
    tiles,
    objects,
    encounters: spec.encounters,
    dark: spec.dark,
    areas: spec.areas,
    ...(spec.plates ? { plates: { ...spec.plates, cells: plateCells } } : {}),
    ...(lights.length > 0 ? { lights } : {}),
  };
}

/**
 * The picture of a tile that joins its neighbours: its sprite and the sides that go on, north, east, south and west
 * in that order (`fence-ew`, `fence-ns`, `fence-es`). Alone it is the plain sprite.
 */
export function joinedLook(sprite: string, sides: { n: boolean; e: boolean; s: boolean; w: boolean }): string {
  const on = (['n', 'e', 's', 'w'] as const).filter((side) => sides[side]).join('');
  return on ? `${sprite}-${on}` : sprite;
}

/**
 * The picture of a mountain cell (a tile with `relief`), from what is around it (`rock(dx, dy)`: whether that
 * cell is more of the mountain). Where it meets open ground it is a face: the foot (`-base`, its shadow on the
 * ground) when the ground is right below, else a side (`-e`, `-w`) or the ridge (`-top`). One cell
 * further in it is a slope (`-slope`); further still it is peaks, in three pictures taken in turn along the rows,
 * so no single picture fills the field.
 */
export function reliefLook(sprite: string, x: number, y: number, rock: (dx: number, dy: number) => boolean): string {
  let distance = 4;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (!rock(dx, dy)) distance = Math.min(distance, Math.max(Math.abs(dx), Math.abs(dy)));
  if (distance === 1) {
    if (!rock(0, 1)) return `${sprite}-base`;
    if (!rock(1, 0)) return `${sprite}-e`;
    if (!rock(-1, 0)) return `${sprite}-w`;
    if (!rock(0, -1) || !rock(-1, -1) || !rock(1, -1)) return `${sprite}-top`;
    return `${sprite}-base`;
  }
  if (distance === 2) return `${sprite}-slope`;
  return `${sprite}-peak-${(x + 2 * y) % 3}`;
}

export function holds(cond: Cond | undefined, state: GameState): boolean {
  if (!cond) return true;
  if (cond.flag !== undefined && !state.flags[cond.flag]) return false;
  if (cond.notFlag !== undefined && state.flags[cond.notFlag]) return false;
  if (cond.item !== undefined && !(state.items[cond.item]! > 0)) return false;
  if (cond.noItem !== undefined && state.items[cond.noItem]! > 0) return false;
  if (cond.badges !== undefined && state.badges.length < cond.badges) return false;
  if (cond.count !== undefined && !(state.items[cond.count.item]! >= cond.count.min)) return false;
  if (cond.level !== undefined && state.level < cond.level) return false;
  return true;
}

/** Whether an object is off the map by now (a beaten boss, a star that was picked up). */
export const gone = (object: GameObject, state: GameState) => !!object.hideWhen && holds(object.hideWhen, state);

export function tileAt(map: GameMap, x: number, y: number): TileDef {
  const char = map.cells[y]?.[x];
  return (char !== undefined && map.tiles[char]) || VOID;
}

/**
 * Where a step from a cell ends, as far as the ground decides: on the next cell, or, when that is a ledge that
 * is jumped this way, on the cell behind it (`jump`). Null when the ground stops the step: a wall, a ledge from
 * any other side, or a ledge with no room to land behind it. Things and people on the way are the caller's to check.
 */
export function landing(map: GameMap, x: number, y: number, dir: Dir): { x: number; y: number; jump: boolean } | null {
  const { dx, dy } = DELTA[dir];
  const next = tileAt(map, x + dx, y + dy);
  if (next.ledge) {
    if (next.ledge !== dir || tileAt(map, x + 2 * dx, y + 2 * dy).solid) return null;
    return { x: x + 2 * dx, y: y + 2 * dy, jump: true };
  }
  return next.solid ? null : { x: x + dx, y: y + dy, jump: false };
}

/**
 * Where one press of a direction ends, slides included: a step (or a hop), and from slippery ground on in the
 * same direction until the ground or something on it stops the slide. `taken` tells which cells something stands
 * on. Null when the press does not move the player. The engine slides cell by cell (engine.ts, `glide`); this is
 * the same walk in one go, for whoever plans a route.
 */
export function stopOf(map: GameMap, x: number, y: number, dir: Dir, taken: (x: number, y: number) => boolean): { x: number; y: number; jump: boolean } | null {
  const first = landing(map, x, y, dir);
  if (!first || taken(first.x, first.y)) return null;
  let at = first;
  for (let i = 0; i < map.width + map.height && tileAt(map, at.x, at.y).slide; i++) {
    const next = landing(map, at.x, at.y, dir);
    if (!next || next.jump || taken(next.x, next.y)) break;
    at = { ...next, jump: first.jump };
  }
  return at;
}

/** The object on a cell, unless it is hidden by now. People who stroll are found where they are, not where the map put them. */
export function objectAt(map: GameMap, x: number, y: number, state: GameState): GameObject | undefined {
  return map.objects.find((o) => {
    const at = placeOf(o, state);
    return at.x === x && at.y === y && !gone(o, state);
  });
}

/** The name of the place a cell is in: the named part of the map that holds it, or else the map itself. */
export function areaAt(map: GameMap, x: number, y: number): string {
  const part = map.areas?.find((area) => x >= area.x && x < area.x + area.w && y >= area.y && y < area.y + area.h);
  return part?.name ?? map.name;
}

export function branchFor(object: GameObject, state: GameState): Branch | undefined {
  return object.branches.find((branch) => holds(branch.when, state));
}

/** Whether the player may walk onto an object's cell right now. */
export function passable(object: GameObject, state: GameState): boolean {
  if (object.trigger !== 'step') return !object.solid;
  const branch = branchFor(object, state);
  if (!branch) return !object.solid;
  return branch.pass ?? branch.do.some((action) => 'warp' in action);
}

export function resolveSpot(world: World, spot: Spot): { map: string; x: number; y: number } {
  const object = world.maps[spot.map]?.objects.find((o) => o.id === `${spot.map}:${spot.at}`);
  if (!object) throw new Error(`No '${spot.at}' on map '${spot.map}'`);
  return { map: spot.map, x: object.x + (spot.dx ?? 0), y: object.y + (spot.dy ?? 0) };
}

/** Where every defeat brings the player back to, when the world says so (the cafe). */
export function home(world: World): GameState['heal'] | null {
  const spot = world.respawn;
  return spot ? { ...resolveSpot(world, spot), ...(spot.dir ? { dir: spot.dir } : {}) } : null;
}

/** The sprite an object shows right now. */
export function spriteOf(object: GameObject, state: GameState): string | undefined {
  return object.spriteWhen && state.flags[object.spriteWhen.flag] ? object.spriteWhen.sprite : object.sprite;
}
