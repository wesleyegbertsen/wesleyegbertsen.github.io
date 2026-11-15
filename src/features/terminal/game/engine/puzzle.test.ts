import { playthrough, routeTo } from './bot.ts';
import { WALK_TICKS, initialGame, step } from './engine.ts';
import { covered, putBack } from './push.ts';
import { calm, canReach, explore, keyOf, pressIn, solve } from './solve.ts';
import { playIn, testWorld } from './testWorld.ts';
import { NO_INPUT, type Dir, type GameObject, type GameState, type TileDef, type World } from './types.ts';
import { strollProgress } from './wander.ts';
import { parseMap, stopOf, type ObjectSpec } from './world.ts';

/**
 * The rules of the puzzles: things that are pushed, pressure plates, a reset, slippery ground, flags that are
 * taken back. And the search that proves a puzzle can be solved (solve.ts), tried on small maps of its own.
 */

const legend: Record<string, TileDef> = {
  '#': { sprite: 'cavewall', solid: true },
  '.': { sprite: 'cavefloor', solid: false },
  '=': { sprite: 'cavefloor', solid: false, road: true },
  '"': { sprite: 'rubble', solid: false, grass: true },
  o: { sprite: 'plate', solid: false, plate: true },
  '~': { sprite: 'ice', solid: false, slide: true },
  '>': { sprite: 'ledge-right', solid: true, ledge: 'right' },
  t: { sprite: 'brazier', solid: true, light: 2 },
};

const boulder: ObjectSpec = { sprite: 'boulder', solid: true, trigger: 'interact', branches: [], push: 'boulder' };
const lever: ObjectSpec = { sprite: 'lever', solid: true, trigger: 'interact', branches: [{ do: [{ reset: true }, { say: ['Clunk.'] }] }] };
const marker: ObjectSpec = { solid: false, trigger: 'interact', branches: [] };

const yard = parseMap(
  {
    id: 'yard',
    name: 'Yard',
    ground: '.',
    rows: [
      '#########',
      '#@.1.o.L#', // boulder 1, a plate, the reset lever
      '#..2=..D#', // boulder 2 with a road cell behind it; a door to the room and back
      '#.."..o.#', // rubble under boulder 2, the other plate
      '#O.3..~t#', // boulder 3: slippery ground two cells on, the wall below it; O always wins a battle
      '#########',
    ],
    plates: { flag: 'yard:solved', do: [{ say: ['A gate opens.'] }] },
    objects: {
      '@': marker,
      '1': boulder,
      '2': boulder,
      '3': boulder,
      L: lever,
      D: { sprite: 'door', solid: true, trigger: 'step', branches: [{ do: [{ warp: { map: 'room', at: 'm', dy: -1, dir: 'up' } }] }] },
      O: { sprite: 'boss', solid: true, trigger: 'interact', branches: [{ do: [{ battle: 'ogre', win: [] }] }] },
    },
  },
  legend,
);

const room = parseMap(
  {
    id: 'room',
    name: 'Room',
    ground: '.',
    rows: ['###', '#.#', '#m#'],
    objects: { m: { sprite: 'mat', solid: false, trigger: 'step', branches: [{ do: [{ warp: { map: 'yard', at: 'D', dx: -1, dir: 'left' } }] }] } },
  },
  legend,
);

const world: World = { ...testWorld, maps: { yard, room }, start: { map: 'yard', at: '@', dir: 'down' } };
const play = (state: GameState, ...keys: Parameters<typeof playIn>[2][]) => playIn(world, state, ...keys);
const started = (): GameState => play(initialGame(world, 1), 'a', 'a');
const at = (x: number, y: number, extra: Partial<GameState> = {}): GameState => ({ ...started(), x, y, ...extra });
const where = (state: GameState, id: string) => state.roam[id] ?? yard.objects.find((object) => object.id === id)!;
const told = (state: GameState, dir: Dir, instant = true) => step(state, { ...NO_INPUT, dir, pressed: dir }, world, { instant });
/** A boulder somewhere else than the map put it, as if pushed there. */
const moved = (id: string, x: number, y: number) => ({ [id]: { x, y, fromX: x, fromY: y, at: 0 } });

