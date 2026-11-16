import { education } from '../../../../data/education.ts';
import { experience } from '../../../../data/experience.ts';
import { profile } from '../../../../data/profile.ts';
import { projects } from '../../../../data/projects.ts';
import { skills } from '../../../../data/skills.ts';
import type { FsData } from '../../fs.ts';
import { trackFor } from '../audio/director.ts';
import { playthrough, routeTo } from '../engine/bot.ts';
import { initialGame, step } from '../engine/engine.ts';
import { coinsFor, money } from '../engine/shop.ts';
import { COLS, ROWS, fold, wrap } from '../engine/text.ts';
import { NO_INPUT, type Action, type GameMap, type GameState, type Input } from '../engine/types.ts';
import { DELTA, resolveSpot } from '../engine/world.ts';
import { AREAS, BOSS_MIN_LEVEL, ECONOMY, FINAL_BOSSES, ITEMS, REWARDS, SHOPS, START_ITEMS } from './battles.ts';
import { REST_TICKS } from './music.ts';
import { CAFE_TEXT } from './story.ts';
import { buildWorld } from './world.ts';

/** The cafe in town: the place to rest and to wake up after a defeat, with a shop that nobody needs. */

const data: FsData = { profile, skills, experience, education, projects };
const world = buildWorld(data);
const town = world.maps.town!;
const cafe = world.maps.cafe!;

const told = (state: GameState, input: Partial<Input>) => step(state, { ...NO_INPUT, ...input }, world, { instant: true });
const press = (state: GameState, input: Partial<Input>) => told(state, input).state;
const busy = (state: GameState) => !!state.dialogue || !!state.battle || !!state.menu || !!state.learn;
/** Presses A until the text and the battles are over. A shop stays open: A would buy. */
function settle(state: GameState): GameState {
  let current = state;
  for (let i = 0; i < 400 && busy(current); i++) current = press(current, { a: true });
  expect(busy(current)).toBe(false);
  return current;
}
const started = (seed = 3) => settle(press(initialGame(world, seed), { a: true }));
/** Walks to a thing as the browser pilot does, a step at a time, and ends facing it (or through it, for a door). */
function goTo(state: GameState, id: string): GameState {
  let current = state;
  for (let i = 0; i < 600; i++) {
    const route = routeTo(world, current, id);
    if (!route) throw new Error(`No way to ${id} from ${current.map} ${current.x},${current.y}`);
    current = settle(press(current, { dir: route[0]!, pressed: route[0]! }));
    if (route.length === 1) return current;
  }
  throw new Error(`Never got to ${id}`);
}
const tileOf = (map: GameMap, x: number, y: number) => map.tiles[map.cells[y]?.[x] ?? ''];
const thing = (map: GameMap, char: string) => map.objects.find((object) => object.id === `${map.id}:${char}`)!;
const deep = (list: Action[]): Action[] => list.flatMap((action) => ('battle' in action ? [action, ...deep(action.win)] : [action]));
const heals = (map: GameMap) => map.objects.filter((object) => object.branches.some((branch) => branch.do.some((action) => 'heal' in action)));
/** Loses a wild battle on the spot: one energy left, and an enemy that always hits. */
function lose(state: GameState): GameState {
  let current: GameState = { ...state, hp: 1 };
  for (let i = 0; i < 400 && current.battle; i++) current = press({ ...current, hp: Math.min(current.hp, 1) }, { a: true });
  return current;
}
/** Into the tall grass of the town until a wild enemy jumps out. */
function ambushed(from: GameState): GameState {
  let state = goTo(from, 'town:3');
  // The star lies in the tall grass: pace about it until something bites. Battles on the way there were won.
  for (let i = 0; i < 400 && !state.battle; i++) state = press(state, { dir: i % 2 === 0 ? 'left' : 'right', pressed: i % 2 === 0 ? 'left' : 'right' });
  expect(state.battle?.wild).toBe(true);
  return state;
}

