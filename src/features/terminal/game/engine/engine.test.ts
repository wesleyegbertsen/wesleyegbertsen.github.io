import { TRAIL_TICKS, WALK_TICKS, initialGame, ownedItems, restScene, step } from './engine.ts';
import { random } from './rng.ts';
import { play, testWorld as world } from './testWorld.ts';
import { fold, paginate, wrap } from './text.ts';
import { NO_INPUT, type GameState } from './types.ts';
import { holds, objectAt, parseMap, spriteOf } from './world.ts';

const fresh = () => initialGame(world, 7);
/** Past the title and the intro. */
const started = () => play(fresh(), 'a', 'a');
const tick = (state: GameState, input = NO_INPUT) => step(state, input, world);

describe('rng', () => {
  it('gives the same value for the same seed, between 0 and 1', () => {
    expect(random(42)).toEqual(random(42));
    let seed = 1;
    for (let i = 0; i < 200; i++) {
      const next = random(seed);
      expect(next.value).toBeGreaterThanOrEqual(0);
      expect(next.value).toBeLessThan(1);
      seed = next.seed;
    }
    expect(random(1).value).not.toBe(random(2).value);
  });
});

describe('text', () => {
  it('folds what the font cannot draw', () => {
    expect(fold('²M-Solutions café – “hi”…')).toBe('2M-Solutions cafe - "hi"...');
    expect(fold('★')).toBe('?');
  });

  it('wraps on words and cuts a word that is too long', () => {
    expect(wrap('one two three four', 9)).toEqual(['one two', 'three', 'four']);
    expect(wrap('see https://example.com/long', 10)).toEqual(['see', 'https://', 'example', '.com/long']);
    expect(wrap('abcdefghijkl', 5)).toEqual(['abcde', 'fghij', 'kl']);
    expect(wrap('a b', 10)).toEqual(['a b']);
  });

  it('starts every paragraph on a new page', () => {
    expect(paginate(['a b c d', 'e'], 3, 2)).toEqual([['a b', 'c d'], ['e']]);
    expect(paginate(['a b c d e f'], 3, 2)).toEqual([['a b', 'c d'], ['e f']]);
  });

  it('spreads a long paragraph evenly, so no page is a single leftover line', () => {
    expect(paginate(['a b c d'], 1, 3)).toEqual([['a', 'b'], ['c', 'd']]);
    expect(paginate(['a b c d e f g'], 1, 3)).toEqual([['a', 'b', 'c'], ['d', 'e'], ['f', 'g']]);
  });
});

describe('parseMap', () => {
  const legend = { '.': { sprite: 'floor', solid: false } };
  const base = { id: 'm', name: 'M', ground: '.', objects: {} };

  it('names the map when a row is ragged or a character unknown', () => {
    expect(() => parseMap({ ...base, rows: ['..', '.'] }, legend)).toThrow(/m: row 1/);
    expect(() => parseMap({ ...base, rows: ['.?'] }, legend)).toThrow(/unknown character '\?'/);
  });

  it('wants every object on the map exactly once', () => {
    const objects = { a: { solid: true, trigger: 'interact' as const, branches: [] } };
    expect(() => parseMap({ ...base, rows: ['..'], objects }, legend)).toThrow(/not on the map/);
    expect(() => parseMap({ ...base, rows: ['aa'], objects }, legend)).toThrow(/twice/);
    expect(parseMap({ ...base, rows: ['.a'], objects }, legend).objects[0]).toMatchObject({ id: 'm:a', x: 1, y: 0 });
  });
});

