import { education } from '../../../../data/education.ts';
import { experience } from '../../../../data/experience.ts';
import { profile } from '../../../../data/profile.ts';
import { projects } from '../../../../data/projects.ts';
import { skills } from '../../../../data/skills.ts';
import type { FsData } from '../../fs.ts';
import { routeTo } from '../engine/bot.ts';
import { initialGame, step } from '../engine/engine.ts';
import { loose } from '../engine/push.ts';
import { calm, canReach, explore, keyOf, pressIn, pressesTo, solve, type Explored } from '../engine/solve.ts';
import { NO_INPUT, type GameMap, type GameState } from '../engine/types.ts';
import { areaAt, resolveSpot, tileAt } from '../engine/world.ts';
import { DEEP_CAVE_LEVEL } from './battles.ts';
import { REGIONS } from './maps.ts';
import { DEEP_FLAGS, DEEP_TEXT, PUZZLES } from './story.ts';
import { buildWorld } from './world.ts';

/**
 * The proof for the puzzles of the deep cave. Nothing here knows how a puzzle is meant to be solved: a search
 * plays the real engine, press by press (engine/solve.ts), from where a puzzle begins. For each puzzle it must
 * find a solution, and from every state it can get into on the way, the solution must still be within reach
 * (so must the reset, where there is one). Then the same for the floor as a whole: wherever a player stands
 * and whatever they pushed, the boss and the way out can still be reached.
 */

const data: FsData = { profile, skills, experience, education, projects };
const world = buildWorld(data);
const deep = world.maps.deep as GameMap;

/** In the game, the intro read. */
const started = (): GameState => {
  let state = pressIn(world, initialGame(world, 1), 'a');
  for (let i = 0; i < 40 && state.dialogue; i++) state = pressIn(world, state, 'a');
  return state;
};
const flagged = (flags: string[]) => Object.fromEntries(flags.map((flag) => [flag, true as const]));
/** Standing where a puzzle begins, with the puzzles before it solved. */
const standing = (puzzle: (typeof PUZZLES)[number], level = 10): GameState => ({ ...started(), ...resolveSpot(world, puzzle.from), level, flags: flagged(puzzle.needs) });
const solvedBy = (puzzle: (typeof PUZZLES)[number]) => {
  const { goal } = puzzle;
  if ('flag' in goal) return (state: GameState) => !!state.flags[goal.flag] && calm(state);
  const end = resolveSpot(world, goal.at);
  return (state: GameState) => state.map === end.map && state.x === end.x && state.y === end.y && calm(state);
};
const play = (state: GameState, keys: ReturnType<typeof pressesTo>) => keys.reduce((current, key) => pressIn(world, current, key), state);
const keysWhere = (explored: Explored, test: (state: GameState) => boolean) => [...explored.nodes].filter(([, node]) => test(node.state)).map(([key]) => key);
/** No boulder of the deep cave is anywhere but where the map put it. */
const untouched = (state: GameState) => state.map === 'deep' && deep.objects.every((object) => !object.push || !state.roam[object.id]);
/** Back down the ladder from the first floor: what the deep cave looks like to someone who left and returned. */
function backDown(state: GameState): GameState {
  let current = state;
  for (let i = 0; i < 60 && current.map === 'cave'; i++) {
    const route = routeTo(world, current, 'cave:L');
    expect(route).not.toBeNull();
    current = pressIn(world, current, route![0]!);
  }
  return current;
}