describe('the cafe in town', () => {
  it('is a building of its own: a canopy, a plaque with a cup, a door and a sign beside it', () => {
    const door = thing(town, 'X');
    expect(door.sprite).toBe('door-brick');
    expect(tileOf(town, door.x - 1, door.y)!.sprite).toBe('plaque-cafe');
    for (const dx of [-2, -1, 0, 1]) expect(tileOf(town, door.x + dx, door.y - 1)!.sprite, String(dx)).toBe('canopy');
    for (const dx of [-2, -1, 0, 1]) expect(tileOf(town, door.x + dx, door.y - 2)!.solid, String(dx)).toBe(true);
    // Only the cafe has them.
    const count = (sprite: string) => town.cells.flat().filter((char) => town.tiles[char]!.sprite === sprite).length;
    expect(count('plaque-cafe')).toBe(1);
    expect(count('canopy')).toBe(4);
    const sign = thing(town, 'b');
    expect(sign.sprite).toBe('sign');
    expect(Math.abs(sign.x - door.x)).toBeLessThanOrEqual(3);
    expect(sign.y).toBe(door.y);
    expect(sign.branches[0]!.do).toEqual([{ say: CAFE_TEXT.sign }]);
  });

  it('is reached from the start over the roads alone, and its door opens for everyone', () => {
    const door = thing(town, 'X');
    const start = resolveSpot(world, world.start);
    const seen = new Set([`${start.x},${start.y}`]);
    const queue = [{ x: start.x, y: start.y }];
    for (let cell = queue.shift(); cell; cell = queue.shift()) {
      for (const { dx, dy } of Object.values(DELTA)) {
        const next = { x: cell.x + dx, y: cell.y + dy };
        if (seen.has(`${next.x},${next.y}`) || !tileOf(town, next.x, next.y)?.road) continue;
        seen.add(`${next.x},${next.y}`);
        queue.push(next);
      }
    }
    expect(seen).toContain(`${door.x},${door.y + 1}`);
    expect(door.branches).toHaveLength(1);
    expect(door.branches[0]!.when).toBeUndefined();
    // Walked in from the very start, with nothing done yet; out again onto the road in front of the door.
    const inside = goTo(started(), 'town:X');
    expect(inside.map).toBe('cafe');
    expect(inside.area).toBe('Cafe');
    const out = goTo(inside, 'cafe:m');
    expect([out.map, out.x, out.y]).toEqual(['town', door.x, door.y + 1]);
  });

  it('is the only place to rest: no coffee machine is left anywhere, and nobody else restores energy and moves', () => {
    expect(town.objects.filter((object) => object.sprite === 'coffee')).toHaveLength(0);
    expect(heals(town)).toHaveLength(0);
    const machines = Object.fromEntries(Object.values(world.maps).map((map) => [map.id, map.objects.filter((object) => object.sprite === 'coffee').length]));
    expect(Object.values(machines).every((count) => count === 0)).toBe(true);
    // The barista alone. (Wesley's coffee between the rounds of the last fight heals too, but only after a won round.)
    const healers = Object.values(world.maps).flatMap((map) => heals(map).map((object) => object.id));
    expect(healers).toEqual(['cafe:B']);
    expect(heals(cafe).map((object) => object.id)).toEqual(['cafe:B']);
  });

  it('is a furnished room with a counter across it: the barista and the shopkeeper stand in it, nobody gets behind it', () => {
    const barista = thing(cafe, 'B');
    const keeper = thing(cafe, 'V');
    expect(barista.sprite).toBe('barista');
    expect(barista.y).toBe(keeper.y);
    expect(barista.wander).toBeUndefined();
    expect(keeper.wander).toBeUndefined();
    // The counter runs from the left wall to the wall at column 9 (the music corner is to the right of it, from 10)
    // on their row, so the cells behind it cannot be reached.
    for (let x = 1; x < 10; x++) {
      const solid = tileOf(cafe, x, barista.y)!.solid || x === barista.x || x === keeper.x;
      expect(solid, String(x)).toBe(true);
    }
    const sprites = new Set(cafe.cells.flat().map((char) => cafe.tiles[char]!.sprite));
    for (const sprite of ['counter', 'coffee', 'cupshelf', 'table', 'chair']) expect(sprites, sprite).toContain(sprite);
    const inside = goTo(started(), 'town:X');
    expect(routeTo(world, inside, 'cafe:B')).not.toBeNull();
    expect(routeTo(world, inside, 'cafe:V')).not.toBeNull();
    expect(routeTo(world, inside, 'cafe:1')).not.toBeNull();
  });

  it('plays a tune of its own', () => {
    const inside = goTo(started(), 'town:X');
    expect(trackFor(inside, world)).toBe('cafe');
    expect(trackFor(started(), world)).toBe('town');
  });
});

