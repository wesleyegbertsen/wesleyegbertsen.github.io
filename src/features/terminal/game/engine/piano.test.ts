import { trackFor } from '../audio/director.ts';
import { initialGame, step } from './engine.ts';
import { playIn, testWorld } from './testWorld.ts';
import { NO_INPUT, type GameObject, type GameState, type Input, type World } from './types.ts';

// The test world's town with a player piano where the coffee machine was (5,1), a rest where the sign was (3,1),
// and a piece of 600 ticks (ten seconds).
const main = testWorld.maps.main!;
const swap = (id: string, change: Partial<GameObject>) => main.objects.map((object) => (object.id === id ? { ...object, ...change } : object));
const objects = swap('main:k', { sprite: 'piano', branches: [{ do: [{ piano: true }] }] }).map((object) =>
  object.id === 'main:s' ? { ...object, branches: [{ do: [{ heal: true as const, rest: 30 }] }] } : object,
);
const world: World = {
  ...testWorld,
  maps: { ...testWorld.maps, main: { ...main, objects } },
  music: { title: 't', ending: 'e', wild: 'w', boss: 'b', victory: 'v', indoors: 'in', maps: { main: 'town', room: 'room' }, piano: 'moonlight', pianoTicks: 600 },
};
const play = (state: GameState, ...inputs: Parameters<typeof playIn>[2][]) => playIn(world, state, ...inputs);
const tick = (state: GameState, input: Partial<Input> = {}, instant = false) => step(state, { ...NO_INPUT, ...input }, world, { instant });
/** In front of the piano: right, right, up, and right to face it. */
const atPiano = () => play(play(initialGame(world), 'a', 'a'), 'right', 'right', 'up', 'right');

describe('the player piano', () => {
  it('starts with A (the piece from its start) and stops with A again; the tune follows', () => {
    const before = atPiano();
    expect(before.piano).toBeUndefined();
    expect(trackFor(before, world)).toBe('town');
    const on = tick(before, { a: true }, true);
    expect(on.state.piano).toEqual({ map: 'main', ticks: 600 });
    expect(on.events.map((event) => event.text)).toEqual(['The player piano plays.']);
    expect(trackFor(on.state, world)).toBe('moonlight');
    const off = tick(on.state, { a: true }, true);
    expect(off.state.piano).toBeUndefined();
    expect(off.events.map((event) => event.text)).toEqual(['The player piano stops.']);
    expect(trackFor(off.state, world)).toBe('town');
    // On again: from the start.
    expect(tick(off.state, { a: true }, true).state.piano).toEqual({ map: 'main', ticks: 600 });
  });

  it('turns itself off at the end of the piece: a tick at a time with motion, menus and text boxes too', () => {
    let state = tick(atPiano(), { a: true }, true).state;
    for (let i = 0; i < 300; i++) state = tick(state).state;
    expect(state.piano?.ticks).toBe(300);
    state = tick(state, { start: true }).state;
    expect(state.menu).not.toBeNull();
    // (The press that opened it was a tick too.)
    for (let i = 0; i < 298; i++) state = tick(state).state;
    expect(state.piano?.ticks).toBe(1);
    const end = tick(state);
    expect(end.state.piano).toBeUndefined();
    expect(end.events.map((event) => event.text)).toEqual(['The player piano stops.']);
  });

  it('with reduced motion counts only the time the page says went by (elapsed), not the presses', () => {
    let state = tick(atPiano(), { a: true }, true).state;
    state = tick(state, { dir: 'left', pressed: 'left' }, true).state;
    expect(state.piano?.ticks).toBe(600);
    state = tick(state, { elapsed: 250 }, true).state;
    expect(state.piano?.ticks).toBe(350);
    expect(tick(state, { elapsed: 350 }, true).state.piano).toBeUndefined();
  });

  it('stops when the player leaves its room, and when the player rests', () => {
    const on = tick(atPiano(), { a: true }, true).state;
    // Down, and right through the door: another map.
    const away = play(on, 'down', 'right');
    expect(away.map).toBe('room');
    expect(away.piano).toBeUndefined();
    expect(trackFor(away, world)).toBe('room');
    // The rest, to the left of where the player stands (the sign's place).
    const rested = play(play(on, 'left'), 'a');
    expect(rested.piano).toBeUndefined();
  });
});