describe('pushing', () => {
  it('moves the thing one cell on and the player into its place, and says so', () => {
    const result = told(at(2, 1), 'right');
    expect(where(result.state, 'yard:1')).toMatchObject({ x: 4, y: 1 });
    expect(result.state).toMatchObject({ x: 3, y: 1, dir: 'right' });
    expect(result.cues).toEqual(['push']);
    expect(result.events.map((event) => event.text)).toEqual(['You push the boulder right.']);
    // Nothing else moved.
    expect(Object.keys(result.state.roam)).toEqual(['yard:1']);
  });

  it('is the same press whoever counts: the same state and input give the same result', () => {
    expect(told(at(2, 1), 'right')).toEqual(told(at(2, 1), 'right'));
  });

  it.each([
    ['a wall', 'yard:3', at(3, 3), 'down'],
    ['a road cell, so a doorway is never plugged', 'yard:2', at(2, 2), 'right'],
    ['rubble', 'yard:2', at(3, 1, { roam: moved('yard:1', 5, 1) }), 'down'],
    ['another boulder', 'yard:2', at(3, 3), 'up'],
    ['slippery ground', 'yard:3', at(4, 4, { roam: moved('yard:3', 5, 4) }), 'right'],
    ['a thing that stands there', 'yard:1', at(5, 1, { roam: moved('yard:1', 6, 1) }), 'right'],
  ] as const)('does not move it onto %s: a bump, and a line that says so', (_, id, state, dir) => {
    const before = where(state, id);
    const result = told(state, dir);
    expect(where(result.state, id)).toMatchObject({ x: before.x, y: before.y });
    expect(result.state).toMatchObject({ x: state.x, y: state.y, dir });
    expect(result.cues).toEqual(['bump']);
    expect(result.events.map((event) => event.text)).toEqual([`The boulder does not move ${dir}: something is in the way.`]);
  });

  it('says that only when the direction is pressed, not while it is held', () => {
    const held = step(at(3, 3), { ...NO_INPUT, dir: 'down' }, world);
    expect(held.cues).toEqual(['bump']);
    expect(held.events).toEqual([]);
  });

  it('goes at walking pace with motion: the boulder a cell ahead of the player, and on while the key is held', () => {
    let state = at(2, 1);
    const first = step(state, { ...NO_INPUT, dir: 'right', pressed: 'right' }, world);
    expect(first.state.walk).toEqual({ fromX: 2, fromY: 1, t: 0 });
    expect(first.state.roam['yard:1']).toMatchObject({ x: 4, y: 1, fromX: 3, fromY: 1, ticks: WALK_TICKS });
    expect(strollProgress(first.state.roam['yard:1']!, first.state.clock)).toBeLessThan(0.2);
    state = first.state;
    for (let i = 0; i < WALK_TICKS - 1; i++) state = step(state, { ...NO_INPUT, dir: 'right' }, world).state;
    expect(state.walk).not.toBeNull();
    expect(state.roam['yard:1']).toMatchObject({ x: 4 });
    expect(strollProgress(state.roam['yard:1']!, state.clock)).toBe(1);
    // The step is over: the next one starts at once, and the boulder is pushed onto the plate.
    state = step(state, { ...NO_INPUT, dir: 'right' }, world).state;
    expect(state).toMatchObject({ x: 4, y: 1 });
    expect(state.roam['yard:1']).toMatchObject({ x: 5, y: 1 });
  });

  it('with reduced motion the boulder is in its new place at once', () => {
    const { state } = told(at(2, 1), 'right');
    expect(state.walk).toBeNull();
    expect(strollProgress(state.roam['yard:1']!, state.clock)).toBe(1);
  });
});

