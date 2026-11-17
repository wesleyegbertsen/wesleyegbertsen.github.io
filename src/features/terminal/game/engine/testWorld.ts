import { NO_INPUT, type GameState, type Input, type Levels, type TileDef, type World } from './types.ts';
import { step } from './engine.ts';
import { parseMap } from './world.ts';

/** A tiny world for the engine's own tests, so they do not depend on the real story. */

const legend: Record<string, TileDef> = {
  '#': { sprite: 'iwall', solid: true },
  '.': { sprite: 'floor', solid: false },
  '"': { sprite: 'tallgrass', solid: false, grass: true },
};

const main = parseMap(
  {
    id: 'main',
    name: 'Main',
    ground: '.',
    rows: [
      '#######',
      '#c.s.k#',
      '#.@..D#',
      '#.."..#',
      '#o.n.L#',
      '#######',
    ],
    encounters: { enemies: ['rat'], rate: 1 },
    objects: {
      '@': { solid: false, trigger: 'interact', branches: [] },
      s: { sprite: 'sign', solid: true, trigger: 'interact', branches: [{ do: [{ say: ['Hello there.', 'Second paragraph.'] }] }] },
      D: { sprite: 'door', solid: true, trigger: 'step', branches: [{ do: [{ warp: { map: 'room', at: 'm', dy: -1, dir: 'up' } }] }] },
      k: { sprite: 'coffee', solid: true, trigger: 'interact', branches: [{ do: [{ heal: true }, { say: ['Rested.'] }] }] },
      c: {
        sprite: 'chest',
        spriteWhen: { flag: 'opened', sprite: 'chest-open' },
        solid: true,
        trigger: 'interact',
        branches: [{ when: { notFlag: 'opened' }, do: [{ flag: 'opened' }, { give: 'coffee' }] }, { do: [{ say: ['Empty.'] }] }],
      },
      n: {
        sprite: 'boss',
        solid: true,
        trigger: 'interact',
        hideWhen: { flag: 'beat' },
        branches: [{ do: [{ say: ['Fight!'] }, { battle: 'rat', win: [{ flag: 'beat' }, { badge: 'one' }, { give: 'key' }] }] }],
      },
      o: { sprite: 'boss', solid: true, trigger: 'interact', branches: [{ do: [{ battle: 'ogre', win: [] }] }] },
      L: {
        sprite: 'door',
        solid: true,
        trigger: 'step',
        branches: [{ when: { item: 'key' }, do: [], pass: true }, { do: [{ say: ['Locked.'] }] }],
      },
    },
  },
  legend,
);

const room = parseMap(
  {
    id: 'room',
    name: 'Room',
    ground: '.',
    rows: ['###', '#e#', '#.#', '#m#'],
    objects: {
      e: { sprite: 'wesley', solid: true, trigger: 'interact', branches: [{ do: [{ say: ['Bye.'] }, { ending: true }] }] },
      m: { sprite: 'mat', solid: false, trigger: 'step', branches: [{ do: [{ warp: { map: 'main', at: 'D', dx: -1, dir: 'left' } }] }] },
    },
  },
  legend,
);

