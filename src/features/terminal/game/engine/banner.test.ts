import { BANNER_HOLD, BANNER_SLIDE, BANNER_STILL, bannerOut, bannerText } from './banner.ts';
import { WALK_TICKS, initialGame, step } from './engine.ts';
import { play, playIn, testWorld } from './testWorld.ts';
import { NO_INPUT, type GameState, type Input, type World } from './types.ts';
import { areaAt } from './world.ts';

/** The label with the name of a place: when it shows, and how it comes and goes on the game clock. */

// The test world with a named corner: the two cells left of the tall grass, on the row of the tall grass and under it.
const world: World = {
  ...testWorld,
  maps: { ...testWorld.maps, main: { ...testWorld.maps.main!, areas: [{ name: 'The Nook', x: 1, y: 3, w: 2, h: 2 }] } },
};
const started = (on: World = world) => playIn(on, initialGame(on, 7), 'a', 'a');
const dir = (name: NonNullable<Input['dir']>) => ({ dir: name, pressed: name });
/** One tick with motion: nothing is instant. */
const tick = (state: GameState, input: Partial<Input> = {}) => step(state, { ...NO_INPUT, ...input }, world);
function ticks(state: GameState, count: number): GameState {
  let current = state;
  for (let i = 0; i < count; i++) current = tick(current).state;
  return current;
}
/** Through the door of the test world with motion: three steps to the right, the last one onto the door. */
function throughTheDoor(): GameState {
  let state = started();
  for (let i = 0; i < 3 * WALK_TICKS + 2 && state.map === 'main'; i++) state = tick(state, { dir: 'right' }).state;
  expect(state.map).toBe('room');
  return state;
}

describe('where the label shows', () => {
  it('names a cell after the named part of the map it is in, or else after the map', () => {
    const main = world.maps.main!;
    expect(areaAt(main, 1, 3)).toBe('The Nook');
    expect(areaAt(main, 2, 4)).toBe('The Nook');
    expect(areaAt(main, 3, 3)).toBe('Main');
    expect(areaAt(main, 1, 2)).toBe('Main');
    expect(areaAt(testWorld.maps.main!, 1, 3)).toBe('Main');
  });

  it('shows the name of the first map when the game starts, without a line for the status region', () => {
    const fresh = initialGame(world, 7);
    expect(fresh).toMatchObject({ area: '', banner: null });
    const begun = step(fresh, { ...NO_INPUT, a: true }, world, { instant: true });
    expect(begun.state).toMatchObject({ area: 'Main', banner: { text: 'Main' } });
    expect(begun.events.map((event) => event.kind)).toEqual(['say']);
  });

  it('shows the name of another map on the way in, which the status region hears once', () => {
    const before = play(started(), 'right', 'right');
    const through = step(before, { ...NO_INPUT, ...dir('right') }, world, { instant: true });
    expect(through.state).toMatchObject({ map: 'room', area: 'Room', banner: { text: 'Room', at: through.state.clock } });
    expect(through.events).toEqual([{ kind: 'place', text: 'Room' }]);
    const back = step(through.state, { ...NO_INPUT, ...dir('down') }, world, { instant: true });
    expect(back.state).toMatchObject({ map: 'main', area: 'Main', banner: { text: 'Main' } });
    expect(back.events).toEqual([{ kind: 'place', text: 'Main' }]);
  });

  it('does not show it again while the player stays in the same place', () => {
    const begun = started();
    const walked = play(begun, 'right', 'up', 'left', 'down', 'right');
    expect(walked.banner).toBe(begun.banner);
    expect(walked.area).toBe('Main');
    // A text box and the bag do not bring it back either.
    expect(play(walked, 'select', 'a', 'start', 'b').banner).toBe(begun.banner);
  });

  it('shows the name of a named part on the way in and tells the status region; the way out is silent', () => {
    // From 2,2: left to 1,2, then down into the nook at 1,3.
    const beside = play(started(), 'left');
    const inside = step(beside, { ...NO_INPUT, ...dir('down') }, world, { instant: true });
    expect(inside.state).toMatchObject({ x: 1, y: 3, area: 'The Nook', banner: { text: 'The Nook' } });
    expect(inside.events).toEqual([{ kind: 'place', text: 'The Nook' }]);
    // Further in: nothing new.
    const deeper = step(inside.state, { ...NO_INPUT, ...dir('right') }, world, { instant: true });
    expect(deeper.state).toMatchObject({ x: 2, y: 3, area: 'The Nook' });
    expect(deeper.state.banner).toBe(inside.state.banner);
    expect(deeper.events).toEqual([]);
    // Out again: the place is the map, and no label and no line say so.
    const out = step(deeper.state, { ...NO_INPUT, ...dir('up') }, world, { instant: true });
    expect(out.state).toMatchObject({ x: 2, y: 2, area: 'Main' });
    expect(out.state.banner).toBe(inside.state.banner);
    expect(out.events).toEqual([]);
    // And in once more: it shows again.
    const again = step(out.state, { ...NO_INPUT, ...dir('down') }, world, { instant: true });
    expect(again.state.banner).toMatchObject({ text: 'The Nook', at: again.state.clock });
    expect(again.events).toEqual([{ kind: 'place', text: 'The Nook' }]);
  });

  it('shows where a defeat sent the player back to, when that is another map', () => {
    // Rest in the room (the heal spot is wherever the state says), go back and lose to the ogre.
    const home = { ...started(), heal: { map: 'room', x: 1, y: 2 } };
    let state = play(home, 'down', 'down', 'left', 'a');
    expect(state.battle?.enemy).toBe('ogre');
    for (let i = 0; i < 40 && state.battle; i++) state = play(state, 'a');
    expect(state).toMatchObject({ map: 'room', area: 'Room', banner: { text: 'Room' } });
  });
});

