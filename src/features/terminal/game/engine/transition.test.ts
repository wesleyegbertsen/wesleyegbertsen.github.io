import { ENTER_TICKS } from './battle.ts';
import { initialGame, step } from './engine.ts';
import { play, testWorld as world } from './testWorld.ts';
import { BOSS_TICKS, QUICK_TICKS, WILD_TICKS, curtainOf, type Curtain } from './transition.ts';
import { NO_INPUT, type GameState, type Input, type World } from './types.ts';

/** The way into a battle: a short show on the map before the battle screen, counted in ticks in the state. */

const started = () => play(initialGame(world, 7), 'a', 'a');
/** One tick with motion. */
const tick = (state: GameState, input: Partial<Input> = {}) => step(state, { ...NO_INPUT, ...input }, world);
function ticks(state: GameState, count: number, input: Partial<Input> = {}): GameState {
  let current = state;
  for (let i = 0; i < count; i++) current = tick(current, input).state;
  return current;
}
/** Walks into the tall grass of the test world with motion: a wild RAT, every time. The result of the tick that starts it. */
function intoTheGrass() {
  let state = play(started(), 'down');
  let result = tick(state, { dir: 'right' });
  for (let i = 0; i < 20 && !result.state.battle; i++) {
    state = result.state;
    result = tick(state);
  }
  expect(result.state.battle?.enemy).toBe('rat');
  return result;
}
/** Talks to the ogre with motion: a battle that is not wild, at once (it has nothing to say first). */
function toTheBoss() {
  const beside = play(started(), 'down', 'down', 'left');
  const result = tick(beside, { a: true });
  expect(result.state.battle?.enemy).toBe('ogre');
  return result;
}
/** Every picture of a transition, from its first tick to its last. `quick`: the short one of a boss that follows another. */
const pictures = (wild: boolean, quick = false): Curtain[] => {
  const length = wild ? WILD_TICKS : quick ? QUICK_TICKS : BOSS_TICKS;
  return Array.from({ length }, (_, i) => curtainOf({ wild, intro: length - i, ...(quick ? { quick: true as const } : {}) })!);
};
/** How often the screen goes bright in the worst second: the washes of the transition, and the battle screen after it. */
function brightestSecond(wild: boolean, quick = false): number {
  const bright = [...pictures(wild, quick).map((picture) => picture.flash), true];
  const onsets = bright.map((on, i) => on && !bright[i - 1]);
  let worst = 0;
  for (let from = 0; from < onsets.length; from++) worst = Math.max(worst, onsets.slice(from, from + 60).filter(Boolean).length);
  return worst;
}
/** The test world with a guard that sends out a second RAT when the first is beaten: that battle is marked `quick`. */
const twice: World = {
  ...world,
  maps: {
    ...world.maps,
    main: {
      ...world.maps.main!,
      objects: world.maps.main!.objects.map((object) =>
        object.id === 'main:o' ? { ...object, branches: [{ do: [{ battle: 'rat', win: [{ battle: 'rat', quick: true as const, win: [{ flag: 'both' }] }] }] }] } : object,
      ),
    },
  },
};

