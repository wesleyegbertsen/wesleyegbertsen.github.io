import { ENDING_HOLD, initialGame, startsAgain, step } from './engine.ts';
import { play, testWorld as world } from './testWorld.ts';
import { NO_INPUT, type GameState, type Input } from './types.ts';

/** In the test world: at the host in the room, who ends the game. */
const ended = () => {
  const talking = play(play(initialGame(world), 'a', 'a'), 'right', 'right', 'right', 'a');
  return step(talking, { ...NO_INPUT, a: true }, world, { instant: true }).state;
};
const tick = (state: GameState, input: Partial<Input> = {}, instant = true) => step(state, { ...NO_INPUT, ...input }, world, { instant });

describe('the ending screen', () => {
  it('with reduced motion (no clock runs, one key is one move) holds for one press, which it does not take', () => {
    const end = ended();
    const first = tick(end, { a: true });
    expect(first.state).toMatchObject({ scene: 'ending', ending: { ticks: ENDING_HOLD } });
    expect(first.cues).toEqual([]);
    expect(tick(first.state, { a: true }).state.scene).toBe('world');
  });

  it('with motion holds for a second of ticks, and takes no press meanwhile', () => {
    const end = ended();
    expect(end).toMatchObject({ scene: 'ending', finished: true, ending: { ticks: 0 } });
    let state = end;
    for (let i = 0; i < ENDING_HOLD - 1; i++) {
      state = tick(state, i % 2 === 0 ? { a: true } : { start: true }, false).state;
      expect(state.scene, `tick ${i}`).toBe('ending');
    }
    expect(state.ending).toEqual({ ticks: ENDING_HOLD - 1 });
    // Once held, it stands still: the same state while nothing is pressed.
    const held = tick(state).state;
    expect(held.ending).toEqual({ ticks: ENDING_HOLD });
    expect(tick(held).state).toBe(held);
    expect(tick(held, { dir: 'down', pressed: 'down' }).state).toBe(held);
  });

  it('KEEP EXPLORING (A or Start) puts the player back where they stood, with everything kept and the game still finished', () => {
    let state = ended();
    for (let i = 0; i < ENDING_HOLD; i++) state = tick(state).state;
    const before = state;
    for (const press of [{ a: true }, { start: true }] as const) {
      const kept = tick(before, press);
      expect(kept.state).toMatchObject({ scene: 'world', finished: true, map: before.map, x: before.x, y: before.y, dir: before.dir, walk: null, dialogue: null, battle: null, menu: null });
      expect(kept.state.ending).toBeUndefined();
      for (const key of ['items', 'badges', 'level', 'xp', 'coins', 'flags', 'moves', 'seen', 'hp', 'maxHp'] as const) expect(kept.state[key], key).toEqual(before[key]);
      expect(kept.cues).toEqual(['confirm']);
      expect(kept.events).toEqual([{ kind: 'place', text: world.maps[before.map]!.name }]);
    }
    // And the player can walk: down, onto the mat and out of the room.
    const kept = tick(before, { a: true }).state;
    expect(play(kept, 'down').map).toBe('main');
    // Talking to the host again ends it again, from the start of the hold.
    const again = play(kept, 'a', 'a');
    expect(again).toMatchObject({ scene: 'ending', ending: { ticks: 0 } });
  });
});

describe('leaving and coming back', () => {
  it('starts again only from the ending screen: a game that explores after the end is picked up like any other', () => {
    expect(startsAgain(null)).toBe(true);
    const end = ended();
    expect(startsAgain(end)).toBe(true);
    let state = end;
    for (let i = 0; i < ENDING_HOLD; i++) state = tick(state).state;
    const exploring = tick(state, { a: true }).state;
    expect(exploring.finished).toBe(true);
    expect(startsAgain(exploring)).toBe(false);
    expect(startsAgain(play(initialGame(world), 'a', 'a'))).toBe(false);
  });
});
