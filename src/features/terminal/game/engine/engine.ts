import { fullPp, startBattle, stepBattle } from './battle.ts';
import { random } from './rng.ts';
import { pageLength, paginate } from './text.ts';
import type { Action, Cue, Dir, GameEvent, GameState, Input, Result, World } from './types.ts';
import { stroll } from './wander.ts';
import { DELTA, branchFor, gone, holds, objectAt, passable, resolveSpot, tileAt } from './world.ts';

/** How many ticks one step from cell to cell takes (at 60 ticks a second). */
export const WALK_TICKS = 10;
/** How long the note in the corner stays after a find, in ticks of the game clock. */
export const NOTICE_TICKS = 150;
/** The typewriter ticks once per this many characters. */
const BLIP_EVERY = 3;

export type Options = {
  /** Reduced motion: a step is one whole move and text appears at once. */
  instant?: boolean;
};

type Ctx = { world: World; events: GameEvent[]; cues: Cue[]; instant: boolean };

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
    clock: 0,
    roam: {},
    notice: null,
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
    if (action.quiet) {
      // Picked up in passing: no text box, a sound, a line for the status region and a note in the corner.
      const counted = world.collect?.item === action.give;
      const tally = counted ? `${items[action.give]} of ${world.collect!.total}` : '';
      ctx.cues.push('star');
      ctx.events.push({ kind: 'item', text: `Found a ${item.name}!${tally ? ` ${tally}.` : ''}` });
      const text = counted ? `${items[action.give]}/${world.collect!.total}` : item.name;
      return { ...state, items, notice: { text, until: state.clock + NOTICE_TICKS } };
    }
    ctx.cues.push('item');
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
    ctx.cues.push('badge');
    const text = `You earned the ${badge.name}! That is ${badges.length} of ${world.badges.length}. You feel stronger.`;
    return say({ ...state, badges, maxHp, hp: maxHp, pp: fullPp(world) }, [text], ctx, 'badge');
  }
  if ('heal' in action) {
    ctx.cues.push('heal');
    return { ...state, hp: state.maxHp, pp: fullPp(world), heal: { map: state.map, x: state.x, y: state.y } };
  }
  if ('battle' in action) return startBattle(state, action.battle, action.win, false, ctx);
  if ('warp' in action) {
    const spot = resolveSpot(world, action.warp);
    ctx.cues.push('door');
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
    if (dialogue.shown >= full) return state;
    if (dialogue.shown % BLIP_EVERY === 0) ctx.cues.push('blip');
    return { ...state, dialogue: { ...dialogue, shown: dialogue.shown + 1 } };
  }
  if (dialogue.shown < full) return { ...state, dialogue: { ...dialogue, shown: full } };
  ctx.cues.push('confirm');
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
  if (input.b || input.start) {
    ctx.cues.push('cancel');
    return { ...state, menu: null };
  }
  if (input.pressed === 'left' || input.pressed === 'right') {
    ctx.cues.push('cursor');
    return { ...state, menu: { tab: menu.tab === 'items' ? 'badges' : 'items', cursor: 0 } };
  }
  const owned = ownedItems(state, world);
  const count = menu.tab === 'items' ? owned.length : world.badges.length;
  if (input.pressed === 'up' || input.pressed === 'down') {
    const cursor = Math.max(0, Math.min(count - 1, menu.cursor + (input.pressed === 'up' ? -1 : 1)));
    if (cursor === menu.cursor) return state;
    ctx.cues.push('cursor');
    return { ...state, menu: { ...menu, cursor } };
  }
  if (!input.a || menu.tab !== 'items') return state;
  const id = owned[Math.min(menu.cursor, owned.length - 1)];
  if (!id) return state;
  const item = world.items[id]!;
  ctx.cues.push('confirm');
  if (item.heal === undefined) return say(state, [`${item.name}: ${item.description}`], ctx);
  if (state.hp >= state.maxHp) return say(state, ['You are full of energy already.'], ctx);
  ctx.cues.push('heal');
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
    if (object.trigger !== 'step') {
      ctx.cues.push('bump');
      return turned;
    }
    return runScript({ ...turned, script: [...(branchFor(object, turned)?.do ?? [])] }, ctx);
  }
  if (tileAt(world, map, x, y).solid) {
    ctx.cues.push('bump');
    return turned;
  }
  const walking = { ...turned, x, y, walk: { fromX: state.x, fromY: state.y, t: 0 } };
  return ctx.instant ? arrive({ ...walking, walk: null }, ctx) : walking;
}

