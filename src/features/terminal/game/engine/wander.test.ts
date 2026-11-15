import { NOTICE_TICKS, WALK_TICKS, initialGame, step } from './engine.ts';
import { routeTo } from './bot.ts';
import { testWorld } from './testWorld.ts';
import { NO_INPUT, type GameState, type Input, type TileDef, type World } from './types.ts';
import { STROLL_TICKS, placeOf, strollProgress, strollStep } from './wander.ts';
import { objectAt, parseMap } from './world.ts';

const legend: Record<string, TileDef> = {
  '#': { sprite: 'iwall', solid: true },
  '.': { sprite: 'floor', solid: false },
  '=': { sprite: 'floor', solid: false, road: true },
  '"': { sprite: 'tallgrass', solid: false, grass: true },
};

const stroller = (radius: number, every: number) => ({
  sprite: 'cat',
  solid: true,
  trigger: 'interact' as const,
  branches: [{ do: [{ say: ['Nice weather.'] }] }],
  wander: { radius, every },
});

const park = parseMap(
  {
    id: 'park',
    name: 'Park',
    ground: '.',
    rows: [
      '#########',
      '#...=..s#',
      '#.w.=.*.#',
      '#...=..."',
      '#===@==.#',
      '#...=..v#',
      '#########',
    ],
    objects: {
      '@': { solid: false, trigger: 'interact', branches: [], under: '=' },
      w: stroller(1, 20),
      v: stroller(2, 30),
      s: { sprite: 'sign', solid: true, trigger: 'interact', branches: [{ do: [{ say: ['A sign.'] }] }] },
      '*': {
        sprite: 'star',
        solid: false,
        trigger: 'step',
        hideWhen: { flag: 'star:1' },
        branches: [{ pass: true, do: [{ flag: 'star:1' }, { give: 'star', quiet: true }] }],
      },
    },
  },
  legend,
);

const world: World = {
  ...testWorld,
  maps: { park },
  start: { map: 'park', at: '@', dir: 'down' },
  items: { ...testWorld.items, star: { name: 'STAR', description: 'Shiny.' } },
  collect: { item: 'star', total: 1 },
};

const press = (state: GameState, input: Partial<Input>, instant = true) => step(state, { ...NO_INPUT, ...input }, world, { instant });
/** On the map, past the title and the intro. */
function started(seed = 7): GameState {
  let state = initialGame(world, seed);
  state = press(state, { a: true }).state;
  return press(state, { a: true }).state;
}
const walk = (state: GameState, ...dirs: NonNullable<Input['dir']>[]) =>
  dirs.reduce((current, dir) => press(current, { dir, pressed: dir }).state, state);
const strollers = park.objects.filter((object) => object.wander);
/** Lets the clock run, and hands every state to `see`. */
function run(state: GameState, ticks: number, see: (state: GameState) => void = () => {}): GameState {
  let current = state;
  for (let i = 0; i < ticks; i++) {
    current = step(current, NO_INPUT, world).state;
    see(current);
  }
  return current;
}

