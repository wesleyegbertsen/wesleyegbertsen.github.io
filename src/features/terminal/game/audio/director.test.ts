import { initialGame, step } from '../engine/engine.ts';
import { play, testWorld } from '../engine/testWorld.ts';
import { NO_INPUT, type GameState, type World } from '../engine/types.ts';
import { trackFor } from './director.ts';

const world: World = {
  ...testWorld,
  music: { title: 'title', ending: 'ending', wild: 'wild', boss: 'boss', victory: 'victory', indoors: 'indoors', maps: { main: 'town' } },
};
const started = () => play(initialGame(world, 7), 'a', 'a');
const a = (state: GameState) => step(state, { ...NO_INPUT, a: true }, world, { instant: true }).state;

describe('the tune a moment wants', () => {
  it('is the title tune on the title, the map tune on a listed map and the indoor tune elsewhere', () => {
    expect(trackFor(initialGame(world), world)).toBe('title');
    expect(trackFor(started(), world)).toBe('town');
    expect(trackFor(play(started(), 'right', 'right', 'right'), world)).toBe('indoors');
  });

  it('keeps the map tune under a text box and the bag', () => {
    expect(trackFor(play(initialGame(world), 'a'), world)).toBe('town');
    expect(trackFor(play(started(), 'start'), world)).toBe('town');
  });

  it('is the wild tune in the tall grass and the boss tune against a boss', () => {
    expect(trackFor(play(started(), 'down', 'right'), world)).toBe('wild');
    expect(trackFor(play(started(), 'down', 'down', 'right', 'a', 'a'), world)).toBe('boss');
  });

  it('falls silent for the way into a battle, so its sound stands alone, and strikes up when the battle screen is there', () => {
    const tick = (state: GameState) => step(state, NO_INPUT, world).state;
    // Into the tall grass with motion: the walk takes its ticks, then the transition starts.
    let state = step(play(started(), 'down'), { ...NO_INPUT, dir: 'right' }, world).state;
    for (let i = 0; i < 20 && !state.battle; i++) state = tick(state);
    expect(state.battle!.intro).toBeGreaterThan(0);
    const heard = new Set<string | null>();
    for (let i = 0; i < 200 && state.battle!.intro > 0; i++) {
      heard.add(trackFor(state, world));
      state = tick(state);
    }
    expect(heard).toEqual(new Set([null]));
    expect(trackFor(state, world)).toBe('wild');
    // A boss: the same, and then its own tune.
    let boss = step(play(started(), 'down', 'down', 'right', 'a'), { ...NO_INPUT, a: true }, world).state;
    expect(boss.battle!.intro).toBeGreaterThan(0);
    expect(trackFor(boss, world)).toBeNull();
    for (let i = 0; i < 200 && boss.battle!.intro > 0; i++) boss = tick(boss);
    expect(trackFor(boss, world)).toBe('boss');
  });

  it('turns into the fanfare on the line that says the enemy is beaten, and back to the map after', () => {
    let state = play(started(), 'down', 'right');
    const heard: (string | null)[] = [];
    for (let i = 0; i < 60 && state.battle; i++) {
      state = a(state);
      heard.push(trackFor(state, world));
    }
    const fanfare = heard.indexOf('victory');
    expect(fanfare).toBeGreaterThan(0);
    // Up to the fanfare it is the battle tune; from the fanfare on it never goes back to it.
    expect(new Set(heard.slice(0, fanfare))).toEqual(new Set(['wild']));
    expect(heard.slice(fanfare)).not.toContain('wild');
    expect(heard.at(-1)).toBe('town');
  });

  it('stays the battle tune through a defeat, and is the ending tune at the end', () => {
    let state = play(started(), 'down', 'down', 'left', 'a');
    const heard = new Set<string | null>();
    for (let i = 0; i < 60 && state.battle; i++) {
      heard.add(trackFor(state, world));
      state = a(state);
    }
    expect(heard).toEqual(new Set(['boss']));
    expect(trackFor({ ...started(), scene: 'ending', finished: true }, world)).toBe('ending');
  });

  it('is silence in a world without music', () => {
    expect(trackFor(started(), testWorld)).toBeNull();
  });
});