describe('the way into a battle', () => {
  it('starts when a wild enemy jumps out: the line is announced and the sound asked for at once', () => {
    const { state, events, cues } = intoTheGrass();
    expect(state.battle).toMatchObject({ wild: true, intro: WILD_TICKS, phase: 'steps', shown: 0 });
    expect(events).toEqual([{ kind: 'battle', text: 'A wild RAT appeared!' }]);
    expect(cues).toEqual(['encounter']);
  });

  it('is longer for a boss, with a sound of its own', () => {
    const { state, events, cues } = toTheBoss();
    expect(state.battle).toMatchObject({ wild: false, intro: BOSS_TICKS });
    expect(BOSS_TICKS).toBeGreaterThanOrEqual(WILD_TICKS * 2);
    expect(events).toEqual([{ kind: 'battle', text: 'OGRE wants to battle!' }]);
    expect(cues).toEqual(['confirm', 'showdown']);
  });

  it('counts down one tick at a time; the text waits for it and a press does not skip it', () => {
    const { state } = intoTheGrass();
    const half = ticks(state, WILD_TICKS / 2, { a: true });
    expect(half.battle).toMatchObject({ intro: WILD_TICKS / 2, shown: 0, phase: 'steps' });
    const last = ticks(half, WILD_TICKS / 2 - 1);
    expect(last.battle).toMatchObject({ intro: 1, shown: 0 });
    // It makes no sound of its own on the way (the one at the start is the whole of it); its last tick brings the
    // battle screen up, the enemy coming in (engine/battle.test.ts), and once it is in place, its cry.
    expect(tick(last).cues).toEqual([]);
    expect(tick(half).cues).toEqual([]);
    expect(tick(last).state.battle).toMatchObject({ intro: 0, enter: ENTER_TICKS, shown: 0 });
    const over = ticks(tick(last).state, ENTER_TICKS);
    expect(over.battle).toMatchObject({ intro: 0, shown: 0 });
    // Now the line types itself, and A goes on as before.
    expect(ticks(over, 5).battle!.shown).toBe(5);
    const menu = play(over, 'a', 'a');
    expect(menu.battle).toMatchObject({ phase: 'menu' });
  });

  it('takes exactly its length, for a boss too', () => {
    const { state } = toTheBoss();
    expect(ticks(state, BOSS_TICKS - 1).battle!.intro).toBe(1);
    expect(ticks(state, BOSS_TICKS).battle!.intro).toBe(0);
  });

  it('is short for a boss that follows another in the same talk: a third of the time, with a sound of its own', () => {
    const on = (state: GameState, input: Partial<Input> = {}) => step(state, { ...NO_INPUT, ...input }, twice);
    let result = on(play(started(), 'down', 'down', 'left'), { a: true });
    // The first one: the whole show.
    expect(result.state.battle).toMatchObject({ enemy: 'rat', wild: false, intro: BOSS_TICKS });
    expect(result.state.battle!.quick).toBeUndefined();
    expect(result.cues).toEqual(['confirm', 'showdown']);
    // Win it, with motion: A on every tick. The tick that ends it starts the next battle.
    for (let i = 0; i < 2000 && result.state.battle && !result.state.battle.quick; i++) result = on(result.state, { a: true });
    expect(result.state.battle).toMatchObject({ enemy: 'rat', wild: false, quick: true, intro: QUICK_TICKS, enemyHp: 10 });
    expect(result.events.at(-1)).toEqual({ kind: 'battle', text: 'RAT wants to battle!' });
    expect(result.cues).toContain('round');
    expect(result.cues).not.toContain('showdown');
    // About 0.6 seconds, and a third of the long one at most.
    expect(QUICK_TICKS).toBeGreaterThanOrEqual(30);
    expect(QUICK_TICKS).toBeLessThanOrEqual(42);
    expect(QUICK_TICKS * 3).toBeLessThanOrEqual(BOSS_TICKS);
    // It counts down like the others, and a press does not skip it.
    let state = result.state;
    for (let i = 0; i < QUICK_TICKS - 1; i++) state = on(state, { a: true }).state;
    expect(state.battle).toMatchObject({ intro: 1, shown: 0 });
    expect(on(state).state.battle).toMatchObject({ intro: 0, quick: true });
    // With reduced motion it is left out, like the others.
    let still: GameState = { ...play(started(), 'down', 'down', 'left'), pp: { hit: 9, nap: 1 } };
    for (let i = 0; i < 200 && !still.flags.both; i++) {
      still = step(still, { ...NO_INPUT, a: true }, twice, { instant: true }).state;
      expect(still.battle?.intro ?? 0).toBe(0);
    }
    expect(still.flags.both).toBe(true);
  });

  it('is the same every time: the same state and input give the same result', () => {
    const { state } = intoTheGrass();
    expect(tick(state)).toEqual(tick(state));
    expect(ticks(state, 30)).toEqual(ticks(state, 30));
  });

  it('is left out with reduced motion: no extra press, the battle is there at once', () => {
    const wild = play(started(), 'down', 'right');
    expect(wild.battle).toMatchObject({ enemy: 'rat', intro: 0 });
    expect(wild.battle!.shown).toBe('A wild RAT appeared!'.length);
    expect(play(wild, 'a').battle).toMatchObject({ phase: 'menu' });
    const boss = play(started(), 'down', 'down', 'left', 'a');
    expect(boss.battle).toMatchObject({ enemy: 'ogre', intro: 0 });
    expect(curtainOf(wild.battle!)).toBeNull();
  });

  it('ends at once when reduced motion is switched on half way', () => {
    const half = ticks(intoTheGrass().state, 10);
    const now = step(half, NO_INPUT, world, { instant: true }).state;
    expect(now.battle).toMatchObject({ intro: 0 });
  });
});