function interact(state: GameState, ctx: Ctx): GameState {
  const map = ctx.world.maps[state.map]!;
  const object = objectAt(map, state.x + DELTA[state.dir].dx, state.y + DELTA[state.dir].dy, state);
  if (!object || object.trigger !== 'interact') return state;
  const branch = branchFor(object, state);
  if (!branch) return state;
  ctx.cues.push('confirm');
  return runScript({ ...state, script: [...branch.do] }, ctx);
}

const idle = (state: GameState) => !state.walk && !state.dialogue && !state.battle && !state.menu && state.scene === 'world';

/** What the player does on the map this tick: carry on walking, open the bag, ask for a hint, talk or step. */
function act(state: GameState, input: Input, ctx: Ctx): GameState {
  const { world } = ctx;
  if (state.walk) {
    // With reduced motion a step that was under way (the setting changed mid-step) is finished at once.
    const t = ctx.instant ? WALK_TICKS : state.walk.t + 1;
    if (t < WALK_TICKS) return { ...state, walk: { ...state.walk, t } };
    const arrived = arrive({ ...state, walk: null }, ctx);
    // Still holding the direction: keep walking without a pause between the cells.
    return idle(arrived) && input.dir ? tryMove(arrived, input.dir, ctx) : arrived;
  }
  if (input.start) {
    ctx.cues.push('confirm');
    ctx.events.push({ kind: 'menu', text: 'Menu' });
    return { ...state, menu: { tab: 'items', cursor: 0 } };
  }
  if (input.select) {
    const hint = world.hints.find((candidate) => holds(candidate.when, state));
    if (!hint) return state;
    ctx.cues.push('confirm');
    return say(state, [hint.text], ctx);
  }
  if (input.a) return interact(state, ctx);
  const dir = input.dir ?? input.pressed;
  return dir ? tryMove(state, dir, ctx) : state;
}

/**
 * One tick of the game. Pure: the same state and input give the same result. On the title, in a text box, a menu
 * or a battle it returns the very same state object when nothing changed, so the caller can skip the redraw. On
 * the map the game clock runs (one tick, or a whole step's worth with reduced motion), which moves the townsfolk
 * and the animated tiles.
 */
export function step(state: GameState, input: Input, world: World, options: Options = {}): Result {
  const ctx: Ctx = { world, events: [], cues: [], instant: options.instant ?? false };
  const done = (next: GameState): Result => ({ state: next, events: ctx.events, cues: ctx.cues });

  if (state.scene === 'ending') return done(state);
  if (state.scene === 'title') {
    if (!input.a && !input.start) return done(state);
    ctx.cues.push('confirm');
    return done(runScript({ ...state, scene: 'world', script: [{ say: world.intro }] }, ctx));
  }
  if (state.dialogue) return done(stepDialogue(state, input, ctx));
  if (state.battle) {
    const next = stepBattle(state, input, ctx);
    return done(next.battle ? next : runScript(next, ctx));
  }
  if (state.menu) return done(stepMenu(state, input, ctx));

  // The player first, then the town: someone you just turned to and talk to has not walked off in between.
  const next = act(state, input, ctx);
  const clock = state.clock + (ctx.instant ? WALK_TICKS : 1);
  if (next.scene !== 'world' || next.dialogue || next.battle || next.menu) return done({ ...next, clock });
  return done(stroll(next, world, clock, ctx.instant, (object) => gone(object, next)));
}