export const testWorld: World = {
  title: 'TEST',
  subtitle: 'test',
  maps: { main, room },
  start: { map: 'main', at: '@', dir: 'down' },
  items: {
    coffee: { name: 'COFFEE', description: 'Restores 20 energy.', heal: 20 },
    key: { name: 'KEY', description: 'Opens a door.' },
  },
  startItems: {},
  moves: {
    hit: { name: 'HIT', power: 6, accuracy: 1, pp: 2 },
    nap: { name: 'NAP', power: 0, accuracy: 1, pp: 1, heal: 10 },
  },
  playerMoves: ['hit', 'nap'],
  fallbackMove: { name: 'FLAIL', power: 3, accuracy: 1, pp: 0 },
  enemies: {
    rat: { name: 'RAT', level: 2, hp: 10, sprite: 'bug', moves: [{ name: 'NIBBLE', power: 2, accuracy: 1, pp: 0 }], defeat: 'RAT ran off.' },
    ogre: { name: 'OGRE', level: 9, hp: 99, sprite: 'bug', moves: [{ name: 'SMASH', power: 50, accuracy: 1, pp: 0 }], defeat: 'OGRE fell.' },
  },
  badges: [{ id: 'one', name: 'FIRST BADGE' }],
  baseHp: 20,
  hpPerBadge: 5,
  // Out of reach: the tests of the story do not level up. levelWorld below is the one that does.
  levels: { max: 10, xp: [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000], hpPerLevel: 3, levelsPerPower: 2, wildXp: 3, bossXp: 10, enemyHpPerLevel: 2 },
  learn: {},
  // No money in the plain test world: the tests of the story do not count coins. shopWorld below is the one that does.
  economy: { currency: 'COINS', start: 0, wildCoins: 0, bossCoins: 0, bagLimit: 9 },
  shops: {},
  intro: ['Welcome.'],
  hints: [{ when: { badges: 1 }, text: 'Go to the door.' }, { text: 'Beat the rat.' }],
  ending: ['THE END'],
};

const QUICK: Levels = { max: 4, xp: [6, 20, 40], hpPerLevel: 3, levelsPerPower: 1, wildXp: 3, bossXp: 10, enemyHpPerLevel: 2 };

/** The same world with levels within reach: a wild RAT is worth 6 XP, which is level 2, and level 2 offers ZAP. */
export const levelWorld: World = {
  ...testWorld,
  moves: { ...testWorld.moves, zap: { name: 'ZAP', power: 9, accuracy: 1, pp: 3 } },
  levels: QUICK,
  learn: { 2: 'zap' },
};

/**
 * The same world with money: 45 COINS to start with, a wild RAT (level 2) drops 4 and the one that stands guard 20.
 * West of the start is a purse with 7 COINS (face left), and below it a vendor (go down, face left) with a kiosk:
 * COFFEE for 10, GREEN TEA for 25 and a KEY for 100. The bag takes three of a kind.
 */
export const shopWorld: World = {
  ...testWorld,
  maps: {
    ...testWorld.maps,
    main: {
      ...main,
      objects: [
        ...main.objects,
        { id: 'main:p', x: 1, y: 2, sprite: 'chest', solid: true, trigger: 'interact', branches: [{ when: { notFlag: 'purse' }, do: [{ flag: 'purse' }, { coins: 7 }] }] },
        { id: 'main:v', x: 1, y: 3, sprite: 'maker', solid: true, trigger: 'interact', branches: [{ do: [{ say: ['Welcome.'] }, { shop: 'kiosk' }, { flag: 'shopped' }] }] },
      ],
    },
  },
  items: {
    ...testWorld.items,
    tea: { name: 'GREEN TEA', description: 'Restores the PP of every move.', restore: true },
    spray: { name: 'BUG SPRAY', description: 'No wild enemies for 2 steps.', repel: 2 },
  },
  economy: { currency: 'COINS', start: 45, wildCoins: 2, bossCoins: 10, bagLimit: 3 },
  shops: {
    kiosk: {
      name: 'KIOSK',
      stock: [
        { item: 'coffee', price: 10 },
        { item: 'tea', price: 25 },
        { item: 'key', price: 100 },
      ],
      bye: ['Bye now.'],
    },
  },
};

type Press = keyof Input | Input['dir'];

/** Presses one thing per call in `world`, with reduced motion (a press is a whole move), and returns the new state. */
export function playIn(world: World, state: GameState, ...inputs: Press[]): GameState {
  let current = state;
  for (const name of inputs) {
    const input: Input =
      name === 'up' || name === 'down' || name === 'left' || name === 'right'
        ? { ...NO_INPUT, dir: name, pressed: name }
        : { ...NO_INPUT, [name as keyof Input]: true };
    current = step(current, input, world, { instant: true }).state;
  }
  return current;
}

/** The same in the plain test world. */
export const play = (state: GameState, ...inputs: Press[]): GameState => playIn(testWorld, state, ...inputs);
