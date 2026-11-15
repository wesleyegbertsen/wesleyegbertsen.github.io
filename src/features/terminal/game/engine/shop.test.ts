import { initialGame, step } from './engine.ts';
import { coinsFor, money } from './shop.ts';
import { playIn, shopWorld as world, testWorld } from './testWorld.ts';
import { NO_INPUT, type Cue, type GameEvent, type GameState, type Input } from './types.ts';

/**
 * Money and the shop, on shopWorld (see testWorld.ts): 45 COINS to start with, a wild RAT (level 2) drops 4, the
 * RAT that stands guard 20; a purse holds 7; the kiosk sells COFFEE for 10, GREEN TEA for 25 and a KEY for 100,
 * and the bag takes three of a kind.
 */

type Told = { state: GameState; events: GameEvent[]; cues: Cue[] };

const press = (state: GameState, input: Partial<Input>): Told => step(state, { ...NO_INPUT, ...input }, world, { instant: true });
const play = (state: GameState, ...inputs: Parameters<typeof playIn>[2][]) => playIn(world, state, ...inputs);

/** Presses A until the battle is over, and tells what was said and heard on the way. */
function fight(from: GameState): Told {
  const told: Told = { state: from, events: [], cues: [] };
  for (let i = 0; i < 200 && told.state.battle; i++) {
    const next = press(told.state, { a: true });
    told.state = next.state;
    told.events.push(...next.events);
    told.cues.push(...next.cues);
  }
  expect(told.state.battle).toBeNull();
  return told;
}

const started = (seed = 7) => play(initialGame(world, seed), 'a', 'a');
/** Into the tall grass: a wild RAT. */
const wild = (seed = 7) => play(started(seed), 'down', 'right');
/** Up to the RAT that stands guard (a boss), past its line. */
const boss = (seed = 7) => play(started(seed), 'down', 'down', 'right', 'a', 'a');
/** In the kiosk, the cursor on the first item. */
const shopping = (from = started()) => play(from, 'down', 'left', 'a', 'a');

