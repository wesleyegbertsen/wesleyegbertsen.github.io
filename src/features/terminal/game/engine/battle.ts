import { applyItem, usableItems } from './items.ts';
import { attackBonus, enemyHpAt, levelFor, maxHpOf, xpFor } from './level.ts';
import { random } from './rng.ts';
import { coinsFor, money } from './shop.ts';
import { fold } from './text.ts';
import { introTicks } from './transition.ts';
import { putBack } from './push.ts';
import { home } from './world.ts';
import type { Action, Battle, BattleStep, Cue, GameEvent, GameState, Input, MoveDef, World } from './types.ts';

/** The battle menu, in order. The first entry is the default. */
export const BATTLE_MENU = ['FIGHT', 'ITEM', 'RUN'] as const;

/** The least and the most a move can do: power - 1 to power + 1. The balance test relies on these. */
export const minDamage = (move: MoveDef) => Math.max(1, move.power - 1);
export const maxDamage = (move: MoveDef) => Math.max(1, move.power + 1);

export { usableItems };

export const fullPp = (world: World, moves: readonly string[] = world.playerMoves): Record<string, number> =>
  Object.fromEntries(moves.map((id) => [id, world.moves[id]!.pp]));

type Ctx = { world: World; events: GameEvent[]; cues: Cue[]; instant: boolean };

/** At or under this share of the energy the low-energy beep sounds. */
const LOW = 0.25;
const BLIP_EVERY = 3;

/** Shows a list of lines one by one. The first one appears (and takes effect) at once. */
function show(state: GameState, battle: Battle, steps: BattleStep[], ctx: Ctx): GameState {
  const folded = steps.map((step) => ({ ...step, text: fold(step.text) }));
  return reveal({ ...state, battle: { ...battle, phase: 'steps', steps: folded, cursor: 0 } }, ctx);
}

/** How long one blink of a hit lasts, half dark and half shown: two blinks take 0.8 s, under three a second. */
export const BLINK_TICKS = 12;
/** How long the bar takes to drain once the blinking is over. */
export const DRAIN_TICKS = 20;
/** A whole hit: two blinks (the first with a spark), then the bar drains. */
export const HIT_TICKS = 4 * BLINK_TICKS + DRAIN_TICKS;

/**
 * How a hit looks at this moment: whether the one hit is shown or blinked away, whether the spark is on it (the
 * first blink), and the energy its bar shows: the old one while it blinks, then draining to the new one. Null
 * when no hit is being shown.
 */
export function hitLook(battle: Battle | null | undefined): { who: 'foe' | 'you'; visible: boolean; spark: boolean; hp: number } | null {
  const hit = battle?.hit;
  if (!hit) return null;
  const at = HIT_TICKS - hit.ticks;
  const blinking = at < 4 * BLINK_TICKS;
  const drained = blinking ? 0 : Math.min(1, (at - 4 * BLINK_TICKS + 1) / DRAIN_TICKS);
  return { who: hit.who, visible: !blinking || Math.floor(at / BLINK_TICKS) % 2 === 0, spark: at < BLINK_TICKS, hp: Math.round(hit.from + (hit.to - hit.from) * drained) };
}

/** How long one pose of the breathing lasts: 0.6 s. */
export const BREATH_TICKS = 36;

/**
 * Where a fighter stands now, a pixel or two from its place: the trainer and a wild enemy bob a pixel up every
 * other BREATH_TICKS, half a breath apart; a boss sways around its place, 0, 1, 0, -1 pixels. Still on the way in, during a
 * hit, and with reduced motion (the battle clock `t` only runs with motion).
 */
export function idleOffset(battle: Battle, who: 'foe' | 'you'): { dx: number; dy: number } {
  const t = battle.t ?? 0;
  if (!t || battle.hit || battle.intro > 0) return { dx: 0, dy: 0 };
  if (who === 'foe' && !battle.wild) return { dx: [0, 1, 0, -1][Math.floor(t / BREATH_TICKS) % 4]!, dy: 0 };
  const shift = who === 'foe' ? BREATH_TICKS / 2 : 0;
  return { dx: 0, dy: Math.floor((t + shift) / BREATH_TICKS) % 2 };
}

