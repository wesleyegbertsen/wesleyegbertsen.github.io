import { initialGame, step } from './engine.ts';
import { play, testWorld as world } from './testWorld.ts';
import { NO_INPUT, type Cue, type GameState, type Input } from './types.ts';

/** The engine names what is worth a sound; these are the names, per thing that happens. */

const started = (seed = 7) => play(initialGame(world, seed), 'a', 'a');
const cues = (state: GameState, input: Partial<Input> = {}, instant = true) => step(state, { ...NO_INPUT, ...input }, world, { instant }).cues;
const dir = (name: NonNullable<Input['dir']>) => ({ dir: name, pressed: name });

/** Presses A until the battle is over, and collects every cue on the way. */
function fight(state: GameState): { state: GameState; heard: Cue[] } {
  const heard: Cue[] = [];
  let current = state;
  for (let i = 0; i < 200 && (current.battle || current.dialogue); i++) {
    const result = step(current, { ...NO_INPUT, a: true }, world, { instant: true });
    heard.push(...result.cues);
    current = result.state;
  }
  return { state: current, heard };
}

describe('cues', () => {
  it('confirms the start, and ticks while the text types itself', () => {
    const fresh = initialGame(world, 7);
    expect(cues(fresh)).toEqual([]);
    expect(cues(fresh, { a: true })).toEqual(['confirm']);

    let state = step(fresh, { ...NO_INPUT, a: true }, world).state;
    const heard: Cue[] = [];
    for (let i = 0; i < 'Welcome.'.length + 3; i++) {
      const result = step(state, NO_INPUT, world);
      heard.push(...result.cues);
      state = result.state;
    }
    // Eight characters, a tick on every third.
    expect(heard).toEqual(['blip', 'blip', 'blip']);
    expect(cues(state, { a: true })).toEqual(['confirm']);
  });

  it('is silent while nothing happens and for a plain step', () => {
    expect(cues(started())).toEqual([]);
    expect(cues(started(), dir('down'))).toEqual([]);
  });

  it('bumps into a wall and into a thing that stands in the way', () => {
    const atWall = play(started(), 'left');
    expect(cues(atWall, dir('left'))).toEqual(['bump']);
    const atSign = play(started(), 'right');
    expect(cues(atSign, dir('up'))).toEqual(['bump']);
  });

  it('confirms talking, the bag and the hint; ticks the cursor; cancels the bag', () => {
    expect(cues(play(started(), 'right', 'up'), { a: true })).toEqual(['confirm']);
    expect(cues(started(), { a: true })).toEqual([]);
    expect(cues(started(), { start: true })).toEqual(['confirm']);
    expect(cues(started(), { select: true })).toEqual(['confirm']);
    const bag = play({ ...started(), items: { coffee: 1, key: 1 } }, 'start');
    expect(cues(bag, dir('down'))).toEqual(['cursor']);
    expect(cues(bag, dir('up'))).toEqual([]);
    expect(cues(bag, dir('right'))).toEqual(['cursor']);
    expect(cues(bag, { b: true })).toEqual(['cancel']);
    expect(cues({ ...bag, hp: 1 }, { a: true })).toEqual(['confirm', 'heal']);
  });

  it('opens a door, gets an item, rests', () => {
    expect(cues(play(started(), 'right', 'right'), dir('right'))).toEqual(['door']);
    expect(cues(play(started(), 'up', 'left'), { a: true })).toEqual(['confirm', 'item']);
    expect(cues(play(started(), 'right', 'right', 'up', 'right'), { a: true })).toEqual(['confirm', 'heal']);
  });

  it('whooshes into a battle, and every line of it has its sound', () => {
    const before = play(started(), 'down');
    expect(cues(before, dir('right'))).toEqual(['encounter', 'cry:rat']);
    const menu = play(before, 'right', 'a');
    expect(cues(menu, dir('down'))).toEqual(['cursor']);
    expect(cues(menu, { a: true })).toEqual(['confirm']);
    expect(cues(play(menu, 'a'), { b: true })).toEqual(['cancel']);
    // The first move always hits; the rat always hits back.
    expect(cues(play(menu, 'a'), { a: true })).toEqual(['hit']);
    expect(cues(play(menu, 'a', 'a'), { a: true })).toEqual(['hurt']);
    expect(cues(play(menu, 'down', 'down'), { a: true })).toEqual(['confirm', 'run']);
  });

  it('wins the badge with a jingle, and faints when beaten', () => {
    // A boss steps up with a sound of its own.
    expect(cues(play(started(), 'down', 'down', 'right', 'a'), { a: true })).toEqual(['confirm', 'showdown', 'cry:rat']);
    const boss = play(started(), 'down', 'down', 'right', 'a', 'a');
    const won = fight(boss);
    expect(won.state.badges).toEqual(['one']);
    expect(won.heard).toContain('badge');
    expect(won.heard).toContain('item');
    expect(won.heard).not.toContain('faint');

    const ogre = play(started(), 'down', 'down', 'left', 'a');
    const lost = fight(ogre);
    expect(lost.heard).toContain('faint');
    expect(lost.heard).not.toContain('badge');
  });

  it('beeps when the energy is low after a blow, but not when it is gone', () => {
    const menu = play({ ...play(started(), 'down'), hp: 7 }, 'right', 'a');
    const hurt = step(play(menu, 'a', 'a'), { ...NO_INPUT, a: true }, world, { instant: true });
    expect(hurt.state.hp).toBeLessThanOrEqual(5);
    expect(hurt.cues).toEqual(['hurt', 'low']);
  });
});
