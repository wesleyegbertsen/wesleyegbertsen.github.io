import type { Cue, GameState, World } from './types.ts';

/**
 * What using an item does. Pure, and shared by the bag of the Start menu and the ITEM entry of a battle, so both
 * refuse and restore in the same words.
 */

/** The PP every move the player knows has when fresh. */
const freshPp = (state: GameState, world: World): Record<string, number> => Object.fromEntries(state.moves.map((id) => [id, world.moves[id]!.pp]));

/** The items that can be used in a battle: the ones that restore energy or PP and that the player carries. */
export function usableItems(state: GameState, world: World): string[] {
  return Object.keys(world.items).filter((id) => (world.items[id]!.heal !== undefined || world.items[id]!.restore) && state.items[id]! > 0);
}

/** Used: the state after it (one fewer in the bag) and what to say. Refused: only what to say; nothing is used up. */
export type Used = { ok: true; state: GameState; text: string; cue: Cue } | { ok: false; text: string };

/** Uses one of an item. Null for an item that is only carried (a key, a letter): it has nothing to use. */
export function applyItem(state: GameState, id: string, world: World): Used | null {
  const item = world.items[id]!;
  const spent = (): GameState => ({ ...state, items: { ...state.items, [id]: (state.items[id] ?? 0) - 1 } });
  if (item.heal !== undefined) {
    if (state.hp >= state.maxHp) return { ok: false, text: 'You are full of energy already.' };
    return { ok: true, state: { ...spent(), hp: Math.min(state.maxHp, state.hp + item.heal) }, text: `You use the ${item.name}. Energy restored!`, cue: 'heal' };
  }
  if (item.restore) {
    const fresh = freshPp(state, world);
    if (state.moves.every((move) => (state.pp[move] ?? 0) >= fresh[move]!)) return { ok: false, text: 'Your moves are all fresh already.' };
    return { ok: true, state: { ...spent(), pp: fresh }, text: `You use the ${item.name}. Every move is fresh again!`, cue: 'heal' };
  }
  if (item.repel !== undefined) {
    if (state.repel > 0) return { ok: false, text: `The last ${item.name} still works.` };
    return { ok: true, state: { ...spent(), repel: item.repel }, text: `You use the ${item.name}. Wild things keep away for a while.`, cue: 'item' };
  }
  return null;
}