/** Applies the line that is now on top. */
function reveal(state: GameState, ctx: Ctx): GameState {
  const battle = state.battle!;
  const step = battle.steps[0]!;
  // A hit or a hurt, with motion: the one hit blinks, with a spark, and its bar drains after (hitLook).
  const hit =
    !ctx.instant && step.cue === 'hit' && step.enemyHp !== undefined
      ? { who: 'foe' as const, ticks: HIT_TICKS, from: battle.enemyHp, to: step.enemyHp }
      : !ctx.instant && step.cue === 'hurt' && step.hp !== undefined
        ? { who: 'you' as const, ticks: HIT_TICKS, from: state.hp, to: step.hp }
        : undefined;
  ctx.events.push({ kind: 'battle', text: step.text });
  if (step.cue) ctx.cues.push(step.cue);
  if (step.cue === 'hurt' && step.hp !== undefined && step.hp > 0 && step.hp <= state.maxHp * LOW) ctx.cues.push('low');
  // A new level: the max energy grows, and the energy with it.
  const level = step.level ?? state.level;
  const maxHp = step.level === undefined ? state.maxHp : maxHpOf(ctx.world, { ...state, level });
  return {
    ...state,
    hp: (step.hp ?? state.hp) + (maxHp - state.maxHp),
    maxHp,
    level,
    xp: step.xp ?? state.xp,
    coins: step.coins ?? state.coins,
    battle: {
      ...battle,
      hit,
      enemyHp: step.enemyHp ?? battle.enemyHp,
      cheer: battle.cheer || !!step.cheer,
      shown: ctx.instant ? step.text.length : 0,
    },
  };
}

/**
 * `level`: the level a wild enemy shows up at; never under its own. A boss is always at its own level. `quick`: a
 * boss that follows another one at once, with the short way in.
 */
export function startBattle(state: GameState, enemyId: string, win: Action[], wild: boolean, ctx: Ctx, level = 0, quick = false): GameState {
  const enemy = ctx.world.enemies[enemyId];
  if (!enemy) throw new Error(`No enemy '${enemyId}'`);
  const at = Math.max(enemy.level, level);
  const enemyMax = enemyHpAt(enemy, at, ctx.world);
  const battle: Battle = {
    enemy: enemyId,
    level: at,
    enemyMax,
    cheer: false,
    enemyHp: enemyMax,
    wild,
    // With reduced motion there is no transition: the battle screen is there at once.
    intro: ctx.instant ? 0 : introTicks(wild, quick),
    ...(quick && !wild ? { quick: true as const } : {}),
    phase: 'steps',
    steps: [],
    shown: 0,
    cursor: 0,
    outcome: null,
    win,
  };
  const intro = wild ? `A wild ${enemy.name} appeared!` : `${enemy.name} wants to battle!`;
  // The line is told (and its sound asked for) at once; on the screen it waits for the transition.
  return show({ ...state, walk: null, menu: null }, battle, [{ text: intro, cue: wild ? 'encounter' : quick ? 'round' : 'showdown' }], ctx);
}

type Choice = { move: MoveDef; id?: string } | { item: string };

