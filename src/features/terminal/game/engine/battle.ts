import { random } from './rng.ts';
import { fold } from './text.ts';
import type { Action, Battle, BattleStep, GameEvent, GameState, Input, MoveDef, World } from './types.ts';

/** The battle menu, in order. The first entry is the default. */
export const BATTLE_MENU = ['FIGHT', 'ITEM', 'RUN'] as const;

/** The least and the most a move can do: power - 1 to power + 1. The balance test relies on these. */
export const minDamage = (move: MoveDef) => Math.max(1, move.power - 1);
export const maxDamage = (move: MoveDef) => Math.max(1, move.power + 1);

/** The items that can be used in a battle: the ones that heal and that the player carries. */
export function usableItems(state: GameState, world: World): string[] {
  return Object.keys(world.items).filter((id) => world.items[id]!.heal !== undefined && state.items[id]! > 0);
}

export const fullPp = (world: World): Record<string, number> =>
  Object.fromEntries(world.playerMoves.map((id) => [id, world.moves[id]!.pp]));

type Ctx = { world: World; events: GameEvent[]; instant: boolean };

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
  return {
    ...state,
    hp: step.hp ?? state.hp,
    battle: { ...battle, enemyHp: step.enemyHp ?? battle.enemyHp, shown: ctx.instant ? step.text.length : 0 },
  };
}

export function startBattle(state: GameState, enemyId: string, win: Action[], wild: boolean, ctx: Ctx): GameState {
  const enemy = ctx.world.enemies[enemyId];
  if (!enemy) throw new Error(`No enemy '${enemyId}'`);
  const battle: Battle = {
    enemy: enemyId,
    enemyHp: enemy.hp,
    wild,
    phase: 'steps',
    steps: [],
    shown: 0,
    cursor: 0,
    outcome: null,
    win,
  };
  const intro = wild ? `A wild ${enemy.name} appeared!` : `${enemy.name} wants to battle!`;
  return show({ ...state, walk: null, menu: null }, battle, [{ text: intro }], ctx);
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
    const item = world.items[choice.item]!;
    items = { ...items, [choice.item]: items[choice.item]! - 1 };
    hp = Math.min(state.maxHp, hp + (item.heal ?? 0));
    steps.push({ text: `You use the ${item.name}. Energy restored!`, hp });
  } else {
    const { move, id } = choice;
    if (id) pp = { ...pp, [id]: pp[id]! - 1 };
    if (move.heal !== undefined) {
      hp = Math.min(state.maxHp, hp + move.heal);
      steps.push({ text: `You take a ${move.name}. Energy restored!`, hp });
    } else if (roll() < move.accuracy) {
      const dealt = damage(move);
      enemyHp = Math.max(0, enemyHp - dealt);
      steps.push({ text: `You use ${move.name}! ${enemy.name} loses ${dealt} HP.`, enemyHp });
    } else {
      steps.push({ text: `You use ${move.name}... but it fails!` });
    }
  }

  let outcome: Battle['outcome'] = null;
  if (enemyHp <= 0) {
    steps.push({ text: enemy.defeat });
    outcome = 'win';
  } else {
    const move = enemy.moves[Math.floor(roll() * enemy.moves.length)]!;
    if (roll() < move.accuracy) {
      const dealt = damage(move);
      hp = Math.max(0, hp - dealt);
      steps.push({ text: `${enemy.name} uses ${move.name}! You lose ${dealt} HP.`, hp });
    } else {
      steps.push({ text: `${enemy.name} uses ${move.name}, but misses!` });
    }
    if (hp <= 0) {
      steps.push({ text: 'You are out of energy...' });
      outcome = 'lose';
    }
  }

  return show({ ...state, seed, pp, items }, { ...battle, outcome }, steps, ctx);
}