describe('pressure plates', () => {
  it('count what stands on them, and the status region hears every plate go down and come free', () => {
    const on = told(at(3, 1, { roam: moved('yard:1', 4, 1) }), 'right');
    expect(on.events.map((event) => event.text)).toEqual(['You push the boulder right. It settles on a pressure plate: 1 of 2 down.']);
    expect(on.cues).toEqual(['push', 'switch']);
    expect(covered(yard, on.state)).toBe(1);
    expect(on.state.flags['yard:solved']).toBeUndefined();
    const off = told(on.state, 'right');
    expect(off.events.map((event) => event.text)).toEqual(['You push the boulder right. It rolls off the pressure plate.']);
    expect(covered(yard, off.state)).toBe(0);
  });

  /** One push short of the end: boulder 1 on its plate, boulder 2 beside the other one. */
  const nearly = () => at(4, 3, { roam: { ...moved('yard:1', 5, 1), ...moved('yard:2', 5, 3) } });

  it('solve the puzzle for good when the last one goes down: a flag, a sound, and what the map says then', () => {
    const result = told(nearly(), 'right');
    expect(result.state.flags['yard:solved']).toBe(true);
    expect(result.cues).toEqual(['push', 'switch', 'gate']);
    expect(result.events.map((event) => event.text)).toEqual(['You push the boulder right. It settles on a pressure plate: 2 of 2 down.', 'A gate opens.']);
    expect(result.state.dialogue?.pages.flat().join(' ')).toBe('A gate opens.');
  });

  it('are solved once the step after the boulder is over, when there is motion', () => {
    let state = step(nearly(), { ...NO_INPUT, dir: 'right', pressed: 'right' }, world).state;
    expect(state.flags['yard:solved']).toBeUndefined();
    for (let i = 0; i < WALK_TICKS && !state.dialogue; i++) state = step(state, NO_INPUT, world).state;
    expect(state.flags['yard:solved']).toBe(true);
    expect(state.walk).toBeNull();
  });

  it('hold what stands on them from then on: no push, no reset, no way of arriving moves it', () => {
    const solved = play(told(nearly(), 'right').state, 'a');
    expect(calm(solved)).toBe(true);
    const pushed = told({ ...solved, x: 6, y: 2, dir: 'down' }, 'down');
    expect(pushed.cues).toEqual(['bump']);
    expect(pushed.state.roam).toEqual(solved.roam);
    expect(pushed.events).toEqual([]);
    expect(play({ ...solved, x: 6, y: 1, dir: 'right' }, 'a', 'a').roam).toEqual(solved.roam);
    expect(play({ ...solved, x: 6, y: 2 }, 'right', 'down').roam).toEqual(solved.roam);
    expect(putBack(solved, world, 'yard')).toBe(solved.roam);
  });

  it('refuse a map with plates and too few things to push, or a puzzle without a plate', () => {
    const spec = { id: 'bad', name: 'Bad', ground: '.', plates: { flag: 'x', do: [] } };
    expect(() => parseMap({ ...spec, rows: ['oo1'], objects: { '1': boulder } }, legend)).toThrow('more plates than things');
    expect(() => parseMap({ ...spec, rows: ['..1'], objects: { '1': boulder } }, legend)).toThrow('without a plate');
  });
});

describe('putting the boulders back', () => {
  const pushed = () => play(at(2, 1), 'right', 'right');

  it('is what the lever does', () => {
    const state = pushed();
    expect(where(state, 'yard:1')).toMatchObject({ x: 5, y: 1 });
    const result = step({ ...state, x: 6, y: 1, dir: 'right' }, { ...NO_INPUT, a: true }, world, { instant: true });
    expect(result.state.roam).toEqual({});
    expect(result.cues).toContain('switch');
    expect(result.state.dialogue?.pages.flat().join(' ')).toBe('Clunk.');
  });

  it('happens on the way back in through a door', () => {
    const away = play({ ...pushed(), x: 6, y: 2 }, 'right');
    expect(away.map).toBe('room');
    // Still where it was pushed to while the player is away: only arriving puts it back.
    expect(away.roam['yard:1']).toMatchObject({ x: 5, y: 1 });
    const back = play(away, 'down');
    expect(back).toMatchObject({ map: 'yard', x: 6, y: 2 });
    expect(back.roam).toEqual({});
  });

  it('happens after a defeat, which brings the player back to where they rested', () => {
    let state: GameState = { ...pushed(), x: 1, y: 3, dir: 'down', hp: 1 };
    state = play(state, 'a');
    expect(state.battle?.enemy).toBe('ogre');
    for (let i = 0; i < 60 && (state.battle || state.dialogue); i++) state = play(state, 'a');
    expect(state).toMatchObject({ map: 'yard', x: 1, y: 1, battle: null });
    expect(state.roam).toEqual({});
  });

  it('never puts a boulder on the player: one whose own cell the player stands on stays where it is', () => {
    // After one push the player stands exactly where boulder 1 started.
    const state = play(at(2, 1), 'right');
    expect(state).toMatchObject({ x: 3, y: 1 });
    const both = { ...state, roam: { ...state.roam, ...moved('yard:3', 4, 4) } };
    const roam = putBack(both, world, 'yard');
    expect(roam['yard:1']).toMatchObject({ x: 4, y: 1 });
    expect(roam['yard:3']).toBeUndefined();
    // From anywhere else it goes back too.
    expect(putBack({ ...both, x: 1, y: 1 }, world, 'yard')).toEqual({});
  });

  it('leaves the townsfolk who stroll where they are', () => {
    const state = { ...pushed(), roam: { ...pushed().roam, 'yard:O': { x: 2, y: 4, fromX: 1, fromY: 4, at: 0 } } };
    expect(Object.keys(putBack(state, world, 'yard'))).toEqual(['yard:O']);
  });
});