describe('the trail through the tall grass', () => {
  it('rustles the grass that is walked into and the grass that is left, for a moment on the game clock', () => {
    // The tall grass of the test world is at 3,3; from 2,3 a step right goes into it.
    const before = { ...started(), x: 2, y: 3, dir: 'right' as const, clock: 100 };
    const into = tick(before, { ...NO_INPUT, dir: 'right', pressed: 'right' }).state;
    expect(into.walk).not.toBeNull();
    expect(into.trail).toEqual([{ map: 'main', x: 3, y: 3, at: 100 }]);
    // Out of it again: the cell left behind rustles, with a new time; the old entry is replaced, not stacked.
    const inside = { ...before, x: 3, y: 3, clock: 110, trail: into.trail, battle: null };
    const out = tick(inside, { ...NO_INPUT, dir: 'right', pressed: 'right' }).state;
    expect(out.trail).toEqual([{ map: 'main', x: 3, y: 3, at: 110 }]);
    // Old rustles are dropped once they are over.
    const later = tick({ ...before, clock: 100 + TRAIL_TICKS + 1, trail: into.trail }, { ...NO_INPUT, dir: 'left', pressed: 'left' }).state;
    expect(later.trail).toEqual([]);
    // Grass that is not walked through, and reduced motion: nothing.
    expect(tick({ ...before, x: 1, y: 2 }, { ...NO_INPUT, dir: 'right', pressed: 'right' }).state.trail ?? []).toEqual([]);
    expect(step(before, { ...NO_INPUT, dir: 'right', pressed: 'right' }, world, { instant: true }).state.trail ?? []).toEqual([]);
  });
});

describe('the title and dialogue', () => {
  it('asks for the other mode, Game Boy or Game Boy Color, when B is pressed on the title, and stays there', () => {
    const pressed = step(fresh(), { ...NO_INPUT, b: true }, world);
    expect(pressed.cues).toEqual(['mode']);
    expect(pressed.state.scene).toBe('title');
  });

  it('waits on the title, then opens the intro', () => {
    const state = fresh();
    expect(state.scene).toBe('title');
    expect(tick(state).state).toBe(state);
    const { state: next, events } = tick(state, { ...NO_INPUT, a: true });
    expect(next.scene).toBe('world');
    expect(next.dialogue?.pages).toEqual([['Welcome.']]);
    expect(events).toEqual([{ kind: 'say', text: 'Welcome.' }]);
  });

  it('types the text a character per tick, A shows it all, A again closes it', () => {
    let state = tick(fresh(), { ...NO_INPUT, a: true }).state;
    expect(state.dialogue?.shown).toBe(0);
    state = tick(tick(state).state).state;
    expect(state.dialogue?.shown).toBe(2);
    state = tick(state, { ...NO_INPUT, a: true }).state;
    expect(state.dialogue?.shown).toBe('Welcome.'.length);
    const settled = tick(state).state;
    expect(settled).toBe(state);
    expect(tick(state, { ...NO_INPUT, a: true }).state.dialogue).toBeNull();
  });

  it('shows the whole text at once with reduced motion', () => {
    expect(play(fresh(), 'a').dialogue?.shown).toBe('Welcome.'.length);
  });

  it('pages through a sign and announces every page', () => {
    const facing = play(started(), 'right', 'up');
    expect(facing).toMatchObject({ x: 3, y: 2, dir: 'up' });
    const first = step(facing, { ...NO_INPUT, a: true }, world, { instant: true });
    expect(first.events).toEqual([{ kind: 'say', text: 'Hello there.' }]);
    const second = step(first.state, { ...NO_INPUT, b: true }, world, { instant: true });
    expect(second.events).toEqual([{ kind: 'say', text: 'Second paragraph.' }]);
    expect(play(second.state, 'a').dialogue).toBeNull();
  });
});

