import { trackFor } from '../audio/director.ts';
import { FACE_TICKS, initialGame, learnRows, step } from './engine.ts';
import { levelWorld, playIn, testWorld } from './testWorld.ts';
import { NO_INPUT, SETTINGS, type Cue, type GameEvent, type GameState, type Input, type World } from './types.ts';
import { holds, parseMap } from './world.ts';

/**
 * Levels in play: XP for a win, a new level, the offer of a new move, wild enemies of several levels. On
 * levelWorld (see testWorld.ts): a wild RAT is worth 6 XP, which is level 2, and level 2 offers ZAP.
 */

type Told = { state: GameState; events: GameEvent[]; cues: Cue[] };

function press(world: World, state: GameState, input: Partial<Input>): Told {
  return step(state, { ...NO_INPUT, ...input }, world, { instant: true });
}

/** Presses A until the battle is over, and tells what was said and heard on the way. */
function fight(world: World, from: GameState): Told {
  const told: Told = { state: from, events: [], cues: [] };
  for (let i = 0; i < 200 && told.state.battle; i++) {
    const next = press(world, told.state, { a: true });
    told.state = next.state;
    told.events.push(...next.events);
    told.cues.push(...next.cues);
  }
  expect(told.state.battle).toBeNull();
  return told;
}

const started = (world: World, seed = 7) => playIn(world, initialGame(world, seed), 'a', 'a');
/** Into the tall grass: a wild RAT. */
const wild = (world: World, seed = 7) => playIn(world, started(world, seed), 'down', 'right');
/** Up to the RAT that stands guard (a boss), past its line. */
const boss = (world: World, seed = 7) => playIn(world, started(world, seed), 'down', 'down', 'right', 'a', 'a');

describe('XP', () => {
  it('starts everyone at level 1 with the moves of the world', () => {
    const state = initialGame(levelWorld);
    expect(state).toMatchObject({ level: 1, xp: 0, bonusHp: 0, learn: null, moves: ['hit', 'nap'] });
    expect(state.moves).not.toBe(levelWorld.playerMoves);
  });

  it('pays for a won wild battle by the level of the enemy, and says so', () => {
    const before = wild(testWorld);
    expect(before.battle).toMatchObject({ enemy: 'rat', level: 2, wild: true });
    const { state, events } = fight(testWorld, before);
    expect(state.xp).toBe(6);
    expect(state.level).toBe(1);
    expect(events.map((event) => event.text)).toContain('You gain 6 XP.');
    expect(state.learn).toBeNull();
  });

  it('pays far more for a boss', () => {
    const { state, events } = fight(testWorld, boss(testWorld));
    expect(state.xp).toBe(20);
    expect(events.map((event) => event.text)).toContain('You gain 20 XP.');
  });

  it('pays nothing for running away or for a defeat', () => {
    const ran = playIn(testWorld, wild(testWorld), 'a', 'down', 'down', 'a', 'a');
    expect(ran.battle).toBeNull();
    expect(ran.xp).toBe(0);
    const ogre = playIn(testWorld, started(testWorld), 'down', 'down', 'left', 'a');
    expect(ogre.battle?.enemy).toBe('ogre');
    const lost = fight(testWorld, ogre).state;
    expect(lost.xp).toBe(0);
    expect(lost.level).toBe(1);
  });
});