describe('coins', () => {
  it('start at what the world gives, and at nothing in a world without money', () => {
    expect(initialGame(world).coins).toBe(45);
    expect(initialGame(testWorld).coins).toBe(0);
  });

  it('are worth more per level, and far more for a boss than for a wild enemy of the same level', () => {
    expect(coinsFor(1, true, world)).toBe(2);
    expect(coinsFor(7, true, world)).toBe(14);
    expect(coinsFor(3, false, world)).toBe(30);
    for (let level = 1; level < 10; level++) {
      expect(coinsFor(level + 1, true, world)).toBeGreaterThan(coinsFor(level, true, world));
      expect(coinsFor(level, false, world)).toBeGreaterThanOrEqual(5 * coinsFor(level, true, world));
    }
  });

  it('are named in the singular for one', () => {
    expect(money(1, world)).toBe('1 COIN');
    expect(money(0, world)).toBe('0 COINS');
    expect(money(12, world)).toBe('12 COINS');
    expect(money(1, { ...world, economy: { ...world.economy, currency: 'EUR' } })).toBe('1 EUR');
  });

  it('drop from a wild enemy by its level, with a line and a sound, when that line shows and not before', () => {
    const before = wild();
    expect(before.battle).toMatchObject({ enemy: 'rat', level: 2, wild: true });
    const { state, events, cues } = fight(before);
    expect(state.coins).toBe(45 + 4);
    expect(events.map((event) => event.text)).toContain('You pick up 4 COINS.');
    expect(cues).toContain('coin');

    // Line by line: the coins are still the old ones while the enemy's defeat is on the screen.
    let current = before;
    for (let i = 0; i < 200 && !current.battle?.cheer; i++) current = press(current, { a: true }).state;
    expect(current.battle?.steps[0]?.text).toBe('RAT ran off.');
    expect(current.coins).toBe(45);
    const paid = press(current, { a: true });
    expect(paid.events).toEqual([{ kind: 'battle', text: 'You pick up 4 COINS.' }]);
    expect(paid.cues).toEqual(['coin']);
    expect(paid.state.coins).toBe(49);
  });

  it('drop five times as many from a boss', () => {
    const { state, events } = fight(boss());
    expect(state.coins).toBe(45 + 20);
    expect(events.map((event) => event.text)).toContain('You pick up 20 COINS.');
  });

  it('drop more from a wild enemy that shows up at a higher level', () => {
    const levels = { ...world, maps: { ...world.maps, main: { ...world.maps.main!, encounters: { enemies: ['rat'], rate: 1, levels: [5, 5] as [number, number] } } } };
    // Enough PP to see it through: it has more energy at that level.
    let state = playIn(levels, { ...playIn(levels, initialGame(levels, 7), 'a', 'a'), pp: { hit: 9, nap: 1 } }, 'down', 'right');
    expect(state.battle?.level).toBe(5);
    for (let i = 0; i < 200 && state.battle; i++) state = playIn(levels, state, 'a');
    expect(state.coins).toBe(45 + 10);
  });

  it('do not drop when the player runs, and none are lost on a defeat', () => {
    const ran = play(wild(), 'a', 'down', 'down', 'a', 'a');
    expect(ran.battle).toBeNull();
    expect(ran.coins).toBe(45);

    // The ogre always wins.
    let lost = play(started(), 'down', 'down', 'left', 'a');
    expect(lost.battle?.enemy).toBe('ogre');
    for (let i = 0; i < 200 && lost.battle; i++) lost = play(lost, 'a');
    expect(lost.hp).toBe(lost.maxHp);
    expect(lost.coins).toBe(45);
  });

  it('are not mentioned in a world without money', () => {
    let state = playIn(testWorld, initialGame(testWorld, 7), 'a', 'a', 'down', 'right');
    const said: string[] = [];
    for (let i = 0; i < 200 && state.battle; i++) {
      const next = step(state, { ...NO_INPUT, a: true }, testWorld, { instant: true });
      said.push(...next.events.map((event) => event.text));
      state = next.state;
    }
    expect(said.join(' ')).not.toMatch(/COIN/);
    expect(state.coins).toBe(0);
  });

  it('come out of a purse once, with a line that says how many', () => {
    const faced = play(started(), 'left');
    const opened = press(faced, { a: true });
    expect(opened.state.coins).toBe(52);
    expect(opened.events).toEqual([{ kind: 'item', text: 'You got 7 COINS!' }]);
    expect(opened.cues).toContain('coin');
    expect(play(opened.state, 'a', 'a').coins).toBe(52);
  });
});

