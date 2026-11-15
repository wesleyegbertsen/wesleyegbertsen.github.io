import { fullPp, startBattle, stepBattle } from './battle.ts';
import { random } from './rng.ts';
import { pageLength, paginate } from './text.ts';
import type { Action, Dir, GameEvent, GameState, Input, Result, World } from './types.ts';
import { DELTA, branchFor, holds, objectAt, passable, resolveSpot, tileAt } from './world.ts';

/** How many ticks one step from cell to cell takes (at 60 ticks a second). */
export const WALK_TICKS = 8;

export type Options = {
  /** Reduced motion: a step is one whole move and text appears at once. */
  instant?: boolean;
};

type Ctx = { world: World; events: GameEvent[]; instant: boolean };

/** The items the player carries, in the order the content lists them. */
export function ownedItems(state: GameState, world: World): string[] {
  return Object.keys(world.items).filter((id) => state.items[id]! > 0);
}

export function initialGame(world: World, seed = 1): GameState {
  const start = resolveSpot(world, world.start);
  return {
    scene: 'title',
    ...start,
    dir: world.start.dir ?? 'down',
    walk: null,
    hp: world.baseHp,
    maxHp: world.baseHp,
    pp: fullPp(world),
    items: { ...world.startItems },
    flags: {},
    badges: [],
    dialogue: null,
    script: [],
    battle: null,
    menu: null,
    heal: start,
    seed,
    finished: false,
  };
}

function say(state: GameState, paragraphs: string[], ctx: Ctx, kind: GameEvent['kind'] = 'say'): GameState {
  const pages = paginate(paragraphs);
  if (pages.length === 0) return state;
  ctx.events.push({ kind, text: pages[0]!.join(' ') });
  return { ...state, dialogue: { pages, page: 0, shown: ctx.instant ? pageLength(pages[0]!) : 0 } };
}

function apply(state: GameState, action: Action, ctx: Ctx): GameState {
  const { world } = ctx;
  if ('say' in action) return say(state, action.say, ctx);
  if ('give' in action) {
    const item = world.items[action.give]!;
    const items = { ...state.items, [action.give]: (state.items[action.give] ?? 0) + 1 };
    return say({ ...state, items }, [`You got the ${item.name}! ${item.description}`], ctx, 'item');
  }
  if ('take' in action) {
    return { ...state, items: { ...state.items, [action.take]: Math.max(0, (state.items[action.take] ?? 0) - 1) } };
  }
  if ('flag' in action) return { ...state, flags: { ...state.flags, [action.flag]: true } };
  if ('badge' in action) {
    if (state.badges.includes(action.badge)) return state;
    const badge = world.badges.find((b) => b.id === action.badge)!;
    const badges = [...state.badges, action.badge];
    const maxHp = world.baseHp + world.hpPerBadge * badges.length;
    const text = `You earned the ${badge.name}! That is ${badges.length} of ${world.badges.length}. You feel stronger.`;
    return say({ ...state, badges, maxHp, hp: maxHp, pp: fullPp(world) }, [text], ctx, 'badge');
  }
  if ('heal' in action) {
    return { ...state, hp: state.maxHp, pp: fullPp(world), heal: { map: state.map, x: state.x, y: state.y } };
  }
  if ('battle' in action) return startBattle(state, action.battle, action.win, false, ctx);
  if ('warp' in action) {
    const spot = resolveSpot(world, action.warp);
    ctx.events.push({ kind: 'place', text: world.maps[spot.map]!.name });
    return { ...state, ...spot, dir: action.warp.dir ?? state.dir, walk: null };
  }
  ctx.events.push({ kind: 'ending', text: world.ending.join(' ') });
  return { ...state, scene: 'ending', finished: true, script: [] };
}

/** Runs the waiting actions until one of them opens a dialogue or a battle, which the player has to finish first. */
function runScript(state: GameState, ctx: Ctx): GameState {
  let current = state;
  while (current.script.length > 0 && !current.dialogue && !current.battle && current.scene === 'world') {
    const [action, ...script] = current.script;
    current = apply({ ...current, script }, action!, ctx);
  }
  return current;
}

function stepDialogue(state: GameState, input: Input, ctx: Ctx): GameState {
  const dialogue = state.dialogue!;
  const full = pageLength(dialogue.pages[dialogue.page]!);
  if (!input.a && !input.b) {
    return dialogue.shown < full ? { ...state, dialogue: { ...dialogue, shown: dialogue.shown + 1 } } : state;
  }
  if (dialogue.shown < full) return { ...state, dialogue: { ...dialogue, shown: full } };
  const next = dialogue.pages[dialogue.page + 1];
  if (next) {
    ctx.events.push({ kind: 'say', text: next.join(' ') });
    return { ...state, dialogue: { ...dialogue, page: dialogue.page + 1, shown: ctx.instant ? pageLength(next) : 0 } };
  }
  return runScript({ ...state, dialogue: null }, ctx);
}