describe('walking', () => {
  it('takes WALK_TICKS ticks per cell and keeps going while the direction is held', () => {
    const held = { ...NO_INPUT, dir: 'right' as const };
    let state = tick(started(), held).state;
    expect(state).toMatchObject({ x: 3, y: 2, walk: { fromX: 2, fromY: 2, t: 0 } });
    for (let i = 0; i < WALK_TICKS - 1; i++) state = tick(state, held).state;
    expect(state.walk?.t).toBe(WALK_TICKS - 1);
    state = tick(state, held).state;
    expect(state).toMatchObject({ x: 4, walk: { fromX: 3, t: 0 } });
    for (let i = 0; i < WALK_TICKS; i++) state = tick(state).state;
    expect(state).toMatchObject({ x: 4, walk: null });
  });

  it('turns towards a wall but does not walk into it: only the clock moves on', () => {
    const state = play(started(), 'left', 'left');
    expect(state).toMatchObject({ x: 1, y: 2, dir: 'left' });
    const bumped = step(state, { ...NO_INPUT, dir: 'left', pressed: 'left' }, world, { instant: true });
    expect(bumped.state).toEqual({ ...state, clock: state.clock + WALK_TICKS });
    expect(bumped.cues).toEqual(['bump']);
    expect(tick(state).state).toEqual({ ...state, clock: state.clock + 1 });
    expect(tick(state).cues).toEqual([]);
  });

  it('runs the clock on the map only: not on the title, in a text box, a menu or a battle', () => {
    expect(fresh().clock).toBe(0);
    expect(tick(fresh()).state.clock).toBe(0);
    const talking = tick(fresh(), { ...NO_INPUT, a: true }).state;
    expect(tick(tick(talking).state).state.clock).toBe(0);
    const menu = play(started(), 'start');
    expect(tick(menu).state.clock).toBe(menu.clock);
    const battle = play(started(), 'down', 'right');
    expect(tick(battle).state.clock).toBe(battle.clock);
  });

  it('finishes a step that was under way when reduced motion is switched on', () => {
    const walking = tick(started(), { ...NO_INPUT, dir: 'right' }).state;
    expect(walking.walk).not.toBeNull();
    expect(step(walking, NO_INPUT, world, { instant: true }).state).toMatchObject({ x: 3, walk: null });
  });

  it('moves one whole cell per press with reduced motion', () => {
    expect(play(started(), 'down')).toMatchObject({ x: 2, y: 3, walk: null });
  });
});

