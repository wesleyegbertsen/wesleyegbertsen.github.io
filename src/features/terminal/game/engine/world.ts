import type { Branch, Cond, Dir, GameMap, GameObject, GameState, Spot, TileDef, World } from './types.ts';

/** A map as the content modules write it: a text grid, and what each non-legend character is. */
export type MapSpec = {
  id: string;
  name: string;
  rows: string[];
  /** The legend character drawn under objects. */
  ground: string;
  objects: Record<string, ObjectSpec>;
  encounters?: GameMap['encounters'];
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
  return { id: spec.id, name: spec.name, width, height: cells.length, cells, objects, encounters: spec.encounters };
}

export function holds(cond: Cond | undefined, state: GameState): boolean {
  if (!cond) return true;
  if (cond.flag !== undefined && !state.flags[cond.flag]) return false;
  if (cond.notFlag !== undefined && state.flags[cond.notFlag]) return false;
  if (cond.item !== undefined && !(state.items[cond.item]! > 0)) return false;
  if (cond.noItem !== undefined && state.items[cond.noItem]! > 0) return false;
  if (cond.badges !== undefined && state.badges.length < cond.badges) return false;
  return true;
}

export function tileAt(world: World, map: GameMap, x: number, y: number): TileDef {
  const char = map.cells[y]?.[x];
  return (char !== undefined && world.tiles[char]) || VOID;
}

/** The object on a cell, unless it is hidden by now. */
export function objectAt(map: GameMap, x: number, y: number, state: GameState): GameObject | undefined {
  return map.objects.find((o) => o.x === x && o.y === y && !(o.hideWhen && holds(o.hideWhen, state)));
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

/** The sprite an object shows right now. */
export function spriteOf(object: GameObject, state: GameState): string | undefined {
  return object.spriteWhen && state.flags[object.spriteWhen.flag] ? object.spriteWhen.sprite : object.sprite;
}