describe('a new level', () => {
  it('comes with the XP: more max energy, the same amount more energy, a jingle and a line', () => {
    const before = wild(levelWorld);
    const hurt = { ...before, hp: 12 };
    const { state, events, cues } = fight(levelWorld, hurt);
    expect(state.level).toBe(2);
    expect(state.maxHp).toBe(levelWorld.baseHp + 3);
    // Whatever the rat did to the 12 energy, the 3 of the new level came on top.
    const taken = events.filter((event) => /You lose \d+ HP/.test(event.text)).reduce((sum, event) => sum + Number(/lose (\d+)/.exec(event.text)![1]), 0);
    expect(state.hp).toBe(12 - taken + 3);
    expect(cues.filter((cue) => cue === 'levelup')).toHaveLength(1);
    expect(events.some((event) => event.text.includes('You grew to Lv 2!'))).toBe(true);
  });

  it('can be two at once, each with its line', () => {
    const { state, events } = fight(levelWorld, boss(levelWorld));
    expect(state.xp).toBe(20);
    expect(state.level).toBe(3);
    expect(events.filter((event) => event.text.includes('You grew to Lv')).map((event) => /Lv (\d)/.exec(event.text)![1])).toEqual(['2', '3']);
    expect(state.maxHp).toBe(levelWorld.baseHp + 6);
  });

  it('makes every attack stronger', () => {
    // HIT is power 6: 5 to 7 at level 1. At level 3 of levelWorld every attack does 2 more.
    const dealt = (level: number) => {
      const seen = new Set<number>();
      for (let seed = 1; seed <= 40; seed++) {
        const at = { ...wild(levelWorld, seed), level };
        const { events } = step(playIn(levelWorld, at, 'a', 'a'), { ...NO_INPUT, a: true }, levelWorld, { instant: true });
        const hit = /RAT loses (\d+) HP/.exec(events.map((event) => event.text).join(' '));
        if (hit) seen.add(Number(hit[1]));
      }
      return [...seen].sort((a, b) => a - b);
    };
    expect(dealt(1)).toEqual([5, 6, 7]);
    expect(dealt(3)).toEqual([7, 8, 9]);
  });

  it('stops at the top level: no more XP, no line about it', () => {
    const top = { ...wild(levelWorld), level: levelWorld.levels.max, xp: 40 };
    const { state, events } = fight(levelWorld, top);
    expect(state.xp).toBe(40);
    expect(state.level).toBe(levelWorld.levels.max);
    expect(events.some((event) => event.text.includes('XP'))).toBe(false);
  });

  it('keeps the grown energy after a badge, a defeat and a rest', () => {
    const grown = fight(levelWorld, boss(levelWorld)).state;
    // The boss's win hands out the badge: base 20, a badge 5, two levels 6.
    const settled = playIn(levelWorld, grown, 'b', 'a', 'a', 'a', 'a');
    expect(settled.badges).toEqual(['one']);
    expect(settled.maxHp).toBe(31);
    expect(settled.hp).toBe(31);
  });

  it('plays the fanfare from the line that says the enemy is beaten, through the XP and the new level', () => {
    const world: World = { ...levelWorld, music: { title: 't', ending: 'e', wild: 'wild', boss: 'boss', victory: 'victory', indoors: 'in', maps: {} } };
    let state = wild(world);
    const heard: string[] = [];
    for (let i = 0; i < 60 && state.battle; i++) {
      state = press(world, state, { a: true }).state;
      if (state.battle) heard.push(`${trackFor(state, world)}:${state.battle.steps[0]?.text ?? ''}`);
    }
    const cheers = heard.filter((line) => line.startsWith('victory:'));
    expect(cheers.map((line) => line.slice(8))).toEqual(['RAT ran off.', 'You gain 6 XP.', 'You grew to Lv 2! More energy, stronger moves.']);
    expect(heard.filter((line) => !line.startsWith('victory:')).every((line) => line.startsWith('wild:'))).toBe(true);
  });
});

