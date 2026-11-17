import { step } from './engine.ts';
import { NO_INPUT, type Dir, type GameState, type World } from './types.ts';
import { placeOf } from './wander.ts';
import { DELTA, branchFor, objectAt } from './world.ts';

/**
 * A search over the game itself: from a state, press every direction (and A at whatever is faced then), and again
 * from wherever that leads, breadth first. It plays the real engine, with reduced motion (a press is a whole
 * move), so what it finds is what a player can do. Not part of the game: the tests use it to prove that every
 * puzzle can be solved and that nothing a player does there shuts the way, and the bot and the browser pilot use
 * it to get through a puzzle.
 *
 * The search stays on the map it starts on: a state on another map, in a battle or on the ending is noted and not
 * searched further.
 */

export type Press = Dir | 'a';

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

const input = (key: Press) => (key === 'a' ? { ...NO_INPUT, a: true } : { ...NO_INPUT, dir: key, pressed: key });

/** One press, as a player with reduced motion makes it. */
export const pressIn = (world: World, state: GameState, key: Press): GameState => step(state, input(key), world, { instant: true }).state;

/** Standing on the map with nothing open: the next press is a step or a talk. */
export const calm = (state: GameState): boolean =>
  state.scene === 'world' && !state.dialogue && !state.battle && !state.menu && !state.learn && !state.shop && !state.pick;

/**
 * What a puzzle can change, as one string: where the player stands, where the things that can be pushed on this
 * map are, the flags and the bag. Two states with the same key are the same to the search. The way the player
 * looks is not in it (a press turns the player first), nor are energy, the clock and the dice.
 */
export function keyOf(world: World, state: GameState): string {
  const map = world.maps[state.map]!;
  const pushed = map.objects.filter((object) => object.push).map((object) => placeOf(object, state)).map((at) => `${at.x},${at.y}`);
  const bag = Object.keys(state.items).filter((id) => state.items[id]! > 0).sort().map((id) => `${id}:${state.items[id]}`);
  const open = state.scene !== 'world' ? 'end' : state.battle ? `battle:${state.battle.enemy}` : calm(state) ? '' : 'open';
  return [state.map, state.x, state.y, pushed.join(';'), Object.keys(state.flags).sort().join(','), bag.join(','), open].join('|');
}

/** Presses A until the text box is closed, and writes the presses down. */
function read(world: World, state: GameState, presses: Press[]): GameState {
  let current = state;
  for (let i = 0; i < 60 && current.dialogue; i++) {
    current = pressIn(world, current, 'a');
    presses.push('a');
  }
  return current;
}

/**
 * Everything one move leads to from a calm state: each direction (a step, a push, a slide, a turn), read to the
 * end when it opens a text; and each direction followed by A when the player then faces something to talk to or
 * to pull.
 */
export function movesFrom(world: World, state: GameState): { presses: Press[]; state: GameState }[] {
  if (!calm(state)) return [];
  const out: { presses: Press[]; state: GameState }[] = [];
  for (const dir of DIRS) {
    const presses: Press[] = [dir];
    const stepped = read(world, pressIn(world, state, dir), presses);
    out.push({ presses, state: stepped });
    if (!calm(stepped) || stepped.map !== state.map) continue;
    const faced = objectAt(world.maps[stepped.map]!, stepped.x + DELTA[stepped.dir].dx, stepped.y + DELTA[stepped.dir].dy, stepped);
    if (faced?.trigger !== 'interact' || !branchFor(faced, stepped)) continue;
    const more: Press[] = [...presses, 'a'];
    out.push({ presses: more, state: read(world, pressIn(world, stepped, 'a'), more) });
  }
  return out;
}

export type Node = { state: GameState; from: string | null; presses: Press[] };
export type Explored = {
  start: string;
  nodes: Map<string, Node>;
  /** Where each searched state leads to. A state that was not searched further has no entry. */
  edges: Map<string, string[]>;
  /** The first state that met the goal, when one was asked for. */
  found: string | null;
  /** False when the search ran into its limit before it ran out of states. */
  complete: boolean;
};

export type SearchOptions = {
  /** Stop at the first state for which this holds. */
  goal?: (state: GameState) => boolean;
  /** States for which this holds are noted, not searched further (the puzzle is solved: what comes after is another search). */
  stop?: (state: GameState) => boolean;
  /** The most states to look at. */
  limit?: number;
};

/** The search. Breadth first, so the way to every state is a shortest one (in moves). */
export function explore(world: World, start: GameState, options: SearchOptions = {}): Explored {
  const limit = options.limit ?? 200_000;
  const first = keyOf(world, start);
  const nodes = new Map<string, Node>([[first, { state: start, from: null, presses: [] }]]);
  const edges = new Map<string, string[]>();
  const result = (found: string | null, complete: boolean): Explored => ({ start: first, nodes, edges, found, complete });
  if (options.goal?.(start)) return result(first, true);
  const queue = [first];
  for (let at = 0; at < queue.length; at++) {
    const key = queue[at]!;
    const { state } = nodes.get(key)!;
    if (state.map !== start.map || !calm(state) || options.stop?.(state)) continue;
    const next: string[] = [];
    for (const move of movesFrom(world, state)) {
      const to = keyOf(world, move.state);
      next.push(to);
      if (nodes.has(to)) continue;
      nodes.set(to, { state: move.state, from: key, presses: move.presses });
      if (options.goal?.(move.state)) return result(to, false);
      if (nodes.size >= limit) return result(null, false);
      queue.push(to);
    }
    edges.set(key, next);
  }
  return result(null, true);
}

/** The presses that lead from the start of a search to one of its states. */
export function pressesTo(explored: Explored, key: string): Press[] {
  const parts: Press[][] = [];
  for (let node = explored.nodes.get(key); node && node.from !== null; node = explored.nodes.get(node.from)) parts.unshift(node.presses);
  return parts.flat();
}

/** The shortest list of presses from a state to one for which `goal` holds, or null when there is none (within the limit). */
export function solve(world: World, start: GameState, goal: (state: GameState) => boolean, limit?: number): Press[] | null {
  const explored = explore(world, start, { goal, limit });
  return explored.found === null ? null : pressesTo(explored, explored.found);
}

/**
 * The states of a search from which one of `targets` can still be reached (the targets themselves included):
 * the search walked backwards. A state that is missing from the answer is a dead end for that target.
 */
export function canReach(explored: Explored, targets: Iterable<string>): Set<string> {
  const back = new Map<string, string[]>();
  for (const [from, list] of explored.edges) {
    for (const to of list) {
      if (!back.has(to)) back.set(to, []);
      back.get(to)!.push(from);
    }
  }
  const seen = new Set(targets);
  const queue = [...seen];
  for (let key = queue.pop(); key !== undefined; key = queue.pop()) {
    for (const from of back.get(key) ?? []) {
      if (seen.has(from)) continue;
      seen.add(from);
      queue.push(from);
    }
  }
  return seen;
}

const QUIET = new WeakMap<World, Map<string, World>>();

/**
 * The same world with no wild enemies on one map, so a search there does not depend on the dice. A wild battle
 * never changes a puzzle: won or run from, the player stands where they stood.
 */
export function quiet(world: World, mapId: string): World {
  const known = QUIET.get(world) ?? new Map<string, World>();
  QUIET.set(world, known);
  if (!known.has(mapId)) known.set(mapId, { ...world, maps: { ...world.maps, [mapId]: { ...world.maps[mapId]!, encounters: undefined } } });
  return known.get(mapId)!;
}