/** One whole turn: the player's choice, then the enemy's answer, as lines to show. */
function turn(state: GameState, choice: Choice, ctx: Ctx): GameState {
  const { world } = ctx;
  const battle = state.battle!;
  const enemy = world.enemies[battle.enemy]!;
  const steps: BattleStep[] = [];
  let { seed } = state;
  const roll = () => {
    const next = random(seed);
    seed = next.seed;
    return next.value;
  };
  const damage = (move: MoveDef) => Math.max(1, move.power - 1 + Math.floor(roll() * 3));

  let hp = state.hp;
  let enemyHp = battle.enemyHp;
  let { pp, items } = state;

  if ('item' in choice) {
    // The caller has checked that it can be used: the same rules as the bag.
    const used = applyItem(state, choice.item, world);
    if (used?.ok) {
      ({ hp, pp, items } = used.state);
      steps.push({ text: used.text, hp, cue: used.cue });
    }
  } else {
    const { move, id } = choice;
    if (id) pp = { ...pp, [id]: pp[id]! - 1 };
    if (move.heal !== undefined) {
      hp = Math.min(state.maxHp, hp + move.heal);
      steps.push({ text: `You take a ${move.name}. Energy restored!`, hp, cue: 'heal' });
    } else if (roll() < move.accuracy) {
      const dealt = damage(move) + attackBonus(state.level, world);
      enemyHp = Math.max(0, enemyHp - dealt);
      steps.push({ text: `You use ${move.name}! ${enemy.name} loses ${dealt} HP.`, enemyHp, cue: 'hit' });
    } else {
      steps.push({ text: `You use ${move.name}... but it fails!`, cue: 'miss' });
    }
  }

  let outcome: Battle['outcome'] = null;
  let { win } = battle;
  if (enemyHp <= 0) {
    steps.push({ text: enemy.defeat, cheer: true });
    outcome = 'win';
    // It drops coins: a few for a wild one, far more for one that stood guard.
    const drop = coinsFor(battle.level, battle.wild, world);
    if (drop > 0) steps.push({ text: `You pick up ${money(drop, world)}.`, coins: state.coins + drop, cue: 'coin' });
    // The win is worth XP, and enough XP is a level: more energy, stronger attacks, now and then a new move.
    if (state.level < world.levels.max) {
      const gain = xpFor(battle.level, battle.wild, world);
      const xp = state.xp + gain;
      steps.push({ text: `You gain ${gain} XP.`, xp });
      const reached = levelFor(xp, world);
      const learns: Action[] = [];
      for (let level = state.level + 1; level <= reached; level++) {
        steps.push({ text: `You grew to Lv ${level}! More energy, stronger moves.`, level, cue: 'levelup' });
        const move = world.learn[level];
        if (move) learns.push({ learn: move });
      }
      win = [...learns, ...win];
    }
  } else {
    const move = enemy.moves[Math.floor(roll() * enemy.moves.length)]!;
    if (roll() < move.accuracy) {
      const dealt = damage(move);
      hp = Math.max(0, hp - dealt);
      steps.push({ text: `${enemy.name} uses ${move.name}! You lose ${dealt} HP.`, hp, cue: 'hurt' });
    } else {
      steps.push({ text: `${enemy.name} uses ${move.name}, but misses!`, cue: 'miss' });
    }
    if (hp <= 0) {
      steps.push({ text: 'You are out of energy...', cue: 'faint' });
      outcome = 'lose';
    }
  }

  return show({ ...state, seed, pp, items }, { ...battle, outcome, win }, steps, ctx);
}

/** The battle is over: back to the map. A defeat only costs the walk back from where the player wakes up. */
function finish(state: GameState, ctx: Ctx): GameState {
  const battle = state.battle!;
  if (battle.outcome === 'win') return { ...state, battle: null, script: [...battle.win, ...state.script] };
  if (battle.outcome === 'lose') {
    // The world may have one place to wake up in (the cafe); else it is the last place rested at.
    const back = home(ctx.world) ?? state.heal;
    const where = ctx.world.maps[back.map]!.name;
    ctx.events.push({ kind: 'defeat', text: `Defeated. You wake up in the ${where}.` });
    return {
      ...state,
      // Like any other way of arriving somewhere: what was pushed about there is back in its place.
      roam: putBack(state, ctx.world, back.map, back),
      battle: null,
      ...back,
      heal: back,
      walk: null,
      hp: state.maxHp,
      pp: fullPp(ctx.world, state.moves),
      script: [{ say: [`You come to in the ${where}, rested. Nothing was lost.`] }],
    };
  }
  return { ...state, battle: null };
}

/** The cursor after this input; a move that changes it ticks. */
function move(cursor: number, input: Input, count: number, ctx: Ctx): number {
  const next = input.pressed === 'up' ? Math.max(0, cursor - 1) : input.pressed === 'down' ? Math.min(count - 1, cursor + 1) : cursor;
  if (next !== cursor) ctx.cues.push('cursor');
  return next;
}