function stepMenu(state: GameState, input: Input, ctx: Ctx): GameState {
  const { world } = ctx;
  const menu = state.menu!;
  if (input.b || input.start) return { ...state, menu: null };
  if (input.pressed === 'left' || input.pressed === 'right') {
    return { ...state, menu: { tab: menu.tab === 'items' ? 'badges' : 'items', cursor: 0 } };
  }
  const owned = ownedItems(state, world);
  const count = menu.tab === 'items' ? owned.length : world.badges.length;
  if (input.pressed === 'up' || input.pressed === 'down') {
    const cursor = Math.max(0, Math.min(count - 1, menu.cursor + (input.pressed === 'up' ? -1 : 1)));
    return cursor === menu.cursor ? state : { ...state, menu: { ...menu, cursor } };
  }
  if (!input.a || menu.tab !== 'items') return state;
  const id = owned[Math.min(menu.cursor, owned.length - 1)];
  if (!id) return state;
  const item = world.items[id]!;
  if (item.heal === undefined) return say(state, [`${item.name}: ${item.description}`], ctx);
  if (state.hp >= state.maxHp) return say(state, ['You are full of energy already.'], ctx);
  const items = { ...state.items, [id]: state.items[id]! - 1 };
  const hp = Math.min(state.maxHp, state.hp + item.heal);
  return say({ ...state, items, hp, menu: { ...menu, cursor: 0 } }, [`You use the ${item.name}. Energy restored!`], ctx);
}

/** The player reached a cell: whatever lies there happens, and tall grass may hide something. */
function arrive(state: GameState, ctx: Ctx): GameState {
  const { world } = ctx;
  const map = world.maps[state.map]!;
  const object = objectAt(map, state.x, state.y, state);
  if (object?.trigger === 'step') {
    return runScript({ ...state, script: [...(branchFor(object, state)?.do ?? [])] }, ctx);
  }
  if (map.encounters && tileAt(world, map, state.x, state.y).grass) {
    const chance = random(state.seed);
    if (chance.value >= map.encounters.rate) return { ...state, seed: chance.seed };
    const pick = random(chance.seed);
    const enemy = map.encounters.enemies[Math.floor(pick.value * map.encounters.enemies.length)]!;
    return startBattle({ ...state, seed: pick.seed }, enemy, [], true, ctx);
  }
  return state;
}

/** Turn to `dir` and take a step if the way is free. Walking into a locked door makes it say why. */
function tryMove(state: GameState, dir: Dir, ctx: Ctx): GameState {
  const { world } = ctx;
  const map = world.maps[state.map]!;
  const turned = state.dir === dir ? state : { ...state, dir };
  const x = state.x + DELTA[dir].dx;
  const y = state.y + DELTA[dir].dy;
  const object = objectAt(map, x, y, turned);
  if (object && !passable(object, turned)) {
    if (object.trigger !== 'step') return turned;
    return runScript({ ...turned, script: [...(branchFor(object, turned)?.do ?? [])] }, ctx);
  }
  if (tileAt(world, map, x, y).solid) return turned;
  const walking = { ...turned, x, y, walk: { fromX: state.x, fromY: state.y, t: 0 } };
  return ctx.instant ? arrive({ ...walking, walk: null }, ctx) : walking;
}

function interact(state: GameState, ctx: Ctx): GameState {
  const map = ctx.world.maps[state.map]!;
  const object = objectAt(map, state.x + DELTA[state.dir].dx, state.y + DELTA[state.dir].dy, state);
  if (!object || object.trigger !== 'interact') return state;
  const branch = branchFor(object, state);
  return branch ? runScript({ ...state, script: [...branch.do] }, ctx) : state;
}

const idle = (state: GameState) => !state.walk && !state.dialogue && !state.battle && !state.menu && state.scene === 'world';

/**
 * One tick of the game. Pure: the same state and input give the same result. It returns the very same state
 * object when nothing changed, so the caller can skip the redraw.
 */
export function step(state: GameState, input: Input, world: World, options: Options = {}): Result {
  const ctx: Ctx = { world, events: [], instant: options.instant ?? false };
  const done = (next: GameState): Result => ({ state: next, events: ctx.events });

  if (state.scene === 'ending') return done(state);
  if (state.scene === 'title') {
    if (!input.a && !input.start) return done(state);
    return done(runScript({ ...state, scene: 'world', script: [{ say: world.intro }] }, ctx));
  }
  if (state.dialogue) return done(stepDialogue(state, input, ctx));
  if (state.battle) {
    const next = stepBattle(state, input, ctx);
    return done(next.battle ? next : runScript(next, ctx));
  }
  if (state.menu) return done(stepMenu(state, input, ctx));

  let current = state;
  if (current.walk) {
    const t = current.walk.t + 1;
    if (t < WALK_TICKS) return done({ ...current, walk: { ...current.walk, t } });
    current = arrive({ ...current, walk: null }, ctx);
    // Still holding the direction: keep walking without a pause between the cells.
    return done(idle(current) && input.dir ? tryMove(current, input.dir, ctx) : current);
  }

  if (input.start) {
    ctx.events.push({ kind: 'menu', text: 'Menu' });
    return done({ ...current, menu: { tab: 'items', cursor: 0 } });
  }
  if (input.select) {
    const hint = world.hints.find((candidate) => holds(candidate.when, current));
    return done(hint ? say(current, [hint.text], ctx) : current);
  }
  if (input.a) return done(interact(current, ctx));
  const dir = input.dir ?? input.pressed;
  return done(dir ? tryMove(current, dir, ctx) : current);
}