describe('the offer of a new move', () => {
  const offered = () => fight(levelWorld, wild(levelWorld));

  it('opens after the battle that reached the level, and is announced with what the move does', () => {
    const { state, events } = offered();
    expect(state.learn).toEqual({ move: 'zap', cursor: 0 });
    expect(state.dialogue).toBeNull();
    expect(events.at(-1)).toEqual({ kind: 'menu', text: 'You can learn ZAP: power 9, hits 100%, 3 PP. Pick a move to replace, or press B to keep your moves.' });
    // The first move is not on the list: it is the default and stays.
    expect(learnRows(state)).toEqual(['nap']);
  });

  it('replaces the picked move with A: the new one is in its place, with full PP', () => {
    const { state } = offered();
    const swapped = press(levelWorld, state, { a: true });
    expect(swapped.state.learn).toBeNull();
    expect(swapped.state.moves).toEqual(['hit', 'zap']);
    expect(swapped.state.pp).toEqual({ hit: state.pp.hit, zap: 3 });
    expect(swapped.events.at(-1)?.text).toBe('You forget NAP and learn ZAP!');
    // The new move is in the battle menu from now on.
    const again = playIn(levelWorld, swapped.state, 'a', 'left', 'right', 'a', 'a', 'down', 'a');
    expect(again.battle?.steps[0]?.text).toContain('You use ZAP!');
  });

  it('keeps the moves with B', () => {
    const { state } = offered();
    const kept = press(levelWorld, state, { b: true });
    expect(kept.state.learn).toBeNull();
    expect(kept.state.moves).toEqual(['hit', 'nap']);
    expect(kept.events.at(-1)?.text).toBe('You keep your moves. ZAP will have to wait.');
    expect(kept.cues).toContain('cancel');
  });

  it('keeps the moves with the last entry too, and reads the entries out as the cursor moves', () => {
    const { state } = offered();
    const down = press(levelWorld, state, { pressed: 'down' });
    expect(down.state.learn).toEqual({ move: 'zap', cursor: 1 });
    expect(down.events).toEqual([{ kind: 'menu', text: 'Keep my moves' }]);
    expect(down.cues).toEqual(['cursor']);
    expect(press(levelWorld, down.state, { pressed: 'down' }).state).toBe(down.state);
    const up = press(levelWorld, down.state, { pressed: 'up' });
    expect(up.events).toEqual([{ kind: 'menu', text: 'Replace NAP: heals 10, 1 PP' }]);
    const kept = press(levelWorld, down.state, { a: true });
    expect(kept.state.moves).toEqual(['hit', 'nap']);
    expect(kept.state.learn).toBeNull();
  });

  it('holds everything else until it is answered: no walking, no bag', () => {
    const { state } = offered();
    for (const input of [{ dir: 'left', pressed: 'left' }, { start: true }, { select: true }] as Partial<Input>[]) {
      const next = press(levelWorld, state, input).state;
      expect(next.learn).not.toBeNull();
      expect(next.x).toBe(state.x);
      expect(next.menu).toBeNull();
    }
  });

  it('comes before what the win hands out, and is not offered twice', () => {
    // The boss: two levels at once, and level 2 has the offer. Then the badge and the key follow.
    const { state } = fight(levelWorld, boss(levelWorld));
    expect(state.learn?.move).toBe('zap');
    expect(state.badges).toEqual([]);
    const after = playIn(levelWorld, state, 'a', 'a', 'a', 'a', 'a');
    expect(after.moves).toEqual(['hit', 'zap']);
    expect(after.badges).toEqual(['one']);
    expect(after.items.key).toBe(1);
    // A move that is already known is not offered again.
    const twice = step({ ...after, dialogue: null, script: [{ learn: 'zap' }, { say: ['Next.'] }] }, { ...NO_INPUT, a: true }, levelWorld, { instant: true });
    expect(twice.state.learn).toBeNull();
  });
});

describe('wild enemies of several levels', () => {
  const ranged: World = {
    ...levelWorld,
    maps: { ...levelWorld.maps, main: { ...levelWorld.maps.main!, encounters: { enemies: ['rat'], rate: 1, levels: [1, 5] } } },
  };

  it('draws a level from the range of the place, never under the enemy\'s own, with more energy above it', () => {
    const seen = new Map<number, number>();
    for (let seed = 1; seed <= 80; seed++) {
      const battle = wild(ranged, seed).battle!;
      seen.set(battle.level, battle.enemyMax);
      expect(battle.enemyHp).toBe(battle.enemyMax);
    }
    // The rat is level 2: the range 1 to 5 gives 2 (for a roll of 1 or 2), 3, 4 and 5.
    expect([...seen.keys()].sort()).toEqual([2, 3, 4, 5]);
    expect(seen.get(2)).toBe(10);
    expect(seen.get(5)).toBe(16);
  });

  it('pays XP by the level it had', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const before = wild(ranged, seed);
      const { state } = fight(ranged, { ...before, hp: 99, maxHp: 99, pp: { hit: 99, nap: 1 } });
      expect(state.xp).toBe(before.battle!.level * 3);
    }
  });
});

describe('a prize that lasts and a door that asks for a level', () => {
  it('adds max energy for good with boost', () => {
    const base = { ...started(testWorld), hp: 15 };
    const boosted = playIn(testWorld, { ...base, dialogue: { pages: [['x']], page: 0, shown: 1 }, script: [{ boost: 10 }] }, 'a');
    expect(boosted.bonusHp).toBe(10);
    expect(boosted.maxHp).toBe(30);
    expect(boosted.hp).toBe(25);
    expect(boosted.dialogue?.pages[0]?.join(' ')).toBe('Your max energy grows by 10, for good!');
    // It outlasts a badge.
    const badge = playIn(testWorld, { ...boosted, dialogue: { pages: [['x']], page: 0, shown: 1 }, script: [{ badge: 'one' }] }, 'a');
    expect(badge.maxHp).toBe(35);
  });

  it('tests the level in a condition', () => {
    const state = started(testWorld);
    expect(holds({ level: 1 }, state)).toBe(true);
    expect(holds({ level: 3 }, state)).toBe(false);
    expect(holds({ level: 3 }, { ...state, level: 3 })).toBe(true);
    expect(holds({ level: 3, flag: 'x' }, { ...state, level: 5 })).toBe(false);
  });

  it('carries the darkness of a map from its text to the game', () => {
    const tiles = { '#': { sprite: 'iwall', solid: true }, '.': { sprite: 'floor', solid: false } };
    expect(parseMap({ id: 'a', name: 'A', ground: '.', rows: ['#.#'], objects: {}, dark: 1 }, tiles).dark).toBe(1);
    expect(parseMap({ id: 'a', name: 'A', ground: '.', rows: ['#.#'], objects: {} }, tiles).dark).toBeUndefined();
  });
});