describe('the shop', () => {
  it('opens after the vendor has spoken, on its first item, and says what it is and what you have', () => {
    const talking = play(started(), 'down', 'left', 'a');
    expect(talking.dialogue).not.toBeNull();
    expect(talking.shop).toBeNull();
    const opened = press(talking, { a: true });
    expect(opened.state.shop).toEqual({ id: 'kiosk', cursor: 0, note: '' });
    expect(opened.state.dialogue).toBeNull();
    expect(opened.events.at(-1)).toEqual({ kind: 'menu', text: 'KIOSK. You have 45 COINS. A buys one, B leaves. COFFEE, 10 COINS: Restores 20 energy. In your bag: 0.' });
  });

  it('sells one of the item under the cursor per press of A: coins down, bag up, said and heard', () => {
    const bought = press(shopping(), { a: true });
    expect(bought.state.coins).toBe(35);
    expect(bought.state.items.coffee).toBe(1);
    expect(bought.state.shop).toMatchObject({ id: 'kiosk', cursor: 0 });
    expect(bought.events).toEqual([{ kind: 'item', text: 'You buy a COFFEE for 10 COINS. You have 1 now, and 35 COINS left.' }]);
    expect(bought.state.shop?.note).toBe(bought.events[0]!.text);
    expect(bought.cues).toEqual(['coin']);

    // The second item, and the note of the last press is gone when the cursor moves.
    const moved = press(bought.state, { dir: 'down', pressed: 'down' });
    expect(moved.state.shop).toEqual({ id: 'kiosk', cursor: 1, note: '' });
    expect(moved.cues).toEqual(['cursor']);
    expect(moved.events).toEqual([{ kind: 'menu', text: 'GREEN TEA, 25 COINS: Restores the PP of every move. In your bag: 0.' }]);
    const tea = press(moved.state, { a: true });
    expect(tea.state.coins).toBe(10);
    expect(tea.state.items).toMatchObject({ coffee: 1, tea: 1 });
  });

  it('sells nothing for more coins than the player has: nothing changes but the note that says why', () => {
    const dear = play(shopping(), 'down', 'down');
    expect(dear.shop?.cursor).toBe(2);
    const refused = press(dear, { a: true });
    expect(refused.state.coins).toBe(45);
    expect(refused.state.items.key).toBeUndefined();
    expect(refused.events).toEqual([{ kind: 'menu', text: 'Not enough COINS: the KEY is 100, you have 45.' }]);
    expect(refused.state.shop).toEqual({ id: 'kiosk', cursor: 2, note: 'Not enough COINS: the KEY is 100, you have 45.' });
    expect(refused.cues).toEqual(['bump']);
    expect({ ...refused.state, shop: null }).toEqual({ ...dear, shop: null });
  });

  it('never lets the coins go below nothing, whatever is pressed', () => {
    let state = shopping();
    const seen = new Set<number>();
    for (let i = 0; i < 60; i++) {
      state = play(state, i % 7 === 3 ? 'down' : i % 11 === 5 ? 'up' : 'a');
      if (!state.shop) state = shopping(state);
      expect(state.coins).toBeGreaterThanOrEqual(0);
      seen.add(state.coins);
    }
    const spent = 10 * (state.items.coffee ?? 0) + 25 * (state.items.tea ?? 0) + 100 * (state.items.key ?? 0);
    expect(state.coins).toBe(45 - spent);
    expect(seen.size).toBeGreaterThan(2);
  });

  it('sells no more of an item than the bag takes, even with coins to spare', () => {
    const full = play(shopping(), 'a', 'a', 'a');
    expect(full.items.coffee).toBe(3);
    expect(full.coins).toBe(15);
    const refused = press(full, { a: true });
    expect(refused.state.items.coffee).toBe(3);
    expect(refused.state.coins).toBe(15);
    expect(refused.events).toEqual([{ kind: 'menu', text: 'Your bag holds no more than 3 COFFEE.' }]);
    expect(refused.cues).toEqual(['bump']);
    // What was in the bag before counts too.
    const carried = press(shopping({ ...started(), items: { coffee: 3 } }), { a: true });
    expect(carried.state.items.coffee).toBe(3);
    expect(carried.state.coins).toBe(45);
  });

  it('buys nothing when it is left with B or with its last entry, and says goodbye', () => {
    const open = shopping();
    for (const leave of [['b'], ['down', 'down', 'down', 'a']] as const) {
      const out = play(open, ...leave);
      expect(out.shop).toBeNull();
      expect(out.coins).toBe(45);
      expect(out.items).toEqual(open.items);
      expect(out.dialogue?.pages).toEqual([['Bye now.']]);
      // What the vendor had still to do happens after the goodbye.
      expect(out.flags.shopped).toBeUndefined();
      const after = play(out, 'a');
      expect(after.dialogue).toBeNull();
      expect(after.flags.shopped).toBe(true);
    }
    expect(press(open, { b: true }).cues).toEqual(['cancel']);
    expect(press(play(open, 'down', 'down', 'down'), { a: true }).events).toEqual([{ kind: 'say', text: 'Bye now.' }]);
    expect(press(play(open, 'down', 'down'), { dir: 'down', pressed: 'down' }).events).toEqual([{ kind: 'menu', text: 'Leave the shop' }]);
  });

  it('keeps the cursor on the list and the player on the spot while it is open', () => {
    const open = shopping();
    expect(play(open, 'up')).toBe(open);
    expect(play(open, 'down', 'down', 'down', 'down', 'down').shop?.cursor).toBe(3);
    const pressed = play(open, 'left', 'right', 'start', 'select');
    expect(pressed).toBe(open);
    expect([pressed.x, pressed.y, pressed.menu]).toEqual([open.x, open.y, null]);
    // The clock stands still, as in a text box.
    expect(step(open, NO_INPUT, world).state).toBe(open);
  });

  it('does not open a shop the world does not know', () => {
    const none = { ...world, shops: {} };
    const state = playIn(none, initialGame(none, 7), 'a', 'a', 'down', 'left', 'a', 'a');
    expect(state.shop).toBeNull();
    expect(state.flags.shopped).toBe(true);
  });
});

