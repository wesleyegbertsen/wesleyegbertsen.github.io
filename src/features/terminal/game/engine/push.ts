import type { GameMap, GameObject, GameState, World } from './types.ts';
import { placeOf } from './wander.ts';
import { objectAt, tileAt } from './world.ts';

/**
 * Things that are pushed about (boulders) and the pressure plates they are pushed onto. Pure.
 *
 * The rules, which push.test.ts checks:
 * - Walking into a pushable thing moves it one cell on and the player steps into its place. It only moves onto
 *   open ground with nothing on it: not onto a road (a doorway stays free), tall grass, a ledge or slippery ground.
 * - Where it is now is kept in `state.roam`, like the townsfolk who stroll: nothing but the game state changes.
 * - Once a pushed thing stands on every plate of the map, the map's `plates` flag is set for good and the things
 *   stay put from then on.
 * - Until then they go back to where the map put them whenever the player arrives on the map (a door, a ladder,
 *   a defeat) or pulls a reset lever. A thing whose own cell the player stands on stays where it is: a reset
 *   never puts anything on the player.
 */

/** Whether a thing can be pushed right now: it is made for it, and the puzzle of its map is not solved yet. */
export const loose = (object: GameObject, map: GameMap, state: Pick<GameState, 'flags'>): boolean =>
  !!object.push && !(map.plates && state.flags[map.plates.flag]);

/** Whether a pushed thing may be moved onto a cell. */
export function roomFor(map: GameMap, x: number, y: number, state: GameState): boolean {
  const tile = tileAt(map, x, y);
  if (tile.solid || tile.ledge || tile.road || tile.grass || tile.slide) return false;
  return !objectAt(map, x, y, state) && !(state.x === x && state.y === y);
}

/** How many plates of a map have a pushed thing on them. */
export function covered(map: GameMap, state: Pick<GameState, 'roam'>): number {
  const pushed = map.objects.filter((object) => object.push).map((object) => placeOf(object, state));
  return (map.plates?.cells ?? []).filter((cell) => pushed.some((at) => at.x === cell.x && at.y === cell.y)).length;
}

/** Whether the plates puzzle of a map is waiting to be marked as solved: every plate covered, the flag not set yet. */
export const platesDown = (map: GameMap, state: GameState): boolean =>
  !!map.plates && !state.flags[map.plates.flag] && covered(map, state) === map.plates.cells.length;

/**
 * `state.roam` with the pushed things of a map back where the map put them. Nothing happens once the puzzle of
 * the map is solved, and a thing whose own cell the player (at `x`, `y`) stands on stays where it was pushed to.
 */
export function putBack(state: GameState, world: World, mapId: string, at: { x: number; y: number } = state): GameState['roam'] {
  const map = world.maps[mapId];
  if (!map) return state.roam;
  const back = map.objects.filter((object) => state.roam[object.id] && loose(object, map, state) && !(object.x === at.x && object.y === at.y));
  if (back.length === 0) return state.roam;
  const roam = { ...state.roam };
  for (const object of back) delete roam[object.id];
  return roam;
}
