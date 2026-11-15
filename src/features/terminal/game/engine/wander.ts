import { random } from './rng.ts';
import type { Dir, GameMap, GameObject, GameState, Roaming, World } from './types.ts';

/**
 * The townsfolk who stroll about. Pure: where they go follows from the game clock alone (not from the dice of the
 * battles), so the same walk always gives the same town, and a test or the browser pilot can replay it.
 *
 * The promises, which wander.test.ts checks: nobody leaves their range, nobody steps onto a road (so the way
 * between the doors is always free), onto tall grass, onto another thing or onto the player.
 */

/** How many ticks a stroller takes from cell to cell. The renderer slides them along. */
export const STROLL_TICKS = 16;

const STEPS: (Dir | null)[] = ['up', 'down', 'left', 'right', null, null];
const MOVE: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/** Where an object is right now: where the map puts it, unless it strolled off. */
export function placeOf(object: GameObject, state: Pick<GameState, 'roam'>): { x: number; y: number } {
  return state.roam[object.id] ?? object;
}

/** What a stroller does in turn number `turn`: a direction, or null for standing still. */
export function strollStep(index: number, turn: number): Dir | null {
  return STEPS[Math.floor(random(turn * 7919 + index * 104729 + 17).value * STEPS.length)]!;
}

/**
 * Moves the clock from `state.clock` to `clock` and lets every stroller on the current map whose turn came up in
 * between take a step. `settled` (reduced motion) makes the step whole at once instead of a slide. `gone` tells
 * which things are hidden by now (a beaten boss, a star that was picked up).
 */
export function stroll(
  state: GameState,
  world: World,
  clock: number,
  settled: boolean,
  gone: (object: GameObject) => boolean,
): GameState {
  const map: GameMap = world.maps[state.map]!;
  let roam = state.roam;
  map.objects.forEach((object, index) => {
    if (!object.wander || gone(object)) return;
    const { every, radius } = object.wander;
    // Each one has its own beat, so they do not all step at the same moment.
    const offset = (index * 37) % every;
    const turn = Math.floor((clock + offset) / every);
    if (turn === Math.floor((state.clock + offset) / every)) return;
    const dir = strollStep(index, turn);
    if (!dir) return;
    const from = roam[object.id] ?? object;
    const x = from.x + MOVE[dir].dx;
    const y = from.y + MOVE[dir].dy;
    if (Math.abs(x - object.x) > radius || Math.abs(y - object.y) > radius) return;
    const char = map.cells[y]?.[x];
    const tile = char === undefined ? undefined : map.tiles[char];
    if (!tile || tile.solid || tile.road || tile.grass) return;
    // The player's cell, and the one the player is leaving.
    if ((x === state.x && y === state.y) || (state.walk && x === state.walk.fromX && y === state.walk.fromY)) return;
    const taken = map.objects.some((other) => {
      if (other === object || gone(other)) return false;
      const at = roam[other.id] ?? other;
      return at.x === x && at.y === y;
    });
    if (taken) return;
    const side = dir === 'left' || dir === 'right' ? dir : roam[object.id]?.side;
    const next: Roaming = { x, y, fromX: from.x, fromY: from.y, at: settled ? clock - STROLL_TICKS : clock, dir, side };
    roam = { ...roam, [object.id]: next };
  });
  return { ...state, clock, roam };
}

/** How far a stroller is along its step, 0 to 1, for the renderer. */
export function strollProgress(roaming: Roaming, clock: number): number {
  return Math.max(0, Math.min(1, (clock - roaming.at) / STROLL_TICKS));
}
