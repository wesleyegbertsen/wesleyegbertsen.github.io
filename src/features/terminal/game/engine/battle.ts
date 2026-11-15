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

/** Applies the line that is now on top. */
function reveal(state: GameState, ctx: Ctx): GameState {
  const battle = state.battle!;
  const step = battle.steps[0]!;
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
      enemyHp: step.enemyHp ?? battle.enemyHp,
      cheer: battle.cheer || !!step.cheer,
      shown: ctx.instant ? step.text.length : 0,
    },
  };
}

/** `level`: the level a wild enemy shows up at; never under its own. A boss is always at its own level. */
export function startBattle(state: GameState, enemyId: string, win: Action[], wild: boolean, ctx: Ctx, level = 0): GameState {
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
    intro: ctx.instant ? 0 : introTicks(wild),
    phase: 'steps',
    steps: [],
    shown: 0,
    cursor: 0,
    outcome: null,
    win,
  };
  const intro = wild ? `A wild ${enemy.name} appeared!` : `${enemy.name} wants to battle!`;
  // The line is told (and its sound asked for) at once; on the screen it waits for the transition.
  return show({ ...state, walk: null, menu: null }, battle, [{ text: intro, cue: wild ? 'encounter' : 'showdown' }], ctx);
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

/** The battle is over: back to the map. A defeat only costs the walk back from the last coffee stop. */
function finish(state: GameState, ctx: Ctx): GameState {
  const battle = state.battle!;
  if (battle.outcome === 'win') return { ...state, battle: null, script: [...battle.win, ...state.script] };
  if (battle.outcome === 'lose') {
    ctx.events.push({ kind: 'defeat', text: 'Defeated. Back to the last coffee stop.' });
    // The map may have a place of its own to wake up in (the town: its cafe); else it is the last place rested at.
    const back = home(ctx.world, state.map) ?? state.heal;
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
      script: [{ say: ['You wake up at the last coffee stop, fully rested. Nothing was lost. Try again!'] }],
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
export function stepBattle(state: GameState, input: Input, ctx: Ctx): GameState {
  const { world } = ctx;
  const battle = state.battle!;
  const enemy = world.enemies[battle.enemy]!;
  const press = input.a || input.b;

  // The way in: the transition plays over the map, tick by tick. A press does not skip it, and nothing else moves.
  if (battle.intro > 0) return { ...state, battle: { ...battle, intro: ctx.instant ? 0 : battle.intro - 1 } };

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