// --- slippery ground -------------------------------------------------------------------------------------------

const rink = parseMap(
  {
    id: 'rink',
    name: 'Rink',
    ground: '.',
    rows: [
      '#########',
      '#@.~~~~.#', // across, onto firm ground
      '#..~~s~.#', // a sign stands on the ice
      '#..~~#..#', // a wall ends it
      '#..~m~..#', // a mat on the ice: slid over, and it still does what it does
      '#..~~>..#', // a ledge is not slid over
      '#..~~~~E#', // E ends the game
      '#########',
    ],
    objects: {
      '@': marker,
      s: { sprite: 'sign', solid: true, trigger: 'interact', branches: [{ do: [{ say: ['A sign.'] }] }] },
      m: { sprite: 'mat', solid: false, trigger: 'step', under: '~', branches: [{ pass: true, do: [{ flag: 'mat' }] }] },
      E: { sprite: 'wesley', solid: true, trigger: 'interact', branches: [{ do: [{ ending: true }] }] },
    },
  },
  legend,
);
const iceWorld: World = { ...testWorld, maps: { rink }, start: { map: 'rink', at: '@', dir: 'down' } };
const onIce = (x: number, y: number): GameState => ({ ...playIn(iceWorld, initialGame(iceWorld, 1), 'a', 'a'), x, y });
const slide = (state: GameState, dir: Dir) => step(state, { ...NO_INPUT, dir, pressed: dir }, iceWorld, { instant: true });