/** The battle is over: back to the map. A defeat only costs the walk back from the last coffee stop. */
function finish(state: GameState, ctx: Ctx): GameState {
  const battle = state.battle!;
  if (battle.outcome === 'win') return { ...state, battle: null, script: [...battle.win, ...state.script] };
  if (battle.outcome === 'lose') {
    ctx.events.push({ kind: 'defeat', text: 'Defeated. Back to the last coffee stop.' });
    return {
      ...state,
      battle: null,
      ...state.heal,
      walk: null,
      hp: state.maxHp,
      pp: fullPp(ctx.world),
      script: [{ say: ['You wake up at the last coffee stop, fully rested. Nothing was lost. Try again!'] }],
    };
  }
  return { ...state, battle: null };
}

const move = (cursor: number, input: Input, count: number) =>
  input.pressed === 'up' ? Math.max(0, cursor - 1) : input.pressed === 'down' ? Math.min(count - 1, cursor + 1) : cursor;

/** One tick of a battle. When it returns a state without a battle, the engine carries on with the script. */
export function stepBattle(state: GameState, input: Input, ctx: Ctx): GameState {
  const { world } = ctx;
  const battle = state.battle!;
  const enemy = world.enemies[battle.enemy]!;
  const press = input.a || input.b;

  if (battle.phase === 'steps') {
    const length = battle.steps[0]?.text.length ?? 0;
    if (!press) return battle.shown < length ? { ...state, battle: { ...battle, shown: battle.shown + 1 } } : state;
    if (battle.shown < length) return { ...state, battle: { ...battle, shown: length } };
    const rest = battle.steps.slice(1);
    if (rest.length > 0) return reveal({ ...state, battle: { ...battle, steps: rest } }, ctx);
    if (battle.outcome) return finish(state, ctx);
    return { ...state, battle: { ...battle, phase: 'menu', steps: [], cursor: 0 } };
  }

  if (battle.phase === 'menu') {
    if (!input.a) {
      const cursor = move(battle.cursor, input, BATTLE_MENU.length);
      return cursor === battle.cursor ? state : { ...state, battle: { ...battle, cursor } };
    }
    const picked = BATTLE_MENU[battle.cursor];
    if (picked === 'FIGHT') {
      // Out of PP everywhere: the fallback move, so the battle can always be finished.
      if (world.playerMoves.every((id) => !(state.pp[id]! > 0))) return turn(state, { move: world.fallbackMove }, ctx);
      return { ...state, battle: { ...battle, phase: 'moves', cursor: 0 } };
    }
    if (picked === 'ITEM') {
      if (usableItems(state, world).length === 0) return show(state, battle, [{ text: 'You have nothing to use.' }], ctx);
      return { ...state, battle: { ...battle, phase: 'items', cursor: 0 } };
    }
    if (!battle.wild) return show(state, battle, [{ text: `There is no running from ${enemy.name}!` }], ctx);
    return show(state, { ...battle, outcome: 'run' }, [{ text: 'You got away safely.' }], ctx);
  }

  if (input.b) return { ...state, battle: { ...battle, phase: 'menu', cursor: 0 } };

  if (battle.phase === 'moves') {
    if (!input.a) {
      const cursor = move(battle.cursor, input, world.playerMoves.length);
      return cursor === battle.cursor ? state : { ...state, battle: { ...battle, cursor } };
    }
    const id = world.playerMoves[battle.cursor]!;
    const picked = world.moves[id]!;
    if (!(state.pp[id]! > 0)) return show(state, battle, [{ text: `No PP left for ${picked.name}.` }], ctx);
    return turn(state, { move: picked, id }, ctx);
  }

  const items = usableItems(state, world);
  if (!input.a) {
    const cursor = move(battle.cursor, input, items.length);
    return cursor === battle.cursor ? state : { ...state, battle: { ...battle, cursor } };
  }
  const item = items[Math.min(battle.cursor, items.length - 1)];
  if (!item) return { ...state, battle: { ...battle, phase: 'menu', cursor: 0 } };
  // The same refusal as the bag menu: nothing is used up, and the enemy does not get a free turn.
  if (state.hp >= state.maxHp) return show(state, battle, [{ text: 'You are full of energy already.' }], ctx);
  return turn(state, { item }, ctx);
}
