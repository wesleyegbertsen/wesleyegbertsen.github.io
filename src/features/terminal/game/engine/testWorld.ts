import { NO_INPUT, type GameState, type Input, type TileDef, type World } from './types.ts';
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
    rat: { name: 'RAT', hp: 10, sprite: 'bug', moves: [{ name: 'NIBBLE', power: 2, accuracy: 1, pp: 0 }], defeat: 'RAT ran off.' },
    ogre: { name: 'OGRE', hp: 99, sprite: 'bug', moves: [{ name: 'SMASH', power: 50, accuracy: 1, pp: 0 }], defeat: 'OGRE fell.' },
  },
  badges: [{ id: 'one', name: 'FIRST BADGE' }],
  baseHp: 20,
  hpPerBadge: 5,
  intro: ['Welcome.'],
  hints: [{ when: { badges: 1 }, text: 'Go to the door.' }, { text: 'Beat the rat.' }],
  ending: ['THE END'],
};

/** Presses one thing per call, with reduced motion (a press is a whole move), and returns the new state. */
export function play(state: GameState, ...inputs: (keyof Input | Input['dir'])[]): GameState {
  let current = state;
  for (const name of inputs) {
    const input: Input =
      name === 'up' || name === 'down' || name === 'left' || name === 'right'
        ? { ...NO_INPUT, dir: name, pressed: name }
        : { ...NO_INPUT, [name as keyof Input]: true };
    current = step(current, input, testWorld, { instant: true }).state;
  }
  return current;
}