describe('slippery ground', () => {
  it('carries the player on in the same direction until the ground is firm again: one press with reduced motion', () => {
    const result = slide(onIce(2, 1), 'right');
    expect(result.state).toMatchObject({ x: 7, y: 1, dir: 'right', walk: null });
    expect(result.cues).toEqual(['slide']);
    expect(result.events.map((event) => event.text)).toEqual(['You slide right, onto firm ground.']);
  });

  it.each([
    ['a thing', 2, 4],
    ['a wall', 3, 4],
    ['a ledge', 5, 4],
  ])('is stopped by %s, with a bump and a line', (_, y, x) => {
    const result = slide(onIce(2, y), 'right');
    expect(result.state).toMatchObject({ x, y, dir: 'right' });
    expect(result.cues).toEqual(['slide', 'bump']);
    expect(result.events.map((event) => event.text)).toEqual(['You slide right until something stops you.']);
  });

  it('lets the player step off sideways after a stop, and slide again', () => {
    const stopped = slide(onIce(2, 3), 'right').state;
    expect(stopped).toMatchObject({ x: 4, y: 3 });
    expect(slide(stopped, 'up').state).toMatchObject({ x: 4, y: 1 });
    expect(slide(stopped, 'down').state).toMatchObject({ x: 4, y: 6 });
    // Into the wall: nothing moves.
    expect(slide(stopped, 'right').state).toMatchObject({ x: 4, y: 3 });
  });

  it('still lets what lies on the ice happen on the way over it', () => {
    const result = slide(onIce(2, 4), 'right');
    expect(result.state.flags.mat).toBe(true);
    expect(result.state).toMatchObject({ x: 6, y: 4 });
  });

  it('with motion goes cell by cell at walking pace, the legs still, and cannot be steered', () => {
    let state = step(onIce(2, 1), { ...NO_INPUT, dir: 'right', pressed: 'right' }, iceWorld).state;
    expect(state.walk).toEqual({ fromX: 2, fromY: 1, t: 0 });
    const seen: number[] = [];
    let ticks = 0;
    // The player lets go at once, and then pushes up and down: the slide does not care.
    for (; ticks < 200 && (state.walk || state.x < 7); ticks++) {
      state = step(state, { ...NO_INPUT, dir: ticks % 2 ? 'up' : 'down', pressed: ticks % 2 ? 'up' : 'down' }, iceWorld).state;
      if (state.walk?.slide && !seen.includes(state.x)) seen.push(state.x);
      if (state.y !== 1) break;
    }
    expect(state.y).toBe(1);
    expect(seen).toEqual([4, 5, 6, 7]);
    expect(ticks).toBe(5 * WALK_TICKS);
  });

  it('ends where a planner says it ends: stopOf agrees with the engine for every cell and direction', () => {
    // What a planner keeps off: the things that stand somewhere, and the ones that do something when stepped on.
    const things = (x: number, y: number) => rink.objects.some((object) => object.x === x && object.y === y && (object.solid || object.trigger === 'step'));
    let checked = 0;
    for (let y = 1; y < rink.height - 1; y++) {
      for (let x = 1; x < rink.width - 1; x++) {
        if (rink.tiles[rink.cells[y]![x]!]!.solid || rink.objects.some((object) => object.x === x && object.y === y)) continue;
        for (const dir of ['up', 'down', 'left', 'right'] as const) {
          const state = onIce(x, y);
          const planned = stopOf(rink, x, y, dir, things);
          const { state: after } = slide(state, dir);
          // The mat lets the engine through and stops the planner, which never plans over things.
          if (after.flags.mat) continue;
          expect({ x: after.x, y: after.y }, `${x},${y} ${dir}`).toEqual(planned ? { x: planned.x, y: planned.y } : { x, y });
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('is something the bot and the browser pilot can plan a walk over', () => {
    const route = routeTo(iceWorld, onIce(1, 1), 'rink:E');
    expect(route).not.toBeNull();
    let state = onIce(1, 1);
    for (const dir of route!) state = slide(state, dir).state;
    // In front of E, whichever side: A ends the game.
    expect(slide(state, route!.at(-1)!).state).toMatchObject({ x: state.x, y: state.y });
    expect(playIn(iceWorld, state, 'a').finished).toBe(true);
    // Fewer presses than cells: the slides are one press each.
    expect(route!.length).toBeLessThan(10);
    expect(playthrough(iceWorld).state.finished).toBe(true);
  });
});

// --- a riddle, and the search ----------------------------------------------------------------------------------

/** A switch of a riddle: right when `after` is set (or nothing is asked) and it is not on yet; anything else puts all of them out. */
const riddle = (flag: string, after: string | undefined, all: string[]): ObjectSpec => ({
  sprite: 'lever',
  solid: true,
  trigger: 'interact',
  branches: [
    { when: { ...(after ? { flag: after } : {}), notFlag: flag }, do: [{ flag }, { say: ['Click.'] }] },
    { do: [{ unflag: all }, { say: ['Wrong. All out.'] }] },
  ],
});
const gate = (flag: string): ObjectSpec => ({ sprite: 'gate', solid: true, trigger: 'step', hideWhen: { flag }, branches: [{ do: [{ say: ['Shut.'] }] }] });

/** A boulder to push onto a plate, a gate, two switches to pull in the right order (the wrong one first), a gate, the end. */
const vault = (withLever: boolean) =>
  parseMap(
    {
      id: 'vault',
      name: 'Vault',
      ground: '.',
      rows: [
        '###########',
        withLever ? '#L.1.o#B.A#' : '##.1.o#B.A#',
        '#@....g..h#',
        '#.....#.E.#',
        '###########',
      ],
      plates: { flag: 'plates', do: [{ say: ['The first gate opens.'] }] },
      objects: {
        '@': marker,
        '1': boulder,
        ...(withLever ? { L: lever } : {}),
        g: gate('plates'),
        B: riddle('two', 'one', ['one', 'two']),
        A: riddle('one', undefined, ['one', 'two']),
        h: gate('two'),
        E: { sprite: 'wesley', solid: true, trigger: 'interact', hideWhen: { notFlag: 'two' }, branches: [{ do: [{ ending: true }] }] },
      },
    },
    legend,
  );
const vaultWorld = (withLever = true): World => ({ ...testWorld, maps: { vault: vault(withLever) }, start: { map: 'vault', at: '@', dir: 'down' } });
const inVault = (w: World) => playIn(w, initialGame(w, 1), 'a', 'a');

describe('taking flags back', () => {
  it('lets a riddle start over after a wrong answer', () => {
    const w = vaultWorld();
    const front = (x: number): GameState => ({ ...inVault(w), flags: { plates: true }, x, y: 2, dir: 'up' });
    const one = playIn(w, front(9), 'a', 'a');
    expect(one.flags).toEqual({ plates: true, one: true });
    const two = playIn(w, { ...one, x: 7 }, 'a', 'a');
    expect(two.flags).toEqual({ plates: true, one: true, two: true });
    // The second switch first, or the first one twice: all out, and only the riddle's own flags.
    expect(playIn(w, front(7), 'a', 'a').flags).toEqual({ plates: true });
    expect(playIn(w, { ...one, dir: 'up' }, 'a', 'a').flags).toEqual({ plates: true });
  });
});

describe('the search', () => {
  it('finds the presses that solve a puzzle, and they do when they are played', () => {
    const w = vaultWorld();
    const keys = solve(w, inVault(w), (state) => !!state.flags.plates);
    expect(keys).not.toBeNull();
    let state = inVault(w);
    for (const key of keys!) state = pressIn(w, state, key);
    expect(state.flags.plates).toBe(true);
    expect(calm(state)).toBe(true);
    // The shortest way: up beside the boulder is not possible (rock), so round it is. No more presses than that.
    expect(keys!.length).toBeLessThanOrEqual(8);
    expect(solve(w, inVault(w), (next) => !!next.flags.never)).toBeNull();
  });

  it('tells two states apart by place, pushed things, flags and bag, and by nothing else', () => {
    const w = vaultWorld();
    const state = inVault(w);
    expect(keyOf(w, { ...state, dir: 'left', hp: 1, clock: 99, seed: 7 })).toBe(keyOf(w, state));
    for (const other of [{ x: 2 }, { flags: { one: true as const } }, { items: { key: 1 } }, { roam: moved('vault:1', 4, 1) }]) {
      expect(keyOf(w, { ...state, ...other })).not.toBe(keyOf(w, state));
    }
  });

  it('shows a dead end where there is one: without the lever a boulder pushed into the corner stays there', () => {
    const solvedIn = (w: World) => {
      const explored = explore(w, inVault(w), { stop: (state) => !!state.flags.plates });
      expect(explored.complete).toBe(true);
      const goals = [...explored.nodes].filter(([, node]) => node.state.flags.plates).map(([key]) => key);
      expect(goals.length).toBeGreaterThan(0);
      const fine = canReach(explored, goals);
      return { all: explored.nodes.size, stuck: [...explored.nodes.keys()].filter((key) => !fine.has(key)) };
    };
    const without = solvedIn(vaultWorld(false));
    expect(without.stuck.length).toBeGreaterThan(0);
    // The start is not one of them, and the boulder is never on the row it started on, between the walls.
    expect(without.stuck).not.toContain(keyOf(vaultWorld(false), inVault(vaultWorld(false))));
    for (const key of without.stuck) expect(key).not.toMatch(/\|[34],1\|/);
    const withLever = solvedIn(vaultWorld(true));
    expect(withLever.stuck).toEqual([]);
    expect(withLever.all).toBeGreaterThan(without.all / 2);
  });

  it('stays on its map and does not look past a battle or the ending', () => {
    const explored = explore(world, started());
    expect(explored.complete).toBe(true);
    const off = [...explored.nodes.values()].filter((node) => node.state.map !== 'yard');
    expect(off.length).toBeGreaterThan(0);
    for (const node of off) expect(explored.edges.has(keyOf(world, node.state))).toBe(false);
    const fights = [...explored.nodes].filter(([, node]) => node.state.battle);
    expect(fights.length).toBeGreaterThan(0);
    for (const [key] of fights) expect(explored.edges.has(key)).toBe(false);
    // The limit is honoured, and said.
    const short = explore(world, started(), { limit: 50 });
    expect(short.complete).toBe(false);
    expect(short.nodes.size).toBeLessThanOrEqual(50);
  });
});

describe('the bot', () => {
  it('gets through a boulder puzzle and a riddle that starts over, by searching the game for something new', () => {
    const run = playthrough(vaultWorld(), 1, 3000);
    expect(run.stuck).toBe(false);
    expect(run.state.finished).toBe(true);
    expect(run.state.flags).toMatchObject({ plates: true, one: true, two: true });
  });

  it('still says so when a puzzle cannot be solved', () => {
    const w = vaultWorld();
    const hard: World = { ...w, maps: { vault: { ...w.maps.vault!, objects: w.maps.vault!.objects.filter((object: GameObject) => object.id !== 'vault:A') } } };
    const run = playthrough(hard, 1, 3000);
    expect(run.state.finished).toBe(false);
    expect(run.stuck).toBe(true);
  });
});