describe('what the shop sells', () => {
  const menu = (state: GameState) => play(state, 'start');

  it('has a tea that makes every move fresh again, and refuses when they are', () => {
    const tired = { ...started(), items: { tea: 2 }, pp: { hit: 0, nap: 1 } };
    const used = press(menu(tired), { a: true });
    expect(used.state.pp).toEqual({ hit: 2, nap: 1 });
    expect(used.state.items.tea).toBe(1);
    expect(used.events.at(-1)?.text).toBe('You use the GREEN TEA. Every move is fresh again!');
    expect(used.cues).toContain('heal');
    const again = press(menu(play(used.state, 'a', 'b')), { a: true });
    expect(again.state.items.tea).toBe(1);
    expect(again.events.at(-1)?.text).toBe('Your moves are all fresh already.');
  });

  it('lets the tea be used in a battle, where it costs the turn, and not when the moves are fresh', () => {
    const fresh = play({ ...wild(), items: { tea: 1 } }, 'a', 'down', 'a', 'a');
    expect(fresh.battle?.steps[0]?.text).toBe('Your moves are all fresh already.');
    expect(fresh.items.tea).toBe(1);
    const tired = play({ ...wild(), items: { tea: 1 }, pp: { hit: 0, nap: 0 } }, 'a', 'down', 'a', 'a');
    expect(tired.battle?.steps[0]?.text).toBe('You use the GREEN TEA. Every move is fresh again!');
    expect(tired.pp).toEqual({ hit: 2, nap: 1 });
    expect(tired.items.tea).toBe(0);
    expect(tired.battle?.steps[1]?.text).toMatch(/^RAT uses NIBBLE/);
  });

  it('has a spray that keeps the wild things off for a number of steps in the grass, then says it wore off', () => {
    // Without it the grass of this world always hides a RAT.
    expect(wild().battle).not.toBeNull();
    const sprayed = press(menu({ ...started(), items: { spray: 1 } }), { a: true });
    expect(sprayed.state.repel).toBe(2);
    expect(sprayed.state.items.spray).toBe(0);
    expect(sprayed.events.at(-1)?.text).toBe('You use the BUG SPRAY. Wild things keep away for a while.');
    const first = play(sprayed.state, 'a', 'b', 'down', 'right');
    expect([first.x, first.y, first.battle, first.repel]).toEqual([3, 3, null, 1]);
    // Out of the grass and in again: the second and last safe step.
    const back = play(first, 'left');
    expect(back.repel).toBe(1);
    const last = press(back, { dir: 'right', pressed: 'right' });
    expect(last.state.battle).toBeNull();
    expect(last.state.repel).toBe(0);
    expect(last.events).toEqual([{ kind: 'item', text: 'The spray has worn off.' }]);
    expect(last.state.notice?.text).toBe('SPRAY OFF');
    // And then the grass is the grass again.
    expect(play(last.state, 'left', 'right').battle).not.toBeNull();
  });

  it('refuses a second spray while the first one works, and has no use for it in a battle', () => {
    const twice = press(menu({ ...started(), items: { spray: 2 }, repel: 5 }), { a: true });
    expect(twice.state.items.spray).toBe(2);
    expect(twice.events.at(-1)?.text).toBe('The last BUG SPRAY still works.');
    const fighting = play({ ...wild(), items: { spray: 1 } }, 'a', 'down', 'a');
    expect(fighting.battle?.steps[0]?.text).toBe('You have nothing to use.');
  });
});
