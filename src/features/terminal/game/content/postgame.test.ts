import { education } from '../../../../data/education.ts';
import { experience } from '../../../../data/experience.ts';
import { profile } from '../../../../data/profile.ts';
import { projects } from '../../../../data/projects.ts';
import { skills } from '../../../../data/skills.ts';
import type { FsData } from '../../fs.ts';
import { playthrough, routeTo } from '../engine/bot.ts';
import { ENDING_HOLD, step } from '../engine/engine.ts';
import { NO_INPUT, type Dir, type GameState, type Input } from '../engine/types.ts';
import { resolveSpot } from '../engine/world.ts';
import { AREAS, COLLECT, FINAL_BOSSES, STAMP } from './battles.ts';
import { DEX } from './dex.ts';
import { FINALE, HOBBIES } from './story.ts';
import { buildWorld } from './world.ts';

// After the end: KEEP EXPLORING, and everything that was optional is as playable as before. The game's own world, the
// state the bot ends in (reduced motion, one press a move), and then each thing in turn from a place set in the state.

const data: FsData = { profile, skills, experience, education, projects };
const world = buildWorld(data);
const press = (state: GameState, input: Partial<Input>) => step(state, { ...NO_INPUT, ...input }, world, { instant: true }).state;
const go = (state: GameState, dir: Dir) => press(state, { dir, pressed: dir });
/** A until no text box, battle, offer of a move or shop is open any more (B closes a shop). */
const through = (state: GameState) => {
  let current = state;
  for (let i = 0; i < 400 && (current.dialogue || current.battle || current.learn || current.shop); i++) current = press(current, current.shop ? { b: true } : { a: true });
  return current;
};
/** Walks to face an object of the current map, fighting off whatever jumps out on the way. */
const reach = (state: GameState, id: string) => {
  let current = state;
  for (let tries = 0; tries < 20; tries++) {
    const route = routeTo(world, current, id);
    if (!route) throw new Error(`no way to ${id}`);
    for (const dir of route) {
      current = go(current, dir);
      if (current.battle || current.dialogue) break;
    }
    if (!current.battle && !current.dialogue) return current;
    current = through(current);
  }
  throw new Error(`could not reach ${id}`);
};

const end = playthrough(world, 1).state;
/** The ending screen held, and KEEP EXPLORING picked. */
const explored = () => {
  let state = end;
  for (let i = 0; i < ENDING_HOLD; i++) state = press(state, {});
  return press(state, { a: true });
};
/** The explored state, somewhere else. */
const at = (state: GameState, spot: Parameters<typeof resolveSpot>[1], extra: Partial<GameState> = {}): GameState => ({ ...state, ...resolveSpot(world, spot), dir: spot.dir ?? 'down', ...extra });

describe('after the end', () => {
  it('starts from the ending, with the three of the last fight in the DEX', () => {
    expect(end).toMatchObject({ scene: 'ending', finished: true });
    for (const boss of FINAL_BOSSES) expect(end.seen, boss).toContain(boss);
    const state = explored();
    expect(state).toMatchObject({ scene: 'world', finished: true, map: 'contact' });
  });

  it('Wesley says a line and the contact details again, then the ending screen comes back; no battle again', () => {
    let state = explored();
    state = press(state, { a: true });
    expect(state.dialogue?.pages.flat().join(' ')).toContain(FINALE.again[0]!);
    let fought = false;
    for (let i = 0; i < 40 && state.scene !== 'ending'; i++) {
      fought ||= !!state.battle;
      state = press(state, { a: true });
    }
    expect(fought).toBe(false);
    expect(state).toMatchObject({ scene: 'ending', ending: { ticks: 0 } });
  });

  it('picks up a gold star', () => {
    // The first gold star in town, not picked up yet (the bot leaves the stars alone; if it did not, it is put back).
    const id = 'town:1';
    const flag = 'star:town-1';
    const star = world.maps.town!.objects.find((object) => object.id === id);
    expect(star).toBeDefined();
    const { [flag]: had, ...flags } = end.flags;
    const count = (end.items[COLLECT] ?? 0) - (had ? 1 : 0);
    const before = at(explored(), world.start, { flags, items: { ...end.items, [COLLECT]: count } });
    const after = through(reach(before, id));
    // The last press of the walk steps onto it.
    const onIt = after.flags[flag] ? after : through(go(after, after.dir));
    expect(onIt.flags[flag]).toBe(true);
    expect(onIt.items[COLLECT]).toBe(count + 1);
  });

  it('stamps a hobby in the hills', () => {
    const stop = HOBBIES[0]!;
    const flag = `hobby:${stop.id}`;
    const flags = Object.fromEntries(Object.entries(end.flags).filter(([name]) => name !== flag));
    const before = at(explored(), { map: 'hills', at: stop.at, dy: 2 }, { flags, items: { ...end.items, [STAMP]: end.items[STAMP]! - 1 } });
    const facing = reach(before, `hills:${stop.at}`);
    const talked = press(facing, { a: true });
    expect(talked.dialogue).not.toBeNull();
    const after = through(talked);
    expect(after.flags[flag]).toBe(true);
    expect(after.items[STAMP]).toBe(end.items[STAMP]);
  });

  it('meets a wild monster in the tall grass, beats it and gains XP', () => {
    let state = at(explored(), { map: 'town', at: '3', dx: 0, dy: 0 }, { seed: 12345 });
    expect(AREAS.town!.enemies.length).toBeGreaterThan(0);
    for (let i = 0; i < 400 && !state.battle; i++) state = go(state, i % 2 === 0 ? 'left' : 'right');
    expect(AREAS.town!.enemies).toContain(state.battle?.enemy);
    const xp = state.xp;
    const coins = state.coins;
    state = through(state);
    expect(state.battle).toBeNull();
    expect(state.coins).toBeGreaterThan(coins);
    if (state.level < world.levels.max) expect(state.xp).toBeGreaterThan(xp);
  });

  it('rests at the cafe and buys in its shop', () => {
    // In front of the barista, as after a defeat (`respawn` in content/world.ts).
    const hurt = at(explored(), { map: 'cafe', at: 'B', dy: 1, dir: 'up' }, { hp: 1 });
    const rested = through(press(hurt, { a: true }));
    expect(rested.hp).toBe(rested.maxHp);
    const facing = reach(rested, 'cafe:V');
    let state = press(facing, { a: true });
    for (let i = 0; i < 20 && state.dialogue; i++) state = press(state, { a: true });
    expect(state.shop?.id).toBe('cafe');
    const coins = state.coins;
    state = press(state, { a: true });
    expect(state.coins).toBeLessThan(coins);
  });

  it('opens the DEX pages of the last three', () => {
    let state = press(explored(), { start: true });
    state = go(go(state, 'right'), 'right');
    expect(state.menu?.tab).toBe('dex');
    for (const boss of FINAL_BOSSES) {
      const row = DEX.findIndex((entry) => entry.enemy === boss);
      const page = press({ ...state, menu: { tab: 'dex', cursor: row } }, { a: true });
      expect(page.menu?.detail, boss).toEqual({ at: row, focus: 0 });
    }
  });
});