describe('the barista', () => {
  it('restores energy and the PP of every move, with the sound of it', () => {
    const tired = { ...goTo(started(), 'town:X'), hp: 3, pp: { debug: 0, refactor: 1, deploy: 0, break: 0 } };
    const result = told(goTo(tired, 'cafe:B'), { a: true });
    expect(result.state.hp).toBe(result.state.maxHp);
    expect(result.state.pp).toEqual({ debug: 25, refactor: 10, deploy: 5, break: 5 });
    // A rest: its jingle (`rest`), played through before she speaks when motion is allowed.
    expect(result.cues).toContain('rest');
    expect(thing(cafe, 'B').branches.every((branch) => branch.do.some((action) => 'heal' in action && action.rest === REST_TICKS))).toBe(true);
    expect(result.events.at(-1)?.text).toBe(CAFE_TEXT.barista[0]);
    // She turns to the player: a picture of her own for every side.
    expect(result.state.face).toMatchObject({ id: 'cafe:B', dir: 'down' });
  });

  it('never leaves you dry: someone without a COFFEE gets one, someone with one does not get another', () => {
    const dry = settle(press(goTo({ ...goTo(started(), 'town:X'), items: {}, coins: 0 }, 'cafe:B'), { a: true }));
    expect(dry.items.coffee).toBe(1);
    expect(dry.coins).toBe(0);
    const again = settle(press(dry, { a: true }));
    expect(again.items.coffee).toBe(1);
    const stocked = settle(press(goTo(goTo(started(), 'town:X'), 'cafe:B'), { a: true }));
    expect(stocked.items.coffee).toBe(START_ITEMS.coffee);
  });
});

describe('a defeat', () => {
  const inFront = () => ({ ...resolveSpot(world, { map: 'cafe', at: 'B', dy: 1 }), dir: 'up' });

  it('wakes the player up in the cafe, in front of the barista, rested, with nothing lost', () => {
    const before = { ...ambushed(started()), items: { coffee: 2, star: 1 }, coins: 33, xp: 4 };
    const result = lose(before);
    expect(result.battle).toBeNull();
    expect([result.map, result.x, result.y, result.dir]).toEqual(['cafe', inFront().x, inFront().y, 'up']);
    expect(result.dialogue?.pages.flat().join(' ')).toContain('Nothing was lost');
    expect(result.hp).toBe(result.maxHp);
    expect(result.pp).toEqual({ debug: 25, refactor: 10, deploy: 5, break: 5 });
    expect(result.items).toEqual({ coffee: 2, star: 1 });
    expect(result.coins).toBe(33);
    expect(result.xp).toBe(4);
    expect(result.flags).toEqual(before.flags);
    // She is right there: one press of A after the text and she talks.
    const after = settle(result);
    expect(after.area).toBe('Cafe');
    expect(told(after, { a: true }).state.face?.id).toBe('cafe:B');
  });

  it('is the cafe from anywhere: a building, the routes, the hills and both floors of the cave', () => {
    const fighting = ambushed(started());
    for (const [map, at] of [['academy', 'm'], ['west', ')'], ['east', '('], ['hills', '('], ['cave', 'm'], ['deep', 'u']] as const) {
      const there = { ...fighting, ...resolveSpot(world, { map, at, dx: map === 'west' ? -1 : map === 'east' || map === 'hills' ? 1 : 0, dy: map === 'academy' ? -1 : map === 'deep' ? 1 : 0 }) };
      if (map === 'cave') there.x -= 1;
      const after = lose(there);
      expect([after.map, after.x, after.y, after.dir], map).toEqual(['cafe', inFront().x, inFront().y, 'up']);
      expect(after.hp, map).toBe(after.maxHp);
    }
    expect(world.respawn).toEqual({ map: 'cafe', at: 'B', dy: 1, dir: 'up' });
  });

  it('is the cafe even after a rest between the rounds of the last fight', () => {
    // Wesley's coffee between two rounds heals, but the place to wake up stays the cafe.
    const healed = { ...started(), heal: resolveSpot(world, { map: 'contact', at: 'H', dy: 1 }) };
    expect(lose({ ...ambushed(healed), heal: healed.heal }).map).toBe('cafe');
  });

  it('is where a game starts out from too: a defeat in a building before any rest ends in the cafe', () => {
    expect(initialGame(world).heal).toMatchObject({ map: 'cafe', x: inFront().x, y: inFront().y });
    let state = goTo(started(), 'town:A');
    state = press(goTo(state, 'academy:E'), { a: true });
    for (let i = 0; i < 40 && !state.battle; i++) state = press(state, { a: true });
    expect(state.battle?.enemy).toBe('exam');
    expect(lose(state).map).toBe('cafe');
  });

});

