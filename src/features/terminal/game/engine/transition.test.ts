import { initialGame, step } from './engine.ts';
import { play, testWorld as world } from './testWorld.ts';
import { BOSS_TICKS, WILD_TICKS, curtainOf, type Curtain } from './transition.ts';
import { NO_INPUT, type GameState, type Input } from './types.ts';

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
/** Every picture of a transition, from its first tick to its last. */
const pictures = (wild: boolean): Curtain[] =>
  Array.from({ length: wild ? WILD_TICKS : BOSS_TICKS }, (_, i) => curtainOf({ wild, intro: (wild ? WILD_TICKS : BOSS_TICKS) - i })!);
/** How often the screen goes bright in the worst second: the washes of the transition, and the battle screen after it. */
function brightestSecond(wild: boolean): number {
  const bright = [...pictures(wild).map((picture) => picture.flash), true];
  const onsets = bright.map((on, i) => on && !bright[i - 1]);
  let worst = 0;
  for (let from = 0; from < onsets.length; from++) worst = Math.max(worst, onsets.slice(from, from + 60).filter(Boolean).length);
  return worst;
}

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
    // It makes no sound of its own on the way: the one at the start is the whole of it.
    expect(tick(last).cues).toEqual([]);
    const over = tick(last).state;
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
  });

  it('is nothing once the transition is over', () => {
    expect(curtainOf({ wild: true, intro: 0 })).toBeNull();
    expect(curtainOf({ wild: false, intro: 0 })).toBeNull();
  });
});