describe('how the label comes and goes', () => {
  it('slides in, stays and slides back out on the game clock, and is then gone', () => {
    const state = throughTheDoor();
    expect(state.banner).toMatchObject({ text: 'Room', slide: true });
    const seen: number[] = [];
    let current = state;
    for (let i = 0; i < BANNER_SLIDE * 2 + BANNER_HOLD + 10; i++) {
      seen.push(bannerOut(current));
      current = tick(current).state;
    }
    const whole = seen.indexOf(1);
    const leaving = seen.lastIndexOf(1);
    // In: step by step, never back.
    expect(seen[0]).toBeLessThan(0.2);
    expect(whole).toBeGreaterThan(BANNER_SLIDE / 2);
    expect(whole).toBeLessThanOrEqual(BANNER_SLIDE);
    for (let i = 1; i <= whole; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]!);
    // Whole for the hold.
    expect(leaving - whole).toBe(BANNER_HOLD);
    expect(seen.slice(whole, leaving + 1).every((out) => out === 1)).toBe(true);
    // Out: step by step down to nothing, and it stays away.
    const gone = seen.indexOf(0, leaving);
    expect(gone - leaving).toBe(BANNER_SLIDE);
    for (let i = leaving + 1; i <= gone; i++) expect(seen[i]).toBeLessThan(seen[i - 1]!);
    expect(seen.slice(gone).every((out) => out === 0)).toBe(true);
    expect(bannerText(current)).toBe('');
  });

  it('with reduced motion it is there at once, whole, and gone a few moves later: never half way', () => {
    const through = play(started(), 'right', 'right', 'right');
    expect(through.banner).toMatchObject({ text: 'Room', slide: false });
    expect(bannerOut(through)).toBe(1);
    expect(bannerText(through)).toBe('Room');
    const seen = [];
    let current = through;
    for (let i = 0; i < 10; i++) {
      // Up and down in the room: each press is a whole move of ten ticks.
      current = play(current, i % 2 === 0 ? 'left' : 'right');
      seen.push(bannerOut(current));
    }
    expect(new Set(seen)).toEqual(new Set([0, 1]));
    expect(seen.filter((out) => out === 1)).toHaveLength(BANNER_STILL / WALK_TICKS - 1);
    expect(seen.join('')).toMatch(/^1+0+$/);
  });

  it('waits while the clock stands still: in a text box', () => {
    // Select opens the hint; the text types itself for a while.
    const talking = tick(ticks(throughTheDoor(), 4), { select: true }).state;
    expect(talking.dialogue).not.toBeNull();
    const out = bannerOut(talking);
    expect(out).toBeGreaterThan(0);
    expect(out).toBeLessThan(1);
    expect(bannerOut(ticks(talking, 30))).toBe(out);
    // The text is read: the clock runs again and the label carries on.
    expect(bannerOut(ticks(play(talking, 'a', 'a'), 3))).toBeGreaterThan(out);
  });

  it('is nothing without a label, and before its time', () => {
    expect(bannerOut({ banner: null, clock: 5 })).toBe(0);
    expect(bannerOut({ banner: { text: 'X', at: 10, slide: true }, clock: 5 })).toBe(0);
    expect(bannerText({ banner: { text: 'X', at: 10, slide: false }, clock: 10 })).toBe('X');
  });
});