describe('the shop in the cafe', () => {
  const shop = SHOPS.cafe!;
  /** In the cafe, the shopkeeper's welcome read: the shop is open. */
  const shopping = (from: GameState = started()) => {
    const talking = press(goTo(goTo(from, 'town:X'), 'cafe:V'), { a: true });
    let state = talking;
    for (let i = 0; i < 20 && state.dialogue; i++) state = press(state, { a: true });
    expect(state.shop).toMatchObject({ id: 'cafe', cursor: 0 });
    return state;
  };

  it('is opened by the shopkeeper, who says what the money is and where it comes from', () => {
    const keeper = thing(cafe, 'V');
    expect(keeper.branches).toHaveLength(1);
    expect(keeper.branches[0]!.do).toEqual([{ say: CAFE_TEXT.shop }, { shop: 'cafe' }]);
    expect(CAFE_TEXT.shop.join(' ')).toContain(ECONOMY.currency);
    expect(ECONOMY.currency).toBe('COINS');
    const open = shopping();
    expect(open.dialogue).toBeNull();
    // Out again with B: a goodbye, and the player stands where they stood.
    const out = settle(press(open, { b: true }));
    expect(out.shop).toBeNull();
    expect([out.map, out.x, out.y]).toEqual([open.map, open.x, open.y]);
  });

  it('sells things that are of use, each once on the shelf, for a price', () => {
    expect(shop.stock.length).toBeGreaterThanOrEqual(5);
    expect(shop.stock.length).toBeLessThanOrEqual(7);
    expect(new Set(shop.stock.map((entry) => entry.item)).size).toBe(shop.stock.length);
    for (const { item, price } of shop.stock) {
      const def = ITEMS[item]!;
      expect(def, item).toBeDefined();
      expect(def.heal !== undefined || def.restore || def.repel !== undefined, item).toBe(true);
      expect(Number.isInteger(price) && price > 0, item).toBe(true);
    }
    const sold = shop.stock.map((entry) => entry.item);
    for (const item of ['coffee', 'energydrink', 'tea', 'spray']) expect(sold).toContain(item);
    // What restores more costs more.
    const healing = shop.stock.filter((entry) => ITEMS[entry.item]!.heal !== undefined).sort((a, b) => ITEMS[a.item]!.heal! - ITEMS[b.item]!.heal!);
    expect(healing.map((entry) => entry.price)).toEqual([...healing.map((entry) => entry.price)].sort((a, b) => a - b));
    // Nothing on the shelf opens a door: keys, cards and prizes are not for sale.
    for (const item of ['diploma', 'keycard', 'librarycard', 'star', 'stamp', 'trophy', 'medal']) expect(sold).not.toContain(item);
  });

  it('has prices a new player can look at and one of them pay: the coins of the start buy a COFFEE, not everything', () => {
    const coffee = shop.stock.find((entry) => entry.item === 'coffee')!;
    expect(ECONOMY.start).toBeGreaterThanOrEqual(coffee.price);
    expect(ECONOMY.start).toBeLessThan(Math.max(...shop.stock.map((entry) => entry.price)));
    const open = shopping();
    expect(open.coins).toBe(ECONOMY.start);
    const at = shop.stock.indexOf(coffee);
    let state = open;
    for (let i = 0; i < at; i++) state = press(state, { dir: 'down', pressed: 'down' });
    const bought = told(state, { a: true });
    expect(bought.state.coins).toBe(ECONOMY.start - coffee.price);
    expect(bought.state.items.coffee).toBe(START_ITEMS.coffee! + 1);
    expect(bought.events).toEqual([{ kind: 'item', text: `You buy one COFFEE for ${money(coffee.price, world)}. ${money(ECONOMY.start - coffee.price, world)} left.` }]);
    // The dearest thing on the shelf is out of reach: said, and nothing changes.
    const dear = shop.stock.reduce((best, entry) => (entry.price > best.price ? entry : best));
    let last = bought.state;
    for (let i = at; i < shop.stock.indexOf(dear); i++) last = press(last, { dir: 'down', pressed: 'down' });
    const refused = told(last, { a: true });
    expect(refused.events[0]?.text).toMatch(/^Not enough COINS/);
    expect(refused.state.coins).toBe(bought.state.coins);
    expect(refused.state.items).toEqual(bought.state.items);
  });

  it('stops at the bag limit, however rich the player is', () => {
    expect(ECONOMY.bagLimit).toBe(9);
    let state = { ...shopping(), coins: 9999, items: {} as Record<string, number> };
    for (let i = 0; i < 20; i++) state = press(state, { a: true });
    const first = shop.stock[0]!;
    expect(state.items[first.item]).toBe(9);
    expect(state.coins).toBe(9999 - 9 * first.price);
    expect(state.shop?.note).toBe(`Your bag holds no more than 9 ${ITEMS[first.item]!.name}.`);
    // Picked all at once: right as often as it goes, then A.
    let many = { ...shopping(), coins: 9999, items: { [first.item]: 2 } as Record<string, number> };
    for (let i = 0; i < 20; i++) many = press(many, { dir: 'right', pressed: 'right' });
    expect(many.shop?.amount).toBe(7);
    many = press(many, { a: true });
    expect(many.items[first.item]).toBe(9);
    expect(many.coins).toBe(9999 - 7 * first.price);
  });

  it('never sells more than the purse can pay, however many are picked', () => {
    const coffee = shop.stock.findIndex((entry) => entry.item === 'coffee');
    let state = shopping();
    for (let i = 0; i < coffee; i++) state = press(state, { dir: 'down', pressed: 'down' });
    for (let i = 0; i < 20; i++) state = press(state, { dir: 'right', pressed: 'right' });
    expect(state.shop?.amount).toBe(Math.floor(ECONOMY.start / shop.stock[coffee]!.price));
    state = press(state, { a: true });
    expect(state.coins).toBe(ECONOMY.start % shop.stock[coffee]!.price);
    expect(state.coins).toBeGreaterThanOrEqual(0);
  });

  it('says everything in lines that fit the foot of the screen and the font', () => {
    const fits = (text: string) => {
      expect(fold(text), text).toBe(text);
      expect(wrap(text, COLS).length, text).toBeLessThanOrEqual(ROWS);
    };
    expect(shop.name.length).toBeLessThanOrEqual(12);
    for (const { item, price } of shop.stock) {
      const def = ITEMS[item]!;
      // The name, the count in the bag and the price share a row of the list.
      expect(def.name.length, item).toBeLessThanOrEqual(12);
      fits(def.description);
      fits(`You buy one ${def.name} for ${money(price, world)}. ${money(9999, world)} left.`);
      fits(`You buy ${ECONOMY.bagLimit} ${def.name} for ${money(price * ECONOMY.bagLimit, world)}. ${money(9999, world)} left.`);
      fits(`${ECONOMY.bagLimit} ${def.name} for ${money(price * ECONOMY.bagLimit, world)}.`);
      fits(`Not enough ${ECONOMY.currency} for ${ECONOMY.bagLimit} ${def.name}: that is ${price * ECONOMY.bagLimit}, you have ${price * ECONOMY.bagLimit - 1}.`);
      fits(`Not enough ${ECONOMY.currency}: the ${def.name} is ${price}, you have ${price - 1}.`);
      fits(`Your bag holds no more than ${ECONOMY.bagLimit} ${def.name}.`);
      fits(`You use the ${def.name}. Every move is fresh again!`);
      fits(`You use the ${def.name}. Wild things keep away for a while.`);
    }
    for (const line of [...CAFE_TEXT.sign, ...CAFE_TEXT.barista, ...CAFE_TEXT.refill, ...CAFE_TEXT.shop, ...CAFE_TEXT.regular('Wesley'), ...(shop.bye ?? [])]) expect(fold(line), line).toBe(line);
  });
});