describe('the puzzles of the deep cave', () => {
  it('are three, in a row: each one is behind the one before it', () => {
    expect(PUZZLES.map((puzzle) => puzzle.name)).toEqual(['the boulders', 'the slick rock', 'the pipeline']);
    for (const puzzle of PUZZLES) expect(resolveSpot(world, puzzle.from).map).toBe('deep');
    // Where one begins cannot be walked to while the one before it is unsolved (the slick rock ends where the pipeline begins).
    const fresh = explore(world, standing(PUZZLES[0]!), { stop: solvedBy(PUZZLES[0]!) });
    expect(fresh.complete).toBe(true);
    const second = resolveSpot(world, PUZZLES[1]!.from);
    expect([...fresh.nodes.values()].some((node) => node.state.x === second.x && node.state.y === second.y)).toBe(false);
  });

  describe.each(PUZZLES)('$name', (puzzle) => {
    const done = solvedBy(puzzle);

    it('can be solved: a search that plays the game finds the presses, and playing them solves it', () => {
      const start = standing(puzzle);
      expect(done(start)).toBe(false);
      const keys = solve(world, start, done);
      expect(keys, 'no solution found').not.toBeNull();
      const end = play(start, keys!);
      expect(done(end)).toBe(true);
      expect(end.map).toBe('deep');
      // Small puzzles: a handful of moves, not a slog.
      expect(keys!.length).toBeGreaterThanOrEqual(5);
      expect(keys!.length).toBeLessThanOrEqual(60);
    });

    it('never traps: from every state the search can reach, the solution is still within reach', () => {
      const explored = explore(world, standing(puzzle), { stop: done });
      expect(explored.complete).toBe(true);
      const goals = keysWhere(explored, done);
      expect(goals.length).toBeGreaterThan(0);
      const fine = canReach(explored, goals);
      // Leaving by the ladder is the one way off the map; whoever comes back down is in a state the search knows.
      for (const [key, node] of explored.nodes) {
        if (node.state.map === 'deep') continue;
        expect(node.state.map).toBe('cave');
        const back = keyOf(world, backDown(node.state));
        expect(explored.nodes.has(back), key).toBe(true);
        if (fine.has(back)) fine.add(key);
      }
      const stuck = [...explored.nodes.keys()].filter((key) => !fine.has(key));
      expect(stuck).toEqual([]);
      // Nothing in a puzzle starts a battle or ends the game.
      expect(keysWhere(explored, (state) => !!state.battle || state.scene !== 'world')).toEqual([]);
    });

    it('can always be put back: from every such state, one with every boulder in its place is within reach', () => {
      const explored = explore(world, standing(puzzle), { stop: done });
      const fine = canReach(explored, keysWhere(explored, (state) => untouched(state) && !done(state)));
      const inside = [...explored.nodes].filter(([, node]) => node.state.map === 'deep' && !done(node.state)).map(([key]) => key);
      expect(inside.length).toBeGreaterThan(10);
      expect(inside.filter((key) => !fine.has(key))).toEqual([]);
    });

    it('can be walked back out of: from every such state the ladder up is within reach', () => {
      const explored = explore(world, standing(puzzle), { stop: done });
      const out = keysWhere(explored, (state) => state.map === 'cave');
      expect(out.length).toBeGreaterThan(0);
      const fine = canReach(explored, out);
      expect([...explored.nodes].filter(([key, node]) => !done(node.state) && !fine.has(key)).map(([key]) => key)).toEqual([]);
    });
  });

  it('the boulders: the search moves real boulders, and a lever pull or a trip up the ladder puts them back', () => {
    const start = standing(PUZZLES[0]!);
    const explored = explore(world, start, { stop: solvedBy(PUZZLES[0]!) });
    // Many states: the two boulders really are pushed about.
    expect(explored.nodes.size).toBeGreaterThan(1000);
    const messy = [...explored.nodes.values()].find((node) => node.state.map === 'deep' && Object.keys(node.state.roam).length === 2)!.state;
    expect(untouched(messy)).toBe(false);
    // Up the ladder and down again.
    const up = solve(world, messy, (state) => state.map === 'cave');
    expect(up).not.toBeNull();
    const back = backDown(play(messy, up!));
    expect(back.map).toBe('deep');
    expect(untouched(back)).toBe(true);
    // The lever.
    const lever = deep.objects.find((object) => object.id === 'deep:r')!;
    const pull = solve(world, messy, (state) => untouched(state));
    expect(pull).not.toBeNull();
    const pulled = play(messy, pull!);
    expect([pulled.x, pulled.y, pulled.dir]).toEqual([lever.x, lever.y + 1, 'up']);
    // The cell the lever is pulled from, and the doorway, are kept free of boulders by the ground itself.
    expect(tileAt(deep, lever.x, lever.y + 1).road).toBe(true);
    for (const node of explored.nodes.values()) {
      if (node.state.map !== 'deep') continue;
      for (const at of Object.values(node.state.roam)) expect(tileAt(deep, at.x, at.y).road ?? false).toBe(false);
    }
  });

  it('the boulders: once both plates are down they stay down, and the gate stays open', () => {
    const start = standing(PUZZLES[0]!);
    const solved = play(start, solve(world, start, solvedBy(PUZZLES[0]!))!);
    expect(solved.flags[DEEP_FLAGS.plates]).toBe(true);
    for (const object of deep.objects.filter((candidate) => candidate.push)) {
      expect(loose(object, deep, solved)).toBe(false);
      const at = solved.roam[object.id] ?? object;
      expect(tileAt(deep, at.x, at.y).plate, object.id).toBe(true);
    }
    // Everything a player can do from here on: the boulders never move again, and the gate never comes back.
    const after = explore(world, solved, { stop: (state) => !!state.flags[DEEP_FLAGS.shipped] });
    expect(after.complete).toBe(true);
    const places = (state: GameState) => JSON.stringify(deep.objects.filter((object) => object.push).map((object) => state.roam[object.id] ?? object).map((at) => [at.x, at.y]));
    for (const node of after.nodes.values()) {
      if (node.state.map !== 'deep') continue;
      expect(places(node.state)).toBe(places(solved));
      expect(node.state.flags[DEEP_FLAGS.plates]).toBe(true);
    }
    // Also for whoever leaves and comes back.
    const left = [...after.nodes.values()].find((node) => node.state.map === 'cave')!.state;
    expect(places(backDown(left))).toBe(places(solved));
  });

  it('the slick rock: it can be crossed both ways, so the way back is never lost', () => {
    const puzzle = PUZZLES[1]!;
    const there = play(standing(puzzle), solve(world, standing(puzzle), solvedBy(puzzle))!);
    const from = resolveSpot(world, puzzle.from);
    const back = solve(world, there, (state) => state.x === from.x && state.y === from.y);
    expect(back).not.toBeNull();
    // It takes a plan: more than four slides either way, and no straight line.
    expect(solve(world, standing(puzzle), solvedBy(puzzle))!.length).toBeGreaterThanOrEqual(5);
    expect(back!.length).toBeGreaterThanOrEqual(5);
    // Nothing stands on the slick rock: what stops a slide is rock, fire or the wall, so a planner and the game agree.
    for (const object of deep.objects) expect(tileAt(deep, object.x, object.y).slide ?? false, object.id).toBe(false);
  });

  it('the slick rock: every slide tells the status region which way it went, how far, and what stopped it', () => {
    const puzzle = PUZZLES[1]!;
    const told = (state: GameState, key: 'up' | 'down' | 'left' | 'right') => step(state, { ...NO_INPUT, dir: key, pressed: key }, world, { instant: true });
    // The first step off the corridor: down the column, five cells, to the rock at the bottom.
    const first = told(standing(puzzle), 'down');
    expect(first.events.filter((event) => event.kind === 'say').map((event) => event.text)).toEqual(['You slide down 5 steps and stop against a rock.']);
    expect(first.cues).toEqual(['slide', 'bump']);
    // Pressing on into that rock goes nowhere, and says so.
    expect(told(first.state, 'down').events.map((event) => event.text)).toEqual(['You cannot slide down: a rock is in the way.']);
    // Every press of the solution is one line of the same kind: the rocks, the fire bowls and the wall have names.
    let state = standing(puzzle);
    const lines: string[] = [];
    for (const key of solve(world, state, solvedBy(puzzle))!) {
      expect(key).not.toBe('a');
      const result = told(state, key as 'up');
      expect(result.events.filter((event) => event.kind === 'say'), key).toHaveLength(1);
      lines.push(result.events.find((event) => event.kind === 'say')!.text);
      state = result.state;
    }
    for (const line of lines) expect(line).toMatch(/^You slide (up|down|left|right) \d+ steps? and stop (against (a rock|a fire bowl|the wall)|on firm ground)\.$/);
    // The last one is off the slick rock at the far left: a slide that ends on firm ground (one step, when it began beside it).
    expect(lines.at(-1)).toMatch(/^You slide left \d+ steps? and stop on firm ground\.$/);
    // What can stop a slide in this room is one of those three: nothing nameless.
    expect(new Set(lines.map((line) => line.replace(/^.* and stop /, '')))).not.toContain('against something.');
  });

  it('the slick rock: the note beside the way in explains the slide, and says in words where everything on the floor is', () => {
    const note = deep.objects.find((object) => object.id === 'deep:i')!;
    // It is read from the cell where the puzzle begins, before the first step onto the slick rock.
    const from = resolveSpot(world, PUZZLES[1]!.from);
    expect(Math.abs(note.x - from.x) + Math.abs(note.y - from.y)).toBe(1);
    expect(tileAt(deep, from.x, from.y).slide ?? false).toBe(false);
    const textOf = (id: string) => deep.objects.find((object) => object.id === id)!.branches[0]!.do.flatMap((action) => ('say' in action ? action.say : [])).join(' ');
    expect(textOf('deep:i')).toBe(DEEP_TEXT.slick.join(' '));
    expect(textOf('deep:i')).toMatch(/cannot steer/);
    expect(textOf('deep:i')).toMatch(/a rock, a fire bowl or the wall/);
    // Short enough to read in passing: the long description is on a note of its own, on the other side of the way in.
    expect(DEEP_TEXT.slick.length).toBeLessThanOrEqual(3);
    const words = deep.objects.find((object) => object.id === 'deep:v')!;
    expect(Math.abs(words.x - from.x) + Math.abs(words.y - from.y)).toBe(1);
    expect(words.sprite).toBe('notice');
    const text = textOf('deep:v');
    expect(text).toBe(DEEP_TEXT.slickWords.join(' '));
    // The floor in words, checked against the map: its size, and every rock and fire bowl on it, by row and place.
    const slick = deep.cells.flatMap((row, y) => row.flatMap((char, x) => (deep.tiles[char]!.slide ? [{ x, y }] : [])));
    const left = Math.min(...slick.map((cell) => cell.x));
    const top = Math.min(...slick.map((cell) => cell.y));
    const wide = Math.max(...slick.map((cell) => cell.x)) - left + 1;
    const high = Math.max(...slick.map((cell) => cell.y)) - top + 1;
    expect(text).toContain(`${wide} wide and ${high} deep`);
    const named = [...text.matchAll(/Row (\d+): ([^.]*)\./g)].flatMap(([, row, things]) =>
      [...things!.matchAll(/(a rock|a fire bowl) at (\d+)/g)].map(([, name, place]) => ({ name, x: left + Number(place) - 1, y: top + Number(row) - 1 })),
    );
    const standingThere = Array.from({ length: high }, (_, dy) => Array.from({ length: wide }, (_, dx) => ({ x: left + dx, y: top + dy }))).flat().filter((cell) => tileAt(deep, cell.x, cell.y).solid);
    expect(standingThere.length).toBeGreaterThanOrEqual(4);
    expect(named.map((thing) => `${thing.x},${thing.y} ${thing.name}`).sort()).toEqual(standingThere.map((cell) => `${cell.x},${cell.y} ${tileAt(deep, cell.x, cell.y).name}`).sort());
    // And the ways on and off: above the place where the player comes in, and at the left of the row that leads on.
    const goal = resolveSpot(world, 'at' in PUZZLES[1]!.goal ? PUZZLES[1]!.goal.at : PUZZLES[1]!.from);
    expect(text).toContain(`above place ${from.x - left + 1} of row 1`);
    expect(text).toContain(`left of row ${goal.y - top + 1}`);
  });

  it('the pipeline: only add, commit, push in that order opens the gate, and a wrong step starts it over', () => {
    const puzzle = PUZZLES[2]!;
    const start = standing(puzzle);
    const use = (state: GameState, char: string) => {
      const keys = solve(world, state, (next) => calm(next) && next !== state && routeTo(world, next, `deep:${char}`)?.length === 1);
      let current = keys ? play(state, keys) : state;
      current = pressIn(world, current, routeTo(world, current, `deep:${char}`)![0]!);
      current = pressIn(world, current, 'a');
      for (let i = 0; i < 20 && current.dialogue; i++) current = pressIn(world, current, 'a');
      return current;
    };
    const lit = (state: GameState) => [DEEP_FLAGS.add, DEEP_FLAGS.commit, DEEP_FLAGS.shipped].filter((flag) => state.flags[flag]);
    const order = (chars: string) => [...chars].reduce((state, char) => use(state, char), start);
    expect(lit(order('ACP'))).toEqual([DEEP_FLAGS.add, DEEP_FLAGS.commit, DEEP_FLAGS.shipped]);
    for (const wrong of ['P', 'C', 'AP', 'AA', 'ACA', 'ACC', 'CAP', 'PAC', 'ACAP']) expect(lit(order(wrong)), wrong).not.toContain(DEEP_FLAGS.shipped);
    // A wrong step puts the lights out, and the right order after it still works.
    expect(lit(order('AP'))).toEqual([]);
    expect(lit(order('ACA'))).toEqual([]);
    expect(lit(order('APACP'))).toContain(DEEP_FLAGS.shipped);
    // Solved for good: the terminals only say so.
    const done = order('ACP');
    expect(lit(use(use(use(done, 'A'), 'P'), 'C'))).toEqual(lit(done));
    // The only flags the riddle takes back are its own.
    expect(order('AP').flags).toEqual(start.flags);
  });
});