describe('things on the map', () => {
  it('gives the item of a chest once and shows it open', () => {
    const at = play(started(), 'up', 'left');
    const chest = objectAt(world.maps.main!, 1, 1, at)!;
    expect(spriteOf(chest, at)).toBe('chest');
    const opened = step(at, { ...NO_INPUT, a: true }, world, { instant: true });
    expect(opened.events[0]).toMatchObject({ kind: 'item', text: expect.stringContaining('COFFEE') });
    expect(opened.state.items.coffee).toBe(1);
    expect(spriteOf(chest, opened.state)).toBe('chest-open');
    const again = play(opened.state, 'a', 'a');
    expect(again.dialogue?.pages).toEqual([['Empty.']]);
    expect(again.items.coffee).toBe(1);
  });

  it('goes through a door to another map and back over the mat', () => {
    const before = play(started(), 'right', 'right');
    const through = step(before, { ...NO_INPUT, dir: 'right', pressed: 'right' }, world, { instant: true });
    expect(through.state).toMatchObject({ map: 'room', x: 1, y: 2, dir: 'up' });
    expect(through.events).toEqual([{ kind: 'place', text: 'Room' }]);
    expect(play(through.state, 'down')).toMatchObject({ map: 'main', x: 4, y: 2, dir: 'left' });
  });

  it('walks through the door after the walking ticks too', () => {
    let state = play(started(), 'right', 'right');
    state = tick(state, { ...NO_INPUT, dir: 'right' }).state;
    for (let i = 0; i < WALK_TICKS; i++) state = tick(state).state;
    expect(state.map).toBe('room');
  });

  it('keeps a locked door shut and says why, until the player has the key', () => {
    const at = play(started(), 'right', 'right', 'down', 'down');
    expect(at).toMatchObject({ x: 4, y: 4 });
    const bumped = play(at, 'right');
    expect(bumped).toMatchObject({ x: 4, y: 4, dir: 'right' });
    expect(bumped.dialogue?.pages).toEqual([['Locked.']]);
    const withKey = { ...play(bumped, 'a'), items: { key: 1 } };
    expect(play(withKey, 'right')).toMatchObject({ x: 5, y: 4, dialogue: null });
  });

  it('rests at a coffee machine and remembers the place', () => {
    const hurt = { ...play(started(), 'right', 'right', 'up', 'right'), hp: 3, pp: { hit: 0, nap: 0 } };
    const rested = play(hurt, 'a');
    expect(rested).toMatchObject({ hp: 20, pp: { hit: 2, nap: 1 }, heal: { map: 'main', x: 4, y: 1 } });
  });

  it('plays the rest through before it goes on: the jingle first, then the words, and nothing moves meanwhile', () => {
    // The same machine, as a rest that takes 30 ticks (the cafe's barista).
    const main = world.maps.main!;
    const resting = { ...world, maps: { ...world.maps, main: { ...main, objects: main.objects.map((object) => (object.id === 'main:k' ? { ...object, branches: [{ do: [{ heal: true as const, rest: 30 }, { say: ['Rested.'] }] }] } : object)) } } };
    const hurt = { ...play(started(), 'right', 'right', 'up', 'right'), hp: 3 };
    const pressed = step(hurt, { ...NO_INPUT, a: true }, resting);
    expect(pressed.cues).toContain('rest');
    expect(pressed.cues).not.toContain('heal');
    expect(pressed.state).toMatchObject({ hp: 20, dialogue: null, pause: 30 });
    expect(pressed.events).toEqual([]);
    // Held keys do nothing while it plays.
    let state = pressed.state;
    for (let i = 0; i < 29; i++) state = step(state, { ...NO_INPUT, dir: 'left', a: true }, resting).state;
    expect(state).toMatchObject({ x: hurt.x, y: hurt.y, dialogue: null, pause: 1 });
    const done = step(state, NO_INPUT, resting);
    expect(done.state.dialogue?.pages).toEqual([['Rested.']]);
    expect(done.events).toEqual([{ kind: 'say', text: 'Rested.' }]);
    expect(done.state.pause).toBeFalsy();
    // With reduced motion the words come at once, as all text does.
    const instant = step(hurt, { ...NO_INPUT, a: true }, resting, { instant: true });
    expect(instant.cues).toContain('rest');
    expect(instant.state.dialogue?.pages).toEqual([['Rested.']]);
  });

  it('plays a scene with the rest: four mugs light up one after another with the tune, a sparkle, then the energy fills', () => {
    const main = world.maps.main!;
    const resting = { ...world, maps: { ...world.maps, main: { ...main, objects: main.objects.map((object) => (object.id === 'main:k' ? { ...object, branches: [{ do: [{ heal: true as const, rest: 64 }, { say: ['Rested.'] }] }] } : object)) } } };
    const hurt = { ...play(started(), 'right', 'right', 'up', 'right'), hp: 4 };
    let state = step(hurt, { ...NO_INPUT, a: true }, resting).state;
    expect(state.rest).toEqual({ ticks: 64, from: 4 });
    // Frame by frame: the mugs come one at a time, in order, never one going out again; then the sparkle; then the bar.
    const seen: ReturnType<typeof restScene>[] = [];
    while (state.pause) {
      seen.push(restScene(state));
      state = step(state, NO_INPUT, resting).state;
    }
    expect(seen).toHaveLength(64);
    const mugs = seen.map((scene) => scene!.mugs);
    expect(mugs[0]).toBe(0);
    expect(mugs.at(-1)).toBe(4);
    for (let i = 1; i < mugs.length; i++) expect(mugs[i]! - mugs[i - 1]!).toBeGreaterThanOrEqual(0);
    // Each mug lights once and stays lit: four changes in all, nothing that blinks.
    const changes = mugs.flatMap((count, i) => (i > 0 && count !== mugs[i - 1] ? [i] : []));
    expect(changes).toHaveLength(4);
    // The sparkle after the fourth mug; the bar fills after it, from the energy before the rest to full.
    const firstSparkle = seen.findIndex((scene) => scene!.sparkle);
    expect(firstSparkle).toBeGreaterThan(changes.at(-1)!);
    const energy = seen.map((scene) => scene!.hp);
    expect(energy[0]).toBe(4);
    expect(energy[firstSparkle]).toBe(4);
    expect(energy.at(-1)).toBe(hurt.maxHp);
    for (let i = 1; i < energy.length; i++) expect(energy[i]!).toBeGreaterThanOrEqual(energy[i - 1]!);
    // Over: no scene, and the words come.
    expect(restScene(state)).toBeNull();
    expect(state.rest).toBeUndefined();
    expect(state.dialogue?.pages).toEqual([['Rested.']]);
    // With reduced motion there is no scene at all: the end at once.
    expect(step(hurt, { ...NO_INPUT, a: true }, resting, { instant: true }).state.rest).toBeUndefined();
  });

  it('ends the game at the host', () => {
    const inRoom = play(started(), 'right', 'right', 'right');
    const talking = play(inRoom, 'a');
    expect(talking.finished).toBe(false);
    const ended = step(talking, { ...NO_INPUT, a: true }, world, { instant: true });
    expect(ended.state).toMatchObject({ scene: 'ending', finished: true });
    expect(ended.events).toEqual([{ kind: 'ending', text: 'THE END' }]);
    expect(play(ended.state, 'a', 'left')).toBe(ended.state);
  });
});