/** One tick of a battle. When it returns a state without a battle, the engine carries on with the script. */
export function stepBattle(state: GameState, input: Input, ctx: Ctx & { ticked?: true }): GameState {
  const { world } = ctx;
  const battle = state.battle!;
  const enemy = world.enemies[battle.enemy]!;
  const press = input.a || input.b;

  // The way in: the transition plays over the map, tick by tick. A press does not skip it, and nothing else moves.
  if (battle.intro > 0) return { ...state, battle: { ...battle, intro: ctx.instant ? 0 : battle.intro - 1 } };
  if (!ctx.instant && !battle.hit && !ctx.ticked) return stepBattle({ ...state, battle: { ...battle, t: (battle.t ?? 0) + 1 } }, input, { ...ctx, ticked: true });

  // A hit is being shown: it plays out, the line types on, and a press waits for it.
  if (battle.hit) {
    const ticks = battle.hit.ticks - 1;
    const length = battle.steps[0]?.text.length ?? 0;
    return { ...state, battle: { ...battle, hit: ticks > 0 ? { ...battle.hit, ticks } : undefined, shown: Math.min(length, battle.shown + 1) } };
  }

  if (battle.phase === 'steps') {
    const length = battle.steps[0]?.text.length ?? 0;
    if (!press) {
      if (battle.shown >= length) return state;
      if (battle.shown % BLIP_EVERY === 0) ctx.cues.push('blip');
      return { ...state, battle: { ...battle, shown: battle.shown + 1 } };
    }
    if (battle.shown < length) return { ...state, battle: { ...battle, shown: length } };
    const rest = battle.steps.slice(1);
    if (rest.length > 0) return reveal({ ...state, battle: { ...battle, steps: rest } }, ctx);
    if (battle.outcome) return finish(state, ctx);
    return { ...state, battle: { ...battle, phase: 'menu', steps: [], cursor: 0 } };
  }

  if (battle.phase === 'menu') {
    if (!input.a) {
      const cursor = move(battle.cursor, input, BATTLE_MENU.length, ctx);
      return cursor === battle.cursor ? state : { ...state, battle: { ...battle, cursor } };
    }
    const picked = BATTLE_MENU[battle.cursor];
    ctx.cues.push('confirm');
    if (picked === 'FIGHT') {
      // Out of PP everywhere: the fallback move, so the battle can always be finished.
      if (state.moves.every((id) => !(state.pp[id]! > 0))) return turn(state, { move: world.fallbackMove }, ctx);
      return { ...state, battle: { ...battle, phase: 'moves', cursor: 0 } };
    }
    if (picked === 'ITEM') {
      if (usableItems(state, world).length === 0) return show(state, battle, [{ text: 'You have nothing to use.' }], ctx);
      return { ...state, battle: { ...battle, phase: 'items', cursor: 0 } };
    }
    if (!battle.wild) return show(state, battle, [{ text: `There is no running from ${enemy.name}!` }], ctx);
    return show(state, { ...battle, outcome: 'run' }, [{ text: 'You got away safely.', cue: 'run' }], ctx);
  }

  if (input.b) {
    ctx.cues.push('cancel');
    return { ...state, battle: { ...battle, phase: 'menu', cursor: 0 } };
  }

  if (battle.phase === 'moves') {
    if (!input.a) {
      const cursor = move(battle.cursor, input, state.moves.length, ctx);
      return cursor === battle.cursor ? state : { ...state, battle: { ...battle, cursor } };
    }
    const id = state.moves[battle.cursor]!;
    const picked = world.moves[id]!;
    if (!(state.pp[id]! > 0)) return show(state, battle, [{ text: `No PP left for ${picked.name}.` }], ctx);
    return turn(state, { move: picked, id }, ctx);
  }

  const items = usableItems(state, world);
  if (!input.a) {
    const cursor = move(battle.cursor, input, items.length, ctx);
    return cursor === battle.cursor ? state : { ...state, battle: { ...battle, cursor } };
  }
  const item = items[Math.min(battle.cursor, items.length - 1)];
  if (!item) return { ...state, battle: { ...battle, phase: 'menu', cursor: 0 } };
  // The same refusal as the bag menu: nothing is used up, and the enemy does not get a free turn.
  const use = applyItem(state, item, world);
  if (use && !use.ok) return show(state, battle, [{ text: use.text }], ctx);
  return turn(state, { item }, ctx);
}
