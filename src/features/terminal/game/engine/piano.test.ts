import { trackFor } from '../audio/director.ts';
import { initialGame, step } from './engine.ts';
import { playIn, testWorld } from './testWorld.ts';
import { NO_INPUT, type GameObject, type GameState, type Input, type World } from './types.ts';

// The test world's town with a player piano where the coffee machine was (5,1), a rest where the sign was (3,1),
// and two pieces: the first 600 ticks (ten seconds) long, the second 300.
const main = testWorld.maps.main!;
const swap = (id: string, change: Partial<GameObject>) => main.objects.map((object) => (object.id === id ? { ...object, ...change } : object));
const objects = swap('main:k', { sprite: 'piano', branches: [{ do: [{ piano: true }] }] }).map((object) =>
  object.id === 'main:s' ? { ...object, branches: [{ do: [{ heal: true as const, rest: 30 }] }] } : object,
);
const world: World = {
  ...testWorld,
  maps: { ...testWorld.maps, main: { ...main, objects } },
  music: { title: 't', ending: 'e', wild: 'w', boss: 'b', victory: 'v', indoors: 'in', maps: { main: 'town', room: 'room' } },
  pieces: [
    { id: 'moon', name: 'MOONLIGHT SONATA', artist: 'BEETHOVEN', track: 'moonlight', ticks: 600 },
    { id: 'other', name: 'ANOTHER PIECE', artist: 'SOMEONE', track: 'other', ticks: 300 },
  ],
};
const play = (state: GameState, ...inputs: Parameters<typeof playIn>[2][]) => playIn(world, state, ...inputs);
const tick = (state: GameState, input: Partial<Input> = {}, instant = false) => step(state, { ...NO_INPUT, ...input }, world, { instant });
/** In front of the piano: right, right, up, and right to face it. */
const atPiano = () => play(play(initialGame(world), 'a', 'a'), 'right', 'right', 'up', 'right');
/** The selector open, and the first piece played from it. */
const playing = () => play(atPiano(), 'a', 'a');

describe('the piece selector of the player piano', () => {
  it('opens with A while the piano is off, on the first row; up and down move; B closes it and nothing plays', () => {
    const open = tick(atPiano(), { a: true }, true);
    expect(open.state.pick).toEqual({ cursor: 0 });
    expect(open.state.piano).toBeUndefined();
    expect(open.events.map((event) => event.text)).toEqual(['The player piano. MOONLIGHT SONATA, BEETHOVEN, 0:10.']);
    const down = tick(open.state, { dir: 'down', pressed: 'down' }, true);
    expect(down.state.pick).toEqual({ cursor: 1 });
    expect(down.cues).toEqual(['cursor']);
    expect(down.events.map((event) => event.text)).toEqual(['ANOTHER PIECE, SOMEONE, 0:05.']);
    // The ends hold, and the player does not walk meanwhile.
    expect(play(down.state, 'down').pick).toEqual({ cursor: 1 });
    expect(play(down.state, 'down')).toMatchObject({ x: 4, y: 1 });
    const cancelled = tick(down.state, { b: true }, true);
    expect(cancelled.state.pick).toBeUndefined();
    expect(cancelled.state.piano).toBeUndefined();
    expect(cancelled.cues).toEqual(['cancel']);
    expect(trackFor(cancelled.state, world)).toBe('town');
  });

  it('plays the piece under the cursor with A: its own track and its own length', () => {
    const first = playing();
    expect(first.pick).toBeUndefined();
    expect(first.piano).toEqual({ map: 'main', piece: 'moon', ticks: 600 });
    expect(trackFor(first, world)).toBe('moonlight');
    const second = play(atPiano(), 'a', 'down', 'a');
    expect(second.piano).toEqual({ map: 'main', piece: 'other', ticks: 300 });
    expect(trackFor(second, world)).toBe('other');
  });

  it('while it plays, A stops it and the tune of the room comes back; no selector then', () => {
    const on = playing();
    const off = tick(on, { a: true }, true);
    expect(off.state.piano).toBeUndefined();
    expect(off.state.pick).toBeUndefined();
    expect(off.events.map((event) => event.text)).toEqual(['The player piano stops.']);
    expect(trackFor(off.state, world)).toBe('town');
    // Off again: A opens the selector, on the first row.
    expect(tick(off.state, { a: true }, true).state.pick).toEqual({ cursor: 0 });
  });
});

describe('the player piano', () => {
  it('turns itself off at the end of the piece: a tick at a time with motion, menus and text boxes too', () => {
    let state = playing();
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
    let state = playing();
    state = tick(state, { dir: 'left', pressed: 'left' }, true).state;
    expect(state.piano?.ticks).toBe(600);
    state = tick(state, { elapsed: 250 }, true).state;
    expect(state.piano?.ticks).toBe(350);
    expect(tick(state, { elapsed: 350 }, true).state.piano).toBeUndefined();
  });

  it('stops when the player leaves its room, and when the player rests', () => {
    const on = playing();
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
