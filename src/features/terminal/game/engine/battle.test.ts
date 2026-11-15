import { initialGame, step } from './engine.ts';
import { play, testWorld as world } from './testWorld.ts';
import { NO_INPUT, type GameState } from './types.ts';

/** Standing left of the grass, right of the ogre's row. */
const started = (seed = 7) => play(initialGame(world, seed), 'a', 'a');
/** In a wild battle, at its menu. */
const wild = (seed = 7) => play(started(seed), 'down', 'right', 'a');
/** In the boss battle with the rat, at its menu. */
const bossFight = () => play(started(), 'down', 'down', 'right', 'a', 'a', 'a');

describe('battles', () => {
  it('starts a wild battle in tall grass and announces it', () => {
    const before = play(started(), 'down');
    const { state, events } = step(before, { ...NO_INPUT, dir: 'right', pressed: 'right' }, world, { instant: true });
    expect(state.battle).toMatchObject({ enemy: 'rat', enemyHp: 10, wild: true, phase: 'steps' });
    expect(events).toEqual([{ kind: 'battle', text: 'A wild RAT appeared!' }]);
    expect(play(state, 'a').battle?.phase).toBe('menu');
  });

  it('walks the cursor through the menu and goes back from the moves with B', () => {
    const menu = wild();
    expect(play(menu, 'down', 'down', 'down').battle?.cursor).toBe(2);
    expect(play(menu, 'up').battle?.cursor).toBe(0);
    const moves = play(menu, 'a');
    expect(moves.battle?.phase).toBe('moves');
    expect(play(moves, 'b').battle?.phase).toBe('menu');
  });

  it('plays a turn: the hit lands when its line shows, then the enemy answers', () => {
    const hit = play(wild(), 'a', 'a');
    expect(hit.battle?.steps).toHaveLength(2);
    expect(hit.battle?.steps[0]?.text).toMatch(/^You use HIT! RAT loses [567] HP\.$/);
    expect(hit.battle!.enemyHp).toBeLessThanOrEqual(5);
    expect(hit.hp).toBe(20);
    expect(hit.pp.hit).toBe(1);

    const answered = step(hit, { ...NO_INPUT, a: true }, world, { instant: true });
    expect(answered.events[0]?.text).toMatch(/^RAT uses NIBBLE! You lose [123] HP\.$/);
    expect(answered.state.hp).toBeLessThan(20);
    expect(play(answered.state, 'a').battle?.phase).toBe('menu');
  });

  it('is the same battle for the same seed', () => {
    expect(play(wild(3), 'a', 'a', 'a')).toEqual(play(wild(3), 'a', 'a', 'a'));
  });

  it('wins a wild battle with the default choice only', () => {
    let state = wild();
    for (let i = 0; i < 40 && state.battle; i++) state = play(state, 'a');
    expect(state.battle).toBeNull();
    expect(state.hp).toBeGreaterThan(0);
    expect(state).toMatchObject({ map: 'main', x: 3, y: 3 });
  });

  it('runs from a wild battle but not from a boss', () => {
    const ran = play(wild(), 'down', 'down', 'a');
    expect(ran.battle?.steps[0]?.text).toBe('You got away safely.');
    expect(play(ran, 'a').battle).toBeNull();

    const refused = play(bossFight(), 'down', 'down', 'a');
    expect(refused.battle?.steps[0]?.text).toBe('There is no running from RAT!');
    expect(play(refused, 'a').battle?.phase).toBe('menu');
  });

  it('runs what the boss was guarding once it is beaten: the badge and the key', () => {
    let state = bossFight();
    expect(state.battle).toMatchObject({ wild: false, phase: 'menu' });
    const events = [];
    for (let i = 0; i < 60 && (state.battle || state.dialogue); i++) {
      const result = step(state, { ...NO_INPUT, a: true }, world, { instant: true });
      state = result.state;
      events.push(...result.events);
    }
    expect(state.flags.beat).toBe(true);
    expect(state.badges).toEqual(['one']);
    expect(state.items.key).toBe(1);
    expect(state).toMatchObject({ maxHp: 25, hp: 25, pp: { hit: 2, nap: 1 } });
    expect(events.map((event) => event.kind)).toEqual(expect.arrayContaining(['battle', 'badge', 'item']));
    expect(events.find((event) => event.kind === 'badge')?.text).toMatch(/FIRST BADGE.*1 of 1/);
  });

  it('says so when a move has no PP left, and falls back to a weak move when nothing has', () => {
    const empty = { ...wild(), pp: { hit: 0, nap: 1 } };
    const refused = play(empty, 'a', 'a');
    expect(refused.battle?.steps[0]?.text).toBe('No PP left for HIT.');
    expect(refused.battle?.enemyHp).toBe(10);

    const dry = play({ ...wild(), pp: { hit: 0, nap: 0 } }, 'a');
    expect(dry.battle?.steps[0]?.text).toMatch(/^You use FLAIL! RAT loses [234] HP\.$/);
  });

  it('keeps an item when the player is already at full energy, and the enemy does not get a free turn', () => {
    const full: GameState = { ...wild(), items: { coffee: 1 } };
    const refused = play(full, 'down', 'a', 'a');
    expect(refused.items.coffee).toBe(1);
    expect(refused.hp).toBe(full.hp);
    expect(refused.battle?.enemyHp).toBe(full.battle!.enemyHp);
    expect(refused.battle?.steps).toEqual([{ text: 'You are full of energy already.' }]);
    expect(play(refused, 'a').battle?.phase).toBe('menu');
  });

  it('heals with a move and with an item', () => {
    const hurt: GameState = { ...wild(), hp: 5, items: { coffee: 1 } };
    const napped = play(hurt, 'a', 'down', 'a');
    expect(napped.hp).toBe(15);
    expect(napped.pp.nap).toBe(0);

    const drank = play(hurt, 'down', 'a', 'a');
    expect(drank.hp).toBe(20);
    expect(drank.items.coffee).toBe(0);

    const nothing = play({ ...wild(), items: {} }, 'down', 'a');
    expect(nothing.battle?.steps[0]?.text).toBe('You have nothing to use.');
  });

  it('sends a beaten player back to the last coffee stop, rested, with nothing lost', () => {
    const rested = play(started(), 'right', 'right', 'up', 'right', 'a', 'a');
    expect(rested.heal).toEqual({ map: 'main', x: 4, y: 1 });
    const carrying = { ...rested, items: { key: 1 }, flags: { opened: true as const } };
    let state = play(carrying, 'down', 'left', 'left', 'down', 'down', 'left', 'a');
    expect(state.battle?.enemy).toBe('ogre');
    const events = [];
    for (let i = 0; i < 20 && state.battle; i++) {
      const result = step(state, { ...NO_INPUT, a: true }, world, { instant: true });
      state = result.state;
      events.push(...result.events);
    }
    expect(events).toContainEqual({ kind: 'defeat', text: 'Defeated. Back to the last coffee stop.' });
    expect(state).toMatchObject({ map: 'main', x: 4, y: 1, hp: 20, items: { key: 1 }, flags: { opened: true }, finished: false });
    expect(state.dialogue?.pages[0]?.join(' ')).toMatch(/You wake up/);
    expect(play(state, 'a', 'a', 'down')).toMatchObject({ x: 4, y: 2, dialogue: null });
  });
});