describe('the menu and the hint', () => {
  it('opens with Start, switches tabs, and closes with B or Start', () => {
    const open = play(started(), 'start');
    expect(open.menu).toEqual({ tab: 'items', cursor: 0 });
    expect(play(open, 'right').menu?.tab).toBe('badges');
    expect(play(open, 'right', 'left').menu?.tab).toBe('items');
    expect(play(open, 'b').menu).toBeNull();
    expect(play(open, 'start').menu).toBeNull();
    expect(play(open, 'down')).toMatchObject({ x: 2, y: 2 });
  });

  it('drinks a coffee from the bag when hurt, and not when full', () => {
    const full = { ...started(), items: { coffee: 1, key: 1 } };
    expect(ownedItems(full, world)).toEqual(['coffee', 'key']);
    const refused = play(full, 'start', 'a');
    expect(refused.items.coffee).toBe(1);
    expect(refused.dialogue?.pages[0]).toEqual(['You are full of energy', 'already.']);

    const used = play({ ...full, hp: 5 }, 'start', 'a');
    expect(used).toMatchObject({ hp: 20, items: { coffee: 0 } });
    expect(ownedItems(used, world)).toEqual(['key']);

    const described = play(full, 'start', 'down', 'a');
    expect(described.dialogue?.pages[0]).toEqual(['KEY: Opens a door.']);
  });

  it('counts items for a condition', () => {
    const state = { ...started(), items: { coffee: 2 } };
    expect(holds({ count: { item: 'coffee', min: 2 } }, state)).toBe(true);
    expect(holds({ count: { item: 'coffee', min: 3 } }, state)).toBe(false);
    expect(holds({ count: { item: 'key', min: 1 } }, state)).toBe(false);
  });

  it('gives the first hint that applies on Select', () => {
    expect(play(started(), 'select').dialogue?.pages).toEqual([['Beat the rat.']]);
    expect(play({ ...started(), badges: ['one'] }, 'select').dialogue?.pages).toEqual([['Go to the door.']]);
  });
});

describe('the steps of a walk', () => {
  it('counts the steps of one walk (pace), from 0 on the first step after standing, and starts again after a stop', () => {
    // From the start of the test world, with motion: hold right, and count the steps as they begin.
    let state = { ...play(fresh(), 'a', 'a'), x: 1, y: 2 } as GameState;
    const paces: number[] = [];
    for (let i = 0; i < 3 * WALK_TICKS + 1; i++) {
      const before = state.walk;
      state = tick(state, { ...NO_INPUT, dir: 'right', pressed: i === 0 ? 'right' : null }).state;
      if (state.walk && state.walk !== before && state.walk.t === 0) paces.push(state.pace ?? 0);
    }
    expect(paces.slice(0, 3)).toEqual([0, 1, 2]);
    // Let go: the walk ends; the next press starts at 0 again.
    for (let i = 0; i < WALK_TICKS + 2; i++) state = tick(state).state;
    expect(state.walk).toBeNull();
    const again = tick(state, { ...NO_INPUT, dir: 'down', pressed: 'down' }).state;
    expect(again.walk).not.toBeNull();
    expect(again.pace ?? 0).toBe(0);
  });
});
