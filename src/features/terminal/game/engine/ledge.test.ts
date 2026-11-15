import { routeTo } from './bot.ts';
import { JUMP_TICKS, WALK_TICKS, initialGame, step } from './engine.ts';
import { testWorld } from './testWorld.ts';
import { NO_INPUT, type Dir, type GameState, type TileDef, type World } from './types.ts';
import { landing, parseMap } from './world.ts';

/** Ledges: a step in the ground that is hopped over one way, and is a wall from every other side. */

const legend: Record<string, TileDef> = {
  '#': { sprite: 'iwall', solid: true },
  '.': { sprite: 'floor', solid: false },
  '"': { sprite: 'tallgrass', solid: false, grass: true },
  '>': { sprite: 'ledge-right', solid: true, ledge: 'right' },
  v: { sprite: 'ledge-down', solid: true, ledge: 'down' },
};

const field = parseMap(
  {
    id: 'field',
    name: 'Field',
    ground: '.',
    rows: [
      '#########',
      '#@.>....#', // a plain hop
      '#..>"...#', // lands in the tall grass
      '#..>s...#', // a sign stands where the hop would land
      '#..>>...#', // another ledge where the hop would land
      '#.....v.#', // one that is hopped down
      '#..>m...#', // a mat where the hop lands
      '#########',
    ],
    encounters: { enemies: ['rat'], rate: 1 },
    objects: {
      '@': { solid: false, trigger: 'interact', branches: [] },
      s: { sprite: 'sign', solid: true, trigger: 'interact', branches: [{ do: [{ say: ['A sign.'] }] }] },
      m: { sprite: 'mat', solid: false, trigger: 'step', branches: [{ pass: true, do: [{ flag: 'mat' }] }] },
    },
  },
  legend,
);

/** One way only: the sign `b` is behind a ledge, the sign `a` in front of it. */
const lane = parseMap(
  {
    id: 'lane',
    name: 'Lane',
    ground: '.',
    rows: ['########', '#a.@>.b#', '########'],
    objects: {
      '@': { solid: false, trigger: 'interact', branches: [] },
      a: { sprite: 'sign', solid: true, trigger: 'interact', branches: [{ do: [{ say: ['A.'] }] }] },
      b: { sprite: 'sign', solid: true, trigger: 'interact', branches: [{ do: [{ say: ['B.'] }] }] },
    },
  },
  legend,
);

const world: World = { ...testWorld, maps: { field, lane }, start: { map: 'field', at: '@', dir: 'down' } };

const at = (x: number, y: number, map = 'field'): GameState => ({ ...initialGame(world, 7), scene: 'world', area: map === 'field' ? 'Field' : 'Lane', map, x, y });
const move = (state: GameState, dir: Dir, instant = true) => step(state, { ...NO_INPUT, dir, pressed: dir }, world, { instant });

describe('a ledge', () => {
  it('is hopped over from the side it allows: one press, two cells, with a sound of its own', () => {
    const hop = move(at(2, 1), 'right');
    expect(hop.state).toMatchObject({ x: 4, y: 1, dir: 'right', walk: null });
    expect(hop.cues).toEqual(['jump']);
    const down = move(at(6, 4), 'down');
    expect(down.state).toMatchObject({ x: 6, y: 6, dir: 'down' });
    expect(down.cues).toEqual(['jump']);
  });

  it('is a wall from the other side and from beside it: the player turns, bumps and stays', () => {
    const back = move(at(4, 1), 'left');
    expect(back.state).toMatchObject({ x: 4, y: 1, dir: 'left', walk: null });
    expect(back.cues).toEqual(['bump']);
    // Up against one that goes down, and into it from the left and the right.
    expect(move(at(6, 6), 'up').state).toMatchObject({ x: 6, y: 6, dir: 'up' });
    expect(move(at(5, 5), 'right').state).toMatchObject({ x: 5, y: 5 });
    expect(move(at(7, 5), 'left').state).toMatchObject({ x: 7, y: 5 });
    expect(move(at(7, 5), 'left').cues).toEqual(['bump']);
    // Along a line of ledges: from the one below, a ledge is a wall too.
    expect(move(at(2, 1), 'right').state.x).toBe(4);
    expect(landing(field, 3, 2, 'up')).toBeNull();
  });

  it('is not hopped when something stands where the hop would land, or when that is a ledge or a wall', () => {
    const sign = move(at(2, 3), 'right');
    expect(sign.state).toMatchObject({ x: 2, y: 3, dir: 'right' });
    expect(sign.cues).toEqual(['bump']);
    const ledge = move(at(2, 4), 'right');
    expect(ledge.state).toMatchObject({ x: 2, y: 4 });
    expect(ledge.cues).toEqual(['bump']);
    expect(landing(field, 2, 4, 'right')).toBeNull();
  });

  it('takes JUMP_TICKS for the two cells when motion is allowed, and the hop is marked as one', () => {
    expect(JUMP_TICKS).toBeGreaterThan(WALK_TICKS);
    const held = { ...NO_INPUT, dir: 'right' as const };
    let state = step(at(2, 1), held, world).state;
    expect(state).toMatchObject({ x: 4, y: 1, walk: { fromX: 2, fromY: 1, t: 0, jump: true } });
    for (let i = 0; i < JUMP_TICKS - 1; i++) state = step(state, NO_INPUT, world).state;
    expect(state.walk).toMatchObject({ t: JUMP_TICKS - 1, jump: true });
    // Landed, and still holding the direction: the next step is a plain one.
    state = step(state, held, world).state;
    expect(state).toMatchObject({ x: 5, walk: { fromX: 4, t: 0 } });
    expect(state.walk?.jump).toBeUndefined();
    // A plain step is not a hop.
    expect(step(at(1, 1), held, world).state.walk?.jump).toBeUndefined();
    // Reduced motion switched on in the middle of a hop: it lands at once.
    const mid = step(at(2, 1), held, world).state;
    expect(step(mid, NO_INPUT, world, { instant: true }).state).toMatchObject({ x: 4, walk: null });
  });

  it('lands like any step does: in the tall grass something may jump out, and a mat is stepped on', () => {
    const wild = move(at(2, 2), 'right');
    expect(wild.state).toMatchObject({ x: 4, y: 2 });
    expect(wild.state.battle?.wild).toBe(true);
    const mat = move(at(2, 6), 'right');
    expect(mat.state).toMatchObject({ x: 4, y: 6 });
    expect(mat.state.flags.mat).toBe(true);
  });

  it('is understood by the planner: one press over it, and no way back', () => {
    const start = at(3, 1, 'lane');
    expect(routeTo(world, start, 'lane:b')).toEqual(['right', 'right']);
    expect(routeTo(world, start, 'lane:a')).toEqual(['left', 'left']);
    const over = move(start, 'right').state;
    expect(over).toMatchObject({ x: 5, y: 1 });
    expect(routeTo(world, over, 'lane:b')).toEqual(['right']);
    expect(routeTo(world, over, 'lane:a')).toBeNull();
  });
});