describe('the settings of the Start menu', () => {
  const bag = () => playIn(testWorld, { ...started(testWorld), items: { coffee: 1, key: 1 } }, 'start');
  const settings = () => playIn(testWorld, bag(), 'right', 'right');

  it('is the third tab: left and right go round the tabs, and say which one it is', () => {
    const badges = press(testWorld, bag(), { pressed: 'right' });
    expect(badges.state.menu).toEqual({ tab: 'badges', cursor: 0 });
    expect(badges.events).toEqual([{ kind: 'menu', text: 'Badges' }]);
    const third = press(testWorld, badges.state, { pressed: 'right' });
    expect(third.state.menu).toEqual({ tab: 'settings', cursor: 0 });
    expect(third.events).toEqual([{ kind: 'menu', text: 'Settings. Sound, volume, screen and mode.' }]);
    expect(third.cues).toEqual(['cursor']);
    expect(press(testWorld, third.state, { pressed: 'right' }).state.menu).toEqual({ tab: 'items', cursor: 0 });
    expect(press(testWorld, bag(), { pressed: 'left' }).state.menu).toEqual({ tab: 'settings', cursor: 0 });
  });

  it('has four rows, sound, volume, screen and mode, and reads them out as the cursor moves', () => {
    expect(SETTINGS).toEqual(['sound', 'volume', 'screen', 'mode']);
    const volume = press(testWorld, settings(), { pressed: 'down' });
    expect(volume.state.menu).toEqual({ tab: 'settings', cursor: 1 });
    expect(volume.events).toEqual([{ kind: 'menu', text: 'Volume. Left and right change it.' }]);
    const screen = press(testWorld, volume.state, { pressed: 'down' });
    expect(screen.events).toEqual([{ kind: 'menu', text: 'Screen. A switches the LCD look.' }]);
    const mode = press(testWorld, screen.state, { pressed: 'down' });
    expect(mode.events).toEqual([{ kind: 'menu', text: 'Mode. A switches between Game Boy and Game Boy Color.' }]);
    // A on it asks for the other mode; whoever draws the screen switches it.
    expect(press(testWorld, mode.state, { a: true }).cues).toEqual(['mode']);
    expect(press(testWorld, mode.state, { pressed: 'down' }).state).toBe(mode.state);
    expect(press(testWorld, settings(), { pressed: 'up' }).state.menu).toEqual({ tab: 'settings', cursor: 0 });
  });

  it('asks for quieter and louder with left and right on the volume row, and leaves the tab alone', () => {
    const row = playIn(testWorld, settings(), 'down');
    const left = press(testWorld, row, { pressed: 'left' });
    expect(left.cues).toEqual(['quieter']);
    expect(left.state).toBe(row);
    const right = press(testWorld, row, { pressed: 'right' });
    expect(right.cues).toEqual(['louder']);
    expect(right.state.menu?.tab).toBe('settings');
    expect(press(testWorld, row, { a: true }).cues).toEqual([]);
  });

  it('asks for the sound switch and the screen switch with A, and switches tabs with left and right there', () => {
    const sound = press(testWorld, settings(), { a: true });
    expect(sound.cues).toEqual(['sound']);
    expect(sound.state.menu).toEqual({ tab: 'settings', cursor: 0 });
    const screen = press(testWorld, playIn(testWorld, settings(), 'down', 'down'), { a: true });
    expect(screen.cues).toEqual(['screen']);
    expect(press(testWorld, settings(), { pressed: 'right' }).state.menu?.tab).toBe('items');
    expect(press(testWorld, playIn(testWorld, settings(), 'down', 'down'), { pressed: 'left' }).state.menu?.tab).toBe('badges');
    // B and Start still close the menu from there.
    expect(press(testWorld, settings(), { b: true }).state.menu).toBeNull();
    expect(press(testWorld, settings(), { start: true }).state.menu).toBeNull();
  });

  it('no longer has a volume row under the bag: down stops at the last entry', () => {
    const last = playIn(testWorld, bag(), 'down');
    expect(last.menu).toEqual({ tab: 'items', cursor: 1 });
    expect(press(testWorld, last, { pressed: 'down' }).state).toBe(last);
    expect(press(testWorld, last, { pressed: 'left' }).cues).toEqual(['cursor']);
  });
});

