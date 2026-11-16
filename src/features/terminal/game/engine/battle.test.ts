import { HIT_TICKS, hitLook, idleOffset } from './battle.ts';
import { initialGame, step } from './engine.ts';
import { play, testWorld as world } from './testWorld.ts';
import { NO_INPUT, type GameState } from './types.ts';

/** Standing left of the grass, right of the ogre's row. */
const started = (seed = 7) => play(initialGame(world, seed), 'a', 'a');
/** In a wild battle, at its menu. */
const wild = (seed = 7) => play(started(seed), 'down', 'right', 'a');
/** In the boss battle with the rat, at its menu. */
const bossFight = () => play(started(), 'down', 'down', 'right', 'a', 'a', 'a');

describe('a hit in a battle, with motion', () => {
  /** One tick with motion, A held or not. */
  const tick = (state: GameState, a = false) => step(state, { ...NO_INPUT, a }, world).state;

  it('blinks the one that is hit with a spark, then drains the bar; A waits for it; a miss shows nothing', () => {
    // At the menu with motion: FIGHT, HIT. The first line is the hit, revealed with its cue.
    const menu = wild();
    const moves = tick(menu, true);
    const hitting = tick(moves, true);
    const hit = hitting.battle!.hit!;
    expect(hit).toMatchObject({ who: 'foe', ticks: HIT_TICKS, from: 10, to: hitting.battle!.enemyHp });
    const looks: ReturnType<typeof hitLook>[] = [];
    let state = hitting;
    for (let i = 0; i < HIT_TICKS && state.battle?.hit; i++) {
      looks.push(hitLook(state.battle));
      // A is pressed all along: it does not cut the blink short.
      state = tick(state, true);
    }
    expect(looks).toHaveLength(HIT_TICKS);
    expect(state.battle!.hit).toBeUndefined();
    expect(state.battle!.steps[0]!.text).toMatch(/^You use HIT!/);
    // Hidden twice, each time for BLINK_TICKS: two blinks, under three a second (60 ticks).
    const hidden = looks.map((look, i) => (!look!.visible && (i === 0 || looks[i - 1]!.visible) ? i : -1)).filter((i) => i >= 0);
    expect(hidden).toHaveLength(2);
    expect(hidden[1]! - hidden[0]!).toBeGreaterThanOrEqual(20);
    // The spark at the start only; the bar stands at the old energy through the blinks, then drains to the new.
    expect(looks[0]!.spark).toBe(true);
    expect(looks.at(-1)!.spark).toBe(false);
    expect(looks[hidden[1]!]!.hp).toBe(10);
    expect(looks.at(-1)!.hp).toBeLessThanOrEqual(hit.to + 1);
    for (let i = 1; i < looks.length; i++) expect(looks[i]!.hp).toBeLessThanOrEqual(looks[i - 1]!.hp);
    // With reduced motion there is none of it: just the change of the bar.
    expect(play(wild(), 'a', 'a').battle!.hit).toBeUndefined();
    expect(hitLook(null)).toBeNull();
  });
});

describe('the fighters breathe, with motion', () => {
  const tick = (state: GameState) => step(state, NO_INPUT, world).state;
  const run = (state: GameState, ticks: number) => {
    const seen: GameState[] = [];
    let current = state;
    for (let i = 0; i < ticks; i++) {
      current = tick(current);
      seen.push(current);
    }
    return seen;
  };

  it('bobs the trainer and a wild enemy a pixel, out of step, and sways a boss; never fast, never during a hit', () => {
    const states = run(wild(), 160);
    const you = states.map((state) => idleOffset(state.battle!, 'you'));
    const foe = states.map((state) => idleOffset(state.battle!, 'foe'));
    for (const offset of [...you, ...foe]) {
      expect(offset.dx).toBe(0);
      expect([0, 1]).toContain(offset.dy);
    }
    // Both move, and not together.
    expect(new Set(you.map((offset) => offset.dy)).size).toBe(2);
    expect(you.some((offset, i) => offset.dy !== foe[i]!.dy)).toBe(true);
    // Slowly: each pose is held for at least half a second (30 ticks) before it changes.
    const changes = you.flatMap((offset, i) => (i > 0 && offset.dy !== you[i - 1]!.dy ? [i] : []));
    for (let i = 1; i < changes.length; i++) expect(changes[i]! - changes[i - 1]!).toBeGreaterThanOrEqual(30);
    // A boss sways sideways by one or two pixels.
    const boss = run(bossFight(), 200).map((state) => idleOffset(state.battle!, 'foe'));
    expect(new Set(boss.map((offset) => offset.dx))).toEqual(new Set([-1, 0, 1]));
    for (const offset of boss) expect(offset.dy).toBe(0);
    // Still during a hit, and with reduced motion (one key is one whole move): no breathing at all.
    const hit = { ...states[50]!, battle: { ...states[50]!.battle!, hit: { who: 'foe' as const, ticks: 30, from: 10, to: 5 } } };
    expect(idleOffset(hit.battle, 'you')).toEqual({ dx: 0, dy: 0 });
    expect(idleOffset(hit.battle, 'foe')).toEqual({ dx: 0, dy: 0 });
    const still = step(wild(), NO_INPUT, world, { instant: true }).state;
    expect(idleOffset(still.battle!, 'you')).toEqual({ dx: 0, dy: 0 });
  });
});

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

  it('sends a beaten player back to the last place rested at, rested, with nothing lost', () => {
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
    expect(events).toContainEqual({ kind: 'defeat', text: `Defeated. You wake up in the ${world.maps.main!.name}.` });
    expect(state).toMatchObject({ map: 'main', x: 4, y: 1, hp: 20, items: { key: 1 }, flags: { opened: true }, finished: false });
    expect(state.dialogue?.pages[0]?.join(' ')).toMatch(/You come to in the .*Nothing was lost/);
    expect(play(state, 'a', 'down')).toMatchObject({ x: 4, y: 2, dialogue: null });
  });
});