describe('the deep cave as a whole', () => {
  const arrival = (level: number): GameState => ({ ...started(), ...resolveSpot(world, PUZZLES[0]!.from), level });

  it('never traps: wherever a player gets and whatever they pushed, the boss and the way out are still within reach', () => {
    const explored = explore(world, arrival(10));
    expect(explored.complete).toBe(true);
    const fights = keysWhere(explored, (state) => state.battle?.enemy === 'outage');
    const out = keysWhere(explored, (state) => state.map === 'cave');
    expect(fights.length).toBeGreaterThan(0);
    expect(out.length).toBeGreaterThan(0);
    const toBoss = canReach(explored, fights);
    const toLadder = canReach(explored, out);
    const inside = [...explored.nodes].filter(([, node]) => node.state.map === 'deep' && calm(node.state)).map(([key]) => key);
    expect(inside.length).toBeGreaterThan(2000);
    expect(inside.filter((key) => !toBoss.has(key))).toEqual([]);
    expect(inside.filter((key) => !toLadder.has(key))).toEqual([]);
    // The only battle down here is the boss, and the only other map is the floor above.
    expect(new Set([...explored.nodes.values()].map((node) => node.state.battle?.enemy).filter(Boolean))).toEqual(new Set(['outage']));
    expect(new Set([...explored.nodes.values()].map((node) => node.state.map))).toEqual(new Set(['deep', 'cave']));
  });

  it('keeps the boss behind every puzzle: it is not met with one of them unsolved', () => {
    for (const unsolved of [[], [DEEP_FLAGS.plates]]) {
      const explored = explore(world, { ...arrival(10), flags: flagged(unsolved) }, { stop: (state) => !!state.flags[DEEP_FLAGS.shipped] });
      expect(explored.complete).toBe(true);
      expect(keysWhere(explored, (state) => !!state.battle)).toEqual([]);
      expect(keysWhere(explored, (state) => areaAt(deep, state.x, state.y) === 'Incident Room' && state.map === 'deep')).toEqual([]);
    }
  });

  it(`keeps the boss behind the door for level ${DEEP_CAVE_LEVEL}: below it the whole floor can be played and the boss is never met`, () => {
    const explored = explore(world, arrival(DEEP_CAVE_LEVEL - 1));
    expect(explored.complete).toBe(true);
    expect(keysWhere(explored, (state) => !!state.flags[DEEP_FLAGS.shipped]).length).toBeGreaterThan(0);
    expect(keysWhere(explored, (state) => !!state.battle)).toEqual([]);
    // And the way back up is still there from everywhere.
    const toLadder = canReach(explored, keysWhere(explored, (state) => state.map === 'cave'));
    expect([...explored.nodes.keys()].filter((key) => !toLadder.has(key))).toEqual([]);
  });

  it('gives every puzzle room a name and a fire bowl to see it by, and has no rubble: nothing interrupts a puzzle', () => {
    expect(deep.dark).toBe(1);
    expect(deep.encounters).toBeUndefined();
    expect(deep.cells.flat().some((char) => deep.tiles[char]!.grass)).toBe(false);
    const rooms = REGIONS.deep!.filter((region) => region.name !== 'Incident Room');
    expect(rooms).toHaveLength(PUZZLES.length);
    for (const room of rooms) {
      const lights = (deep.lights ?? []).filter((light) => light.x >= room.x && light.x < room.x + room.w && light.y >= room.y && light.y < room.y + room.h);
      expect(lights.length, room.name).toBeGreaterThan(0);
    }
    // The plates and the slick rock are inside their rooms.
    deep.cells.forEach((row, y) =>
      row.forEach((char, x) => {
        if (deep.tiles[char]!.plate) expect(areaAt(deep, x, y)).toBe('Boulder Hall');
        if (deep.tiles[char]!.slide) expect(areaAt(deep, x, y)).toBe('Slick Rock');
      }),
    );
  });
});
