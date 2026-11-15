import type { Cue, GameEvent, GameState, Input, ShopDef, World } from './types.ts';

/**
 * Money and the shop. Pure: coins are a number in the game state, a win is worth some by the enemy's level, and a
 * shop is a list that is bought from one item at a time. Nothing here is needed to finish the game.
 */

/** The coins a win is worth: a few per level of a wild enemy, far more per level of one that stood guard (a boss). */
export const coinsFor = (level: number, wild: boolean, world: World): number => level * (wild ? world.economy.wildCoins : world.economy.bossCoins);

/** "12 COINS", "1 COIN": an amount in the world's money. A currency that ends in S loses it for one. */
export function money(amount: number, world: World): string {
  const { currency } = world.economy;
  return `${amount} ${amount === 1 && currency.endsWith('S') ? currency.slice(0, -1) : currency}`;
}

/** Why an item cannot be bought right now, or null when it can: the bag is full of it, or the coins do not reach. */
export function refusal(state: GameState, shop: ShopDef, row: number, world: World): string | null {
  const entry = shop.stock[row];
  if (!entry) return null;
  const item = world.items[entry.item]!;
  if ((state.items[entry.item] ?? 0) >= world.economy.bagLimit) return `Your bag holds no more than ${world.economy.bagLimit} ${item.name}.`;
  if (state.coins < entry.price) return `Not enough ${world.economy.currency}: the ${item.name} is ${entry.price}, you have ${state.coins}.`;
  return null;
}

/** A row of a shop in words, for the status region: the item, its price and what it does, or the way out. */
export function rowText(state: GameState, shop: ShopDef, row: number, world: World): string {
  const entry = shop.stock[row];
  if (!entry) return 'Leave the shop';
  const item = world.items[entry.item]!;
  return `${item.name}, ${money(entry.price, world)}: ${item.description} In your bag: ${state.items[entry.item] ?? 0}.`;
}

type Ctx = { world: World; events: GameEvent[]; cues: Cue[] };

/** Opens a shop: the cursor on its first item. A shop the world does not know is not opened. */
export function openShop(state: GameState, id: string, ctx: Ctx): GameState {
  const shop = ctx.world.shops[id];
  if (!shop) return state;
  ctx.events.push({ kind: 'menu', text: `${shop.name}. You have ${money(state.coins, ctx.world)}. A buys one, B leaves. ${rowText(state, shop, 0, ctx.world)}` });
  return { ...state, shop: { id, cursor: 0, note: '' } };
}

/**
 * One press in a shop. Up and down move over the stock and the last entry, which leaves; so does B. A buys one of
 * the item under the cursor, unless the coins do not reach or the bag is full of it: then nothing changes but the
 * note that says why. Returns `left: true` when the shop was closed, so the engine can go on with the script.
 */
export function stepShop(state: GameState, input: Input, ctx: Ctx): { state: GameState; left: boolean } {
  const { world } = ctx;
  const open = state.shop!;
  const shop = world.shops[open.id]!;
  const last = shop.stock.length;
  if (input.pressed === 'up' || input.pressed === 'down') {
    const cursor = Math.max(0, Math.min(last, open.cursor + (input.pressed === 'up' ? -1 : 1)));
    if (cursor === open.cursor) return { state, left: false };
    ctx.cues.push('cursor');
    ctx.events.push({ kind: 'menu', text: rowText(state, shop, cursor, world) });
    return { state: { ...state, shop: { ...open, cursor, note: '' } }, left: false };
  }
  if (input.b || (input.a && open.cursor >= last)) {
    ctx.cues.push('cancel');
    return { state: { ...state, shop: null }, left: true };
  }
  if (!input.a) return { state, left: false };
  const entry = shop.stock[open.cursor]!;
  const no = refusal(state, shop, open.cursor, world);
  if (no) {
    ctx.cues.push('bump');
    ctx.events.push({ kind: 'menu', text: no });
    return { state: { ...state, shop: { ...open, note: no } }, left: false };
  }
  const coins = state.coins - entry.price;
  const owned = (state.items[entry.item] ?? 0) + 1;
  const note = `You buy a ${world.items[entry.item]!.name} for ${money(entry.price, world)}. You have ${owned} now, and ${money(coins, world)} left.`;
  ctx.cues.push('coin');
  ctx.events.push({ kind: 'item', text: note });
  return { state: { ...state, coins, items: { ...state.items, [entry.item]: owned }, shop: { ...open, note } }, left: false };
}