describe('the money of the game', () => {
  it('drops by the level of the enemy: more further out, and a boss far more than anything wild', () => {
    const top = (area: string) => coinsFor(AREAS[area]!.levels[1], true, world);
    const low = (area: string) => coinsFor(AREAS[area]!.levels[0], true, world);
    for (const area of Object.keys(AREAS)) expect(low(area), area).toBeGreaterThan(0);
    expect(top('east')).toBeGreaterThan(top('town'));
    expect(top('west')).toBeGreaterThan(top('town'));
    expect(top('cave')).toBeGreaterThan(top('west'));
    const wildest = Math.max(...Object.keys(AREAS).map(top));
    for (const id of Object.keys(BOSS_MIN_LEVEL)) {
      const boss = world.enemies[id]!;
      expect(coinsFor(boss.level, false, world), id).toBeGreaterThan(wildest);
      expect(coinsFor(boss.level, false, world), id).toBeGreaterThanOrEqual(5 * coinsFor(boss.level, true, world));
    }
    // The first boss pays for a few coffees; a wild BUG for none.
    const coffee = SHOPS.cafe!.stock.find((entry) => entry.item === 'coffee')!.price;
    expect(coinsFor(world.enemies.exam!.level, false, world)).toBeGreaterThanOrEqual(2 * coffee);
    expect(coinsFor(1, true, world)).toBeLessThan(coffee);
  });

  /** Who hands out coins, and how many: `<object>:<amount>`, each once however many of its branches do it. */
  const handed = () => [...new Set(Object.values(world.maps).flatMap((map) => map.objects.flatMap((object) => object.branches.flatMap((branch) => deep(branch.do).flatMap((action) => ('coins' in action ? [`${object.id}:${action.coins}`] : []))))))].sort();

  it('is handed out here and there: for the two errands, the full stamp card, in a few chests and at the very end', () => {
    expect(handed()).toEqual(
      [
        `library:R:${REWARDS.letter}`,
        `town:?:${REWARDS.stars}`,
        `hills:?:${REWARDS.rally}`,
        `contact:H:${REWARDS.finale}`,
        `east:C:${REWARDS.chests['chest:east']}`,
        `west:C:${REWARDS.chests['chest:west']}`,
        `cave:E:${REWARDS.chests['chest:cave']}`,
        `cave:G:${REWARDS.chests['chest:cave3']}`,
      ].sort(),
    );
    // Some chests, not all of them: the ones off the main path.
    const chests = Object.values(world.maps).flatMap((map) => map.objects.filter((object) => object.sprite === 'chest'));
    expect(Object.keys(REWARDS.chests).length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(REWARDS.chests).length).toBeLessThan(chests.length);
    // Every amount that is written down is handed out by someone: a chest that was renamed does not lose its coins unseen.
    expect(handed()).toHaveLength(4 + Object.keys(REWARDS.chests).length);
    for (const amount of [REWARDS.letter, REWARDS.stars, REWARDS.rally, REWARDS.finale, ...Object.values(REWARDS.chests)]) expect(Number.isInteger(amount) && amount > 0, String(amount)).toBe(true);
  });

  it('stays modest: a chest holds less than the first boss drops, and all the gifts together less than the four badge bosses', () => {
    const drop = (id: string) => coinsFor(world.enemies[id]!.level, false, world);
    for (const [flag, amount] of Object.entries(REWARDS.chests)) expect(amount, flag).toBeLessThan(drop('exam'));
    const gifts = REWARDS.letter + REWARDS.stars + REWARDS.rally + Object.values(REWARDS.chests).reduce((sum, amount) => sum + amount, 0);
    expect(gifts).toBeLessThanOrEqual(drop('exam') + drop('legacy') + drop('scope') + drop('deadline'));
    // The pay at the very end is no more than the last boss drops, and no gift is worth more than it.
    expect(REWARDS.finale).toBeLessThanOrEqual(drop(FINAL_BOSSES.at(-1)!));
    expect(Math.max(REWARDS.letter, REWARDS.stars, REWARDS.rally)).toBeLessThanOrEqual(REWARDS.finale);
  });

  it('lies in a chest beside its item: opened once, the item first, then the coins with a line and a sound', () => {
    const chest = thing(world.maps.east!, 'C');
    const amount = REWARDS.chests['chest:east']!;
    const before = goTo({ ...started(), ...resolveSpot(world, { map: 'east', at: '(', dx: 1 }) }, 'east:C');
    // Whatever the wild things on the way there dropped is in the purse already.
    const purse = before.coins;
    const opened = told(before, { a: true });
    expect(opened.events.at(-1)?.text).toMatch(/^You got the ENERGY DRINK!/);
    expect(opened.state.coins).toBe(purse);
    let paid = told(opened.state, { a: true });
    for (let i = 0; i < 5 && paid.state.coins === purse && paid.state.dialogue; i++) paid = told(paid.state, { a: true });
    expect(paid.events.at(-1)).toEqual({ kind: 'item', text: `You got ${money(amount, world)}!` });
    expect(paid.cues).toContain('coin');
    expect(paid.state.coins).toBe(purse + amount);
    const done = settle(paid.state);
    expect(done.flags['chest:east']).toBe(true);
    expect(chest.spriteWhen).toEqual({ flag: 'chest:east', sprite: 'chest-open' });
    // Again: it is empty.
    const again = told(done, { a: true });
    expect(again.events.at(-1)?.text).toBe('It is empty.');
    expect(settle(again.state).coins).toBe(purse + amount);
    // A chest without coins says nothing about them.
    const plain = thing(town, 'C').branches.flatMap((branch) => branch.do);
    expect(plain.some((action) => 'coins' in action)).toBe(false);
  });

  it('is never needed: no door, boss, badge or ending asks for a coin, and the only one who takes any is the shop', () => {
    // A condition cannot even ask for coins: the shop is the one place where they go down.
    const asks = Object.values(world.maps).flatMap((map) => map.objects.flatMap((object) => object.branches.map((branch) => Object.keys(branch.when ?? {}))));
    expect(asks.flat()).not.toContain('coins');
    const opens = Object.values(world.maps).flatMap((map) => map.objects.filter((object) => object.branches.some((branch) => deep(branch.do).some((action) => 'shop' in action))).map((object) => object.id));
    expect(opens).toEqual(['cafe:V']);
    // The shopkeeper does nothing else: no item, flag, badge or way through hangs on a visit.
    expect(thing(cafe, 'V').branches.flatMap((branch) => branch.do).every((action) => 'say' in action || 'shop' in action)).toBe(true);
  });

  it('leaves the main path open to someone with no coffee and no coins: the barista pours one for the key card', () => {
    let state: GameState = { ...started(), items: { diploma: 1 }, coins: 0 };
    state = goTo(state, 'town:O');
    state = settle(press(goTo(state, 'office:1'), { a: true }));
    expect(state.items.keycard).toBeUndefined();
    state = settle(press(goTo(goTo(goTo(state, 'office:m'), 'town:X'), 'cafe:B'), { a: true }));
    expect(state.items.coffee).toBe(1);
    state = settle(press(goTo(goTo(goTo(state, 'cafe:m'), 'town:O'), 'office:1'), { a: true }));
    expect(state.items.keycard).toBe(1);
    expect(state.coins).toBe(0);
  });
});

