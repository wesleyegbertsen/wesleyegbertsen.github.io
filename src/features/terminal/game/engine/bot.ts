import { initialGame, step } from './engine.ts';
import { NO_INPUT, type Dir, type GameEvent, type GameObject, type GameState, type Input, type World } from './types.ts';
import { DELTA, branchFor, objectAt, passable, resolveSpot, tileAt } from './world.ts';

/**
 * A player that knows nothing about the story: it talks to everything it can reach, walks through every door that
 * lets it, rests when it is hurt and presses A through every dialogue and battle (so it always takes the default
 * choice). The tests use it to prove that the game can be finished; the browser tests use `routeTo` to find keys.
 * Not part of the game itself.
 */

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

type Cell = { x: number; y: number };

function free(world: World, state: GameState, mapId: string, x: number, y: number): boolean {
  const map = world.maps[mapId]!;
  return !tileAt(world, map, x, y).solid && !objectAt(map, x, y, state);
}

/** The shortest walk from `from` to each cell it can reach on a map, never stepping on objects. */
function walks(world: World, state: GameState, mapId: string, from: Cell, grassOk: boolean): Map<string, Dir[]> {
  const found = new Map<string, Dir[]>([[`${from.x},${from.y}`, []]]);
  const queue: Cell[] = [from];
  for (let cell = queue.shift(); cell; cell = queue.shift()) {
    const path = found.get(`${cell.x},${cell.y}`)!;
    for (const dir of DIRS) {
      const x = cell.x + DELTA[dir].dx;
      const y = cell.y + DELTA[dir].dy;
      if (found.has(`${x},${y}`) || !free(world, state, mapId, x, y)) continue;
      if (!grassOk && tileAt(world, world.maps[mapId]!, x, y).grass) continue;
      found.set(`${x},${y}`, [...path, dir]);
      queue.push({ x, y });
    }
  }
  return found;
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
  const reach = walks(world, state, mapId, from, grassOk);
  let best: Dir[] | null = null;
  for (const dir of DIRS) {
    const path = reach.get(`${object.x - DELTA[dir].dx},${object.y - DELTA[dir].dy}`);
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
  JSON.stringify([Object.keys(state.flags).sort(), Object.keys(state.items).filter((id) => state.items[id]! > 0).sort(), state.badges]);

const heals = (object: GameObject, state: GameState) =>
  object.trigger === 'interact' && !!branchFor(object, state)?.do.some((action) => 'heal' in action);

export type BotRun = { state: GameState; events: GameEvent[]; defeats: number; presses: number; stuck: boolean };

/** Plays from the title screen until the ending, or until nothing new is left to try. */
export function playthrough(world: World, seed = 1, maxPresses = 20_000): BotRun {
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
  const busy = () => state.scene !== 'world' || !!state.dialogue || !!state.battle || !!state.menu;
  /** Walks a route; stops early when something interrupts (a wild enemy). True when it got to the end. */
  const walk = (route: Dir[]) => {
    for (const [i, dir] of route.entries()) {
      press({ dir, pressed: dir });
      if (busy() && i < route.length - 1) return false;
    }
    return true;
  };

  while (!state.finished && presses < maxPresses) {
    if (state.menu) {
      press({ b: true });
      continue;
    }
    if (busy()) {
      press({ a: true });
      continue;
    }

    const here = world.maps[state.map]!;
    const visible = (object: GameObject) => objectAt(here, object.x, object.y, state) === object;

    // Hurt, and a coffee machine is in reach: rest first, as a careful player would.
    if (state.hp < state.maxHp) {
      const rest = here.objects.find((object) => visible(object) && heals(object, state) && routeIn(world, state, here.id, state, object));
      if (rest) {
        if (walk(routeIn(world, state, here.id, state, rest)!)) press({ a: true });
        continue;
      }
    }

    // Look for something not tried yet since the last bit of progress: here first, then through the doors.
    const key = progress(state);
    const seen = new Set<string>();
    type Node = { map: string; at: Cell; first: Dir[] | null };
    const queue: Node[] = [{ map: state.map, at: state, first: null }];
    let plan: { route: Dir[]; talk: GameObject | null } | null = null;

    for (let node = queue.shift(); node && !plan; node = queue.shift()) {
      if (seen.has(`${node.map}:${node.at.x},${node.at.y}`)) continue;
      seen.add(`${node.map}:${node.at.x},${node.at.y}`);
      const map = world.maps[node.map]!;
      for (const object of map.objects) {
        if (object.branches.length === 0 || objectAt(map, object.x, object.y, state) !== object) continue;
        const route = routeIn(world, state, node.map, node.at, object);
        if (!route) continue;
        if (object.trigger === 'interact') {
          if (tried.has(`${object.id}|${key}`)) continue;
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
          queue.push({ map: node.map, at: { x: object.x + DELTA[dir].dx, y: object.y + DELTA[dir].dy }, first: node.first ?? [...route, dir] });
        }
      }
    }

    if (!plan) {
      stuck = true;
      break;
    }
    if (walk(plan.route) && plan.talk) {
      tried.add(`${plan.talk.id}|${key}`);
      press({ a: true });
    }
  }

  return { state, events, defeats: events.filter((event) => event.kind === 'defeat').length, presses, stuck };
}