describe('the townsfolk', () => {
  it('stroll the same way every time, whatever the seed of the battles', () => {
    const a = run(started(1), 3000);
    const b = run(started(1), 3000);
    const c = run(started(99), 3000);
    expect(a.roam).toEqual(b.roam);
    expect(a.roam).toEqual(c.roam);
    expect(strollStep(3, 12)).toBe(strollStep(3, 12));
  });

  it('really move, but never leave their range, a road alone, the grass alone, and each other alone', () => {
    const seen = new Map(strollers.map((object) => [object.id, new Set<string>()]));
    run(started(), 6000, (state) => {
      const places = strollers.map((object) => placeOf(object, state));
      strollers.forEach((object, i) => {
        const at = places[i]!;
        seen.get(object.id)!.add(`${at.x},${at.y}`);
        expect(Math.abs(at.x - object.x)).toBeLessThanOrEqual(object.wander!.radius);
        expect(Math.abs(at.y - object.y)).toBeLessThanOrEqual(object.wander!.radius);
        const tile = legend[park.cells[at.y]![at.x]!]!;
        expect(tile.solid || tile.road || tile.grass).toBeFalsy();
        expect(`${at.x},${at.y}`).not.toBe(`${state.x},${state.y}`);
        // Not on the sign or on the star either.
        expect(park.objects.filter((other) => !other.wander && other.x === at.x && other.y === at.y)).toEqual([]);
      });
      expect(new Set(places.map((at) => `${at.x},${at.y}`)).size).toBe(places.length);
    });
    for (const cells of seen.values()) expect(cells.size).toBeGreaterThan(3);
  });

  it('never step onto the player, who stands in the middle of their range', () => {
    const inTheWay = { ...started(), x: 2, y: 3 };
    run(inTheWay, 4000, (state) => {
      const at = placeOf(park.objects.find((object) => object.id === 'park:w')!, state);
      expect(`${at.x},${at.y}`).not.toBe('2,3');
    });
  });

  it('are found where they are: they block, they talk, and their old cell is free', () => {
    const home = park.objects.find((object) => object.id === 'park:w')!;
    const moved = run(started(), 400);
    const at = placeOf(home, moved);
    expect(at).not.toMatchObject({ x: home.x, y: home.y });
    expect(objectAt(park, at.x, at.y, moved)).toBe(home);
    expect(objectAt(park, home.x, home.y, moved)).toBeUndefined();

    // The pilot's way of walking: plan, take one step, plan again, until they answer.
    let state = moved;
    let answer: GameState | null = null;
    for (let i = 0; i < 200 && !answer; i++) {
      state = walk(state, routeTo(world, state, 'park:w')![0]!);
      const talked = press(state, { a: true }).state;
      if (talked.dialogue) answer = talked;
    }
    expect(answer?.dialogue?.pages).toEqual([['Nice weather.']]);
  });

  it('slide from cell to cell, and are there at once with reduced motion', () => {
    const sliding = run(started(), 400);
    const roaming = Object.values(sliding.roam)[0]!;
    expect(strollProgress(roaming, roaming.at)).toBe(0);
    expect(strollProgress(roaming, roaming.at + STROLL_TICKS / 2)).toBe(0.5);
    expect(strollProgress(roaming, roaming.at + 99)).toBe(1);

    let state = started();
    for (let i = 0; i < 60; i++) state = press(state, { dir: 'down', pressed: 'down' }).state;
    expect(state.clock).toBe(60 * WALK_TICKS + started().clock);
    expect(Object.values(state.roam).length).toBeGreaterThan(0);
    for (const settled of Object.values(state.roam)) expect(strollProgress(settled, state.clock)).toBe(1);
  });

  it('stand still while the player reads or fights: the clock does not run then', () => {
    const talking = press(walk(started(), 'right', 'right', 'right', 'up', 'up', 'up'), { a: true }).state;
    expect(talking.dialogue?.pages).toEqual([['A sign.']]);
    expect(run(talking, 500).roam).toEqual(talking.roam);
  });
});

describe('a find in passing', () => {
  const beside = () => walk(started(), 'right', 'up', 'up');

  it('is picked up without a text box: a sound, a line for the status region, a note in the corner', () => {
    const before = beside();
    expect(before).toMatchObject({ x: 5, y: 2 });
    const found = press(before, { dir: 'right', pressed: 'right' });
    expect(found.state).toMatchObject({ x: 6, y: 2, dialogue: null, items: { star: 1 }, flags: { 'star:1': true } });
    expect(found.events).toEqual([{ kind: 'item', text: 'Found a STAR! 1 of 1.' }]);
    expect(found.cues).toEqual(['star']);
    expect(found.state.notice).toEqual({ text: '1/1', until: before.clock + NOTICE_TICKS });
    expect(objectAt(park, 6, 2, found.state)).toBeUndefined();
  });

  it('happens once: walking over the spot again finds nothing', () => {
    const found = walk(beside(), 'right');
    const again = press(walk(found, 'left'), { dir: 'right', pressed: 'right' });
    expect(again.state.items.star).toBe(1);
    expect(again.events).toEqual([]);
  });

  it('is picked up at the end of a walked step too', () => {
    let state = step(beside(), { ...NO_INPUT, dir: 'right' }, world).state;
    for (let i = 0; i < WALK_TICKS; i++) state = step(state, NO_INPUT, world).state;
    expect(state.items.star).toBe(1);
  });
});
