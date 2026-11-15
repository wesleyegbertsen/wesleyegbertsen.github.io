import { initialGame, step } from './engine.ts';
import { calm, quiet, solve, type Press } from './solve.ts';
import { NO_INPUT, type Action, type Dir, type GameEvent, type GameMap, type GameObject, type GameState, type Input, type World } from './types.ts';
import { placeOf } from './wander.ts';
import { DELTA, branchFor, objectAt, passable, resolveSpot, stopOf, tileAt } from './world.ts';

/**
 * A player that knows nothing about the story: it talks to everything it can reach, walks through every door that
 * lets it, rests when it is hurt and presses A through every dialogue and battle (so it always takes the default
 * choice). A shop it walks into is closed again with B: it never buys, so the game is proven to be finishable
 * without spending a coin. The tests use it to prove that the game can be finished; the browser tests use `routeTo`
 * to find keys.
 * People who stroll may step into the way or walk off: a walk that did not land where it should is given up and
 * planned again.
 * A puzzle is more than walking and talking. A riddle that starts over after a wrong answer: the bot does not
 * press what would only take progress back. Boulders to push: on a map with a puzzle, when nothing new is left to
 * try there, the bot searches the game itself for presses that lead to something it has not seen yet
 * (engine/solve.ts) and plays those. Not part of the game itself.
 */

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

type Cell = { x: number; y: number };

/** What a step into tall grass counts for when a walk is planned: a long way round is better than a wild enemy. */
const GRASS_COST = 40;

/**
 * The best walk from `from` to each cell it can reach on a map, never stepping on objects: the one through the
 * least tall grass, and the shortest of those. A ledge is one press that goes two cells, and only one way; a
 * press onto slippery ground goes as far as the slide does.
 */
function walks(world: World, state: GameState, mapId: string, from: Cell, grassOk: boolean): Map<string, Dir[]> {
  const map = world.maps[mapId]!;
  const found = new Map<string, { path: Dir[]; cost: number }>([[`${from.x},${from.y}`, { path: [], cost: 0 }]]);
  const queue: (Cell & { cost: number })[] = [{ ...from, cost: 0 }];
  while (queue.length > 0) {
    // The cheapest cell first. The maps are small, so a plain search for it will do.
    let at = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i]!.cost < queue[at]!.cost) at = i;
    const cell = queue.splice(at, 1)[0]!;
    const here = found.get(`${cell.x},${cell.y}`)!;
    if (cell.cost > here.cost) continue;
    for (const dir of DIRS) {
      const to = stopOf(map, cell.x, cell.y, dir, (x, y) => !!objectAt(map, x, y, state));
      if (!to) continue;
      const { x, y } = to;
      const grass = !!tileAt(map, x, y).grass;
      if (!grassOk && grass) continue;
      const cost = here.cost + 1 + (grass ? GRASS_COST : 0);
      const known = found.get(`${x},${y}`);
      if (known && known.cost <= cost) continue;
      found.set(`${x},${y}`, { path: [...here.path, dir], cost });
      queue.push({ x, y, cost });
    }
  }
  return new Map([...found].map(([key, value]) => [key, value.path]));
}

/** The directions to press to end up facing (or stepping onto) an object, or null when it cannot be reached. */
function routeIn(
  world: World,
  state: GameState,
  mapId: string,
  from: Cell,
  object: GameObject,
  grassOk = true,
): Dir[] | null {
  return facing(walks(world, state, mapId, from, grassOk), placeOf(object, state));
}

/** From the walks to every cell: the one that ends beside `at`, plus the turn towards it. */
function facing(reach: Map<string, Dir[]>, at: Cell): Dir[] | null {
  let best: Dir[] | null = null;
  for (const dir of DIRS) {
    const path = reach.get(`${at.x - DELTA[dir].dx},${at.y - DELTA[dir].dy}`);
    if (path && (!best || path.length + 1 < best.length)) best = [...path, dir];
  }
  return best;
}

/** The directions to press, one whole move each, to face the object with this id on the current map. */
export function routeTo(world: World, state: GameState, objectId: string): Dir[] | null {
  const object = world.maps[state.map]!.objects.find((candidate) => candidate.id === objectId);
  if (!object) return null;
  // Around the tall grass when there is a way: a wild enemy depends on the dice, and the browser tests must not.
  return routeIn(world, state, state.map, state, object, false) ?? routeIn(world, state, state.map, state, object);
}

const progress = (state: GameState) =>
  JSON.stringify([Object.keys(state.flags).sort(), Object.keys(state.items).filter((id) => state.items[id]! > 0).sort(), state.badges, state.level]);

/** Whether actions take progress back (a riddle that starts over): the bot does not press what can only undo. */
const undoes = (actions: Action[]): boolean => actions.some((action) => 'unflag' in action || ('battle' in action && undoes(action.win)));

/** Whether a map holds a puzzle that walking and talking alone do not solve: something to push, or a thing that takes progress back. */
const PUZZLING = new WeakMap<GameMap, boolean>();
function puzzling(map: GameMap): boolean {
  if (!PUZZLING.has(map)) PUZZLING.set(map, map.objects.some((object) => !!object.push || object.branches.some((branch) => undoes(branch.do))));
  return PUZZLING.get(map)!;
}

const heals = (object: GameObject, state: GameState) =>
  object.trigger === 'interact' && !!branchFor(object, state)?.do.some((action) => 'heal' in action);

export type BotRun = { state: GameState; events: GameEvent[]; defeats: number; presses: number; stuck: boolean };