describe('a bot that never buys', () => {
  const runs = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => ({ seed, run: playthrough(world, seed) }));

  it.each(runs)('finishes the game with every coin it ever got still in its pocket (seed $seed)', ({ run }) => {
    expect(run.state.finished).toBe(true);
    expect(run.defeats).toBe(0);
    const texts = run.events.map((event) => event.text);
    const sum = (pattern: RegExp) => texts.reduce((total, text) => total + Number(pattern.exec(text)?.[1] ?? 0), 0);
    const dropped = sum(/^You pick up (\d+) COINS?\.$/);
    const handed = sum(/^You got (\d+) COINS?!$/);
    expect(dropped).toBeGreaterThan(0);
    expect(run.state.coins).toBe(ECONOMY.start + dropped + handed);
    expect(texts.some((text) => /^You buy/.test(text))).toBe(false);
    // Its bag holds nothing that only the shop has.
    for (const item of ['stroopwafel', 'tea', 'spray']) expect(run.state.items[item] ?? 0, item).toBe(0);
    expect(run.state.shop).toBeNull();
  });

  it('does walk into the shop on its way, looks, and leaves', () => {
    const { run } = runs[0]!;
    const texts = run.events.map((event) => event.text);
    expect(texts.some((text) => text.startsWith(`${SHOPS.cafe!.name}. You have`))).toBe(true);
    expect(texts).toContain(SHOPS.cafe!.bye![0]);
    expect(texts).toContain(CAFE_TEXT.barista[0]);
  });
});