describe('who looks where', () => {
  it('turns whoever is talked to towards the player, and back when the talk is over', () => {
    // The sign is above the cell to the right of the start: walk right, look up, talk.
    const before = playIn(testWorld, started(testWorld), 'right', 'up');
    expect(before.face).toBeNull();
    const talking = press(testWorld, before, { a: true }).state;
    expect(talking.dialogue).not.toBeNull();
    expect(talking.face).toEqual({ id: 'main:s', dir: 'down' });
    // Still turned on the second page.
    const second = press(testWorld, talking, { a: true }).state;
    expect(second.dialogue).not.toBeNull();
    expect(second.face).toEqual({ id: 'main:s', dir: 'down' });
    const over = press(testWorld, second, { a: true }).state;
    expect(over.dialogue).toBeNull();
    // Not at once: they keep looking for a moment, on the game clock, and then turn back.
    expect(over.face).toEqual({ id: 'main:s', dir: 'down', until: over.clock + FACE_TICKS });
    let state = over;
    for (let tick = 1; tick < FACE_TICKS; tick++) state = step(state, NO_INPUT, testWorld).state;
    expect(state.face?.id).toBe('main:s');
    state = step(state, NO_INPUT, testWorld).state;
    expect(state.face).toBeNull();
    expect(FACE_TICKS).toBeGreaterThanOrEqual(36);
    expect(FACE_TICKS).toBeLessThanOrEqual(60);
    // With reduced motion a press is ten ticks of the clock: a few presses later they have turned back too.
    let reduced = over;
    for (let i = 0; i < 5; i++) reduced = press(testWorld, reduced, { dir: 'left', pressed: 'left' }).state;
    expect(reduced.face).toBeNull();
  });

  it('turns them to whichever side the player stands on', () => {
    const base = started(testWorld);
    const sign = testWorld.maps.main!.objects.find((object) => object.id === 'main:s')!;
    const from = (dx: number, dy: number, dir: 'up' | 'down' | 'left' | 'right') =>
      press(testWorld, { ...base, x: sign.x + dx, y: sign.y + dy, dir }, { a: true }).state.face?.dir;
    expect(from(0, 1, 'up')).toBe('down');
    expect(from(-1, 0, 'right')).toBe('left');
    expect(from(1, 0, 'left')).toBe('right');
  });

  it('keeps them turned through a battle they start, and lets go after it', () => {
    const fightStart = playIn(testWorld, started(testWorld), 'down', 'down', 'right', 'a');
    expect(fightStart.face).toEqual({ id: 'main:n', dir: 'left' });
    const inBattle = press(testWorld, fightStart, { a: true }).state;
    expect(inBattle.battle).not.toBeNull();
    expect(inBattle.face?.id).toBe('main:n');
    let state = inBattle;
    for (let i = 0; i < 200 && (state.battle || state.dialogue); i++) state = press(testWorld, state, { a: true }).state;
    expect(state.face?.until).toBe(state.clock + FACE_TICKS);
    for (let tick = 0; tick < FACE_TICKS; tick++) state = step(state, NO_INPUT, testWorld).state;
    expect(state.face).toBeNull();
  });
});

describe('the sound of a way', () => {
  it('is a door by default, and what the way says otherwise', () => {
    const at = { ...started(testWorld), dialogue: { pages: [['x']], page: 0, shown: 1 } };
    const through = (cue?: Cue) => step({ ...at, script: [{ warp: { map: 'room', at: 'm', dy: -1 }, cue }] }, { ...NO_INPUT, a: true }, testWorld, { instant: true });
    expect(through().cues).toContain('door');
    expect(through('path').cues).toContain('path');
    expect(through('path').cues).not.toContain('door');
    expect(through('cave').cues).toContain('cave');
    expect(through('cave').state.map).toBe('room');
  });
});
