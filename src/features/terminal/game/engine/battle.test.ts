import { FAINT_TICKS, HIT_TICKS, SHAKE_TICKS, faintLook, hitLook, idleOffset, shakeOffset } from './battle.ts';
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

describe('a fighter that faints', () => {
  /** One tick with motion. */
  const tick = (state: GameState, a = false) => step(state, { ...NO_INPUT, a }, world);

  it('slides out of sight after the blow, with one sound for every enemy, and the win waits for it', () => {
    // At the menu with motion, the rat at 1 HP: FIGHT, HIT. The hit blinks; then the line of the win comes.
    const menu = wild();
    let state: GameState = { ...menu, battle: { ...menu.battle!, enemyHp: 1 } };
    state = tick(tick(state, true).state, true).state;
    expect(state.battle!.hit?.who).toBe('foe');
    for (let i = 0; i < 200 && state.battle!.hit; i++) state = tick(state).state;
    for (let i = 0; i < 100 && state.battle!.shown < state.battle!.steps[0]!.text.length; i++) state = tick(state).state;
    const fell = tick(state, true);
    expect(fell.state.battle!.steps[0]!.text).toBe(world.enemies.rat!.defeat);
    expect(fell.cues).toContain('fall');
    expect(fell.state.battle!.faint).toEqual({ who: 'foe', ticks: FAINT_TICKS });
    // While it slides, A waits: the coins and the XP come after it. The slide goes down a little every tick.
    state = fell.state;
    const drops: number[] = [];
    for (let i = 0; i < FAINT_TICKS; i++) {
      drops.push(faintLook(state.battle)!.dy);
      state = tick(state, true).state;
    }
    expect(state.battle!.steps[0]!.text).toBe(world.enemies.rat!.defeat);
    expect(drops[0]).toBe(0);
    for (let i = 1; i < drops.length; i++) expect(drops[i]!).toBeGreaterThanOrEqual(drops[i - 1]!);
    expect(drops.at(-1)!).toBeGreaterThanOrEqual(28);
    expect(state.battle!.faint).toBeUndefined();
    expect(state.battle!.fainted).toBe('foe');
    expect(faintLook(state.battle)).toBeNull();
    // Then A goes on as before: the rest of the line, then the coins.
    for (let i = 0; i < 100 && state.battle!.shown < state.battle!.steps[0]!.text.length; i++) state = tick(state).state;
    state = tick(state, true).state;
    expect(state.battle!.steps[0]!.text).not.toBe(world.enemies.rat!.defeat);
    expect(state.battle!.fainted).toBe('foe');
  });

  it('is gone at once with reduced motion, with the same sound; the player who runs out of energy slides away too', () => {
    const menu = wild();
    const quick = play({ ...menu, battle: { ...menu.battle!, enemyHp: 1 } }, 'a', 'a', 'a');
    expect(quick.battle!.steps[0]!.text).toBe(world.enemies.rat!.defeat);
    expect(quick.battle!.faint).toBeUndefined();
    expect(quick.battle!.fainted).toBe('foe');
    // The player, at 1 HP against an enemy that always hits: the line that ends it slides the trainer away.
    let state: GameState = { ...menu, hp: 1 };
    state = tick(tick(state, true).state, true).state;
    for (let i = 0; i < 400 && !state.battle!.faint && state.battle; i++) state = tick(state, i % 2 === 0).state;
    expect(state.battle!.faint?.who).toBe('you');
    expect(state.battle!.steps[0]!.text).toBe('You are out of energy...');
  });
});

describe('the cry of the enemy', () => {
  it('is heard when the enemy is on the screen: at the end of the way in, or at once with reduced motion', () => {
    const before = play(started(), 'down');
    // With motion: the way in first (its own sound), the cry on the tick the battle screen comes up.
    let result = step(before, { ...NO_INPUT, dir: 'right', pressed: 'right' }, world);
    for (let i = 0; i < 40 && result.state.walk; i++) result = step(result.state, NO_INPUT, world);
    expect(result.state.battle?.intro).toBeGreaterThan(0);
    expect(result.cues).not.toContain('cry:rat');
    const heard: string[] = [];
    let state = result.state;
    for (let i = 0; i < 200 && state.battle!.intro > 0; i++) {
      const next = step(state, NO_INPUT, world);
      heard.push(...next.cues);
      state = next.state;
    }
    expect(heard.filter((cue) => cue.startsWith('cry:'))).toEqual(['cry:rat']);
    // With reduced motion there is no way in: the cry comes with the line that it appeared.
    const instant = step(before, { ...NO_INPUT, dir: 'right', pressed: 'right' }, world, { instant: true });
    expect(instant.cues).toEqual(['encounter', 'cry:rat']);
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

describe('the shake of a hit on the player', () => {
  it('goes up and down a pixel or two in the first ticks of the hit, in a fixed order, and only for the player', () => {
    const menu = wild();
    const at = (who: 'foe' | 'you', ticks: number) => shakeOffset({ ...menu.battle!, hit: { who, ticks, from: 20, to: 12 } });
    const you = Array.from({ length: HIT_TICKS }, (_, i) => at('you', HIT_TICKS - i));
    expect(you.slice(0, SHAKE_TICKS).some((dy) => dy > 0)).toBe(true);
    expect(you.slice(0, SHAKE_TICKS).some((dy) => dy < 0)).toBe(true);
    expect(you.every((dy) => Math.abs(dy) <= 2)).toBe(true);
    expect(you.slice(SHAKE_TICKS).every((dy) => dy === 0)).toBe(true);
    // The same every time: it is a function of the tick alone.
    expect(Array.from({ length: HIT_TICKS }, (_, i) => at('you', HIT_TICKS - i))).toEqual(you);
    // Never for the enemy's hit, and nothing without a hit (as with reduced motion, which shows no hit).
    expect(Array.from({ length: HIT_TICKS }, (_, i) => at('foe', HIT_TICKS - i)).every((dy) => dy === 0)).toBe(true);
    expect(shakeOffset(menu.battle!)).toBe(0);
    const quick = play(menu, 'a', 'a', 'a');
    expect(quick.battle!.hit).toBeUndefined();
  });
});