describe('what the transition looks like', () => {
  it('closes blinds over the map for a wild enemy and an iris for a boss, until the screen is dark', () => {
    for (const wild of [true, false]) {
      const all = pictures(wild);
      expect(new Set(all.map((picture) => picture.shape))).toEqual(new Set([wild ? 'blinds' : 'iris']));
      expect(all[0]!.cover).toBe(0);
      expect(all.at(-1)!.cover).toBe(1);
      // The dark only ever grows.
      for (let i = 1; i < all.length; i++) expect(all[i]!.cover, String(i)).toBeGreaterThanOrEqual(all[i - 1]!.cover);
      // It stays whole for the last few ticks, so the battle screen does not cut in half way.
      expect(all.filter((picture) => picture.cover === 1).length).toBeGreaterThanOrEqual(6);
      // The wash and the dark never show together.
      expect(all.some((picture) => picture.flash && picture.cover > 0)).toBe(false);
    }
  });

  it('is a cut-down of the boss one when it is short: one wash, then the iris, until the screen is dark', () => {
    const all = pictures(false, true);
    expect(all).toHaveLength(QUICK_TICKS);
    expect(new Set(all.map((picture) => picture.shape))).toEqual(new Set(['iris']));
    expect(all.filter((picture, i) => picture.flash && !all[i - 1]?.flash)).toHaveLength(1);
    expect(all.filter((picture) => picture.flash).length).toBeGreaterThanOrEqual(6);
    expect(all[0]!.cover).toBe(0);
    expect(all.at(-1)!.cover).toBe(1);
    for (let i = 1; i < all.length; i++) expect(all[i]!.cover, String(i)).toBeGreaterThanOrEqual(all[i - 1]!.cover);
    expect(all.filter((picture) => picture.cover === 1).length).toBeGreaterThanOrEqual(6);
    expect(all.some((picture) => picture.flash && picture.cover > 0)).toBe(false);
    // A wild enemy is never short.
    expect(curtainOf({ wild: true, quick: true, intro: WILD_TICKS })).toEqual(curtainOf({ wild: true, intro: WILD_TICKS }));
  });

  it('washes the screen out once for a wild enemy and twice for a boss', () => {
    const washes = (wild: boolean) => pictures(wild).filter((picture, i, all) => picture.flash && !all[i - 1]?.flash).length;
    expect(washes(true)).toBe(1);
    expect(washes(false)).toBe(2);
    // A wash lasts a tenth of a second at least: it is a blink, not a flicker.
    for (const wild of [true, false]) {
      const all = pictures(wild).map((picture) => picture.flash);
      let run = 0;
      for (const [i, on] of all.entries()) {
        run = on ? run + 1 : 0;
        if (run > 0 && !all[i + 1]) expect(run).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('never goes bright three times in one second, counting the battle screen that follows', () => {
    expect(brightestSecond(true)).toBeLessThan(3);
    expect(brightestSecond(false)).toBeLessThan(3);
    expect(brightestSecond(false, true)).toBeLessThan(3);
  });

  it('is nothing once the transition is over', () => {
    expect(curtainOf({ wild: true, intro: 0 })).toBeNull();
    expect(curtainOf({ wild: false, intro: 0 })).toBeNull();
  });
});