/** Plays from the title screen until the ending, or until nothing new is left to try. */
export function playthrough(world: World, seed = 1, maxPresses = 40_000): BotRun {
  let state = initialGame(world, seed);
  const events: GameEvent[] = [];
  const tried = new Set<string>();
  let presses = 0;
  let stuck = false;

  const press = (input: Partial<Input>) => {
    const result = step(state, { ...NO_INPUT, ...input }, world, { instant: true });
    state = result.state;
    events.push(...result.events);
    presses++;
  };
  const busy = () => state.scene !== 'world' || !!state.dialogue || !!state.battle || !!state.menu || !!state.learn || !!state.shop;
  /**
   * Walks a route; stops early when something interrupts (a wild enemy) or when a step did not land (someone
   * strolled into the way). True when it got to the end.
   */
  const walk = (route: Dir[]) => {
    for (const [i, dir] of route.entries()) {
      const last = i === route.length - 1;
      // Where the press should end: the next cell, the one behind a ledge, or the end of a slide.
      const map = world.maps[state.map]!;
      // Whatever stands in the way is not counted here: then the press ends somewhere else, and the walk is given up.
      const to = stopOf(map, state.x, state.y, dir, () => false) ?? state;
      const want = { map: state.map, x: to.x, y: to.y };
      press({ dir, pressed: dir });
      if (last) break;
      if (busy() || state.map !== want.map || state.x !== want.x || state.y !== want.y) return false;
    }
    return true;
  };
  /** The thing the player faces right now. */
  const faced = () => objectAt(world.maps[state.map]!, state.x + DELTA[state.dir].dx, state.y + DELTA[state.dir].dy, state);

  /** Every bit of progress the bot has had, so a search knows what would be new. */
  const known = new Set<string>();
  /** Plays what a search found. Stops when something else comes up (a wild enemy on the way). */
  const follow = (keys: Press[]) => {
    for (const key of keys) {
      if (key !== 'a' && !calm(state)) return;
      press(key === 'a' ? { a: true } : { dir: key, pressed: key });
    }
  };

  while (!state.finished && presses < maxPresses) {
    // A menu is closed again, and so is a shop: the bot never buys, so the game is proven without spending a coin.
    if (state.menu || state.shop) {
      press({ b: true });
      continue;
    }
    if (busy()) {
      press({ a: true });
      continue;
    }

    const here = world.maps[state.map]!;
    const visible = (object: GameObject) => {
      const at = placeOf(object, state);
      return objectAt(here, at.x, at.y, state) === object;
    };

    // Hurt or short of PP for the first move, and a coffee machine is in reach: rest first, as a careful player would.
    if (state.hp < state.maxHp || state.pp[state.moves[0]!]! < world.moves[state.moves[0]!]!.pp / 2) {
      const rest = here.objects.find((object) => visible(object) && heals(object, state) && routeIn(world, state, here.id, state, object));
      if (rest) {
        if (walk(routeIn(world, state, here.id, state, rest)!)) press({ a: true });
        continue;
      }
    }

    // Look for something not tried yet since the last bit of progress: here first, then through the doors.
    const key = progress(state);
    known.add(key);
    const seen = new Set<string>();
    type Node = { map: string; at: Cell; first: Dir[] | null };
    const queue: Node[] = [{ map: state.map, at: state, first: null }];
    let plan: { route: Dir[]; talk: GameObject | null } | null = null;

    for (let node = queue.shift(); node && !plan; node = queue.shift()) {
      if (seen.has(`${node.map}:${node.at.x},${node.at.y}`)) continue;
      seen.add(`${node.map}:${node.at.x},${node.at.y}`);
      const map = world.maps[node.map]!;
      const reach = walks(world, state, node.map, node.at, true);
      for (const object of map.objects) {
        const at = placeOf(object, state);
        if (object.branches.length === 0 || objectAt(map, at.x, at.y, state) !== object) continue;
        const route = facing(reach, at);
        if (!route) continue;
        if (object.trigger === 'interact') {
          if (tried.has(`${object.id}|${key}`)) continue;
          // The wrong switch of a riddle would only put the others out again.
          if (undoes(branchFor(object, state)?.do ?? [])) continue;
          plan = { route: node.first ?? route, talk: node.first ? null : object };
          break;
        }
        if (!passable(object, state)) continue;
        const warp = branchFor(object, state)?.do.find((action) => 'warp' in action);
        const first = node.first ?? route;
        if (warp && 'warp' in warp) {
          const spot = resolveSpot(world, warp.warp);
          queue.push({ map: spot.map, at: spot, first });
        } else {
          // A door inside a map: carry on from the cell behind it.
          const dir = route.at(-1)!;
          queue.push({ map: node.map, at: { x: at.x + DELTA[dir].dx, y: at.y + DELTA[dir].dy }, first: node.first ?? [...route, dir] });
        }
      }
    }

    // Nothing new to walk to on this map, and it has a puzzle: look for presses that get somewhere new.
    if (!plan?.talk && puzzling(here)) {
      const keys = solve(quiet(world, here.id), state, (next) => calm(next) && !known.has(progress(next)));
      if (keys) {
        follow(keys);
        continue;
      }
    }

    if (!plan) {
      stuck = true;
      break;
    }
    // Only what is really faced counts as tried: a stroller may have walked off in the meantime.
    if (walk(plan.route) && plan.talk && !busy() && faced() === plan.talk) {
      tried.add(`${plan.talk.id}|${key}`);
      press({ a: true });
    }
  }

  return { state, events, defeats: events.filter((event) => event.kind === 'defeat').length, presses, stuck };
}
