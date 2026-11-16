import { fullPp, startBattle, stepBattle } from './battle.ts';
import { applyItem } from './items.ts';
import { maxHpOf } from './level.ts';
import { covered, loose, platesDown, putBack, roomFor } from './push.ts';
import { random } from './rng.ts';
import { money, openShop, stepShop } from './shop.ts';
import { pageLength, paginate } from './text.ts';
import { SETTINGS, type TileDef, type Action, type Cue, type Dir, type GameEvent, type GameMap, type GameObject, type GameState, type Input, type MoveDef, type Result, type World } from './types.ts';
import { placeOf, stroll } from './wander.ts';
import { DELTA, areaAt, branchFor, gone, holds, home, landing, objectAt, passable, resolveSpot, tileAt } from './world.ts';

/** How many ticks one step from cell to cell takes (at 60 ticks a second). */
export const WALK_TICKS = 10;
/** How many ticks a hop over a ledge takes: two cells in one go, a little quicker than walking them. */
export const JUMP_TICKS = 16;
/** How long the tall grass rustles after a step into it or out of it, in ticks of the game clock (0.4 s). */
export const TRAIL_TICKS = 24;
/** How long the note in the corner stays after a find, in ticks of the game clock. */
export const NOTICE_TICKS = 150;
/** The typewriter ticks once per this many characters. */
const BLIP_EVERY = 3;

export type Options = {
  /** Reduced motion: a step is one whole move and text appears at once. */
  instant?: boolean;
};

type Ctx = { world: World; events: GameEvent[]; cues: Cue[]; instant: boolean; /** A direction was pressed this tick, not just held. */ pressed?: boolean };

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
    level: 1,
    xp: 0,
    bonusHp: 0,
    moves: [...world.playerMoves],
    pp: fullPp(world),
    items: { ...world.startItems },
    flags: {},
    badges: [],
    dialogue: null,
    script: [],
    battle: null,
    menu: null,
    learn: null,
    shop: null,
    coins: world.economy.start,
    repel: 0,
    face: null,
    heal: home(world) ?? start,
    seed,
    finished: false,
    clock: 0,
    roam: {},
    notice: null,
    area: '',
    banner: null,
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
      const counted = world.collect?.find((collect) => collect.item === action.give);
      const tally = counted ? `${items[action.give]} of ${counted.total}` : '';
      ctx.cues.push('star');
      ctx.events.push({ kind: 'item', text: `Found a ${item.name}!${tally ? ` ${tally}.` : ''}` });
      const text = counted ? `${counted.mark} ${items[action.give]}/${counted.total}` : item.name;
      // One label at a time: the note takes the place of a label with a name that is still out.
      return { ...state, items, notice: { text, until: state.clock + NOTICE_TICKS }, banner: null };
    }
    ctx.cues.push('item');
    return say({ ...state, items }, [`You got the ${item.name}! ${item.description}`], ctx, 'item');
  }
  if ('take' in action) {
    return { ...state, items: { ...state.items, [action.take]: Math.max(0, (state.items[action.take] ?? 0) - 1) } };
  }
  if ('flag' in action) {
    if (action.cue) ctx.cues.push(action.cue);
    return { ...state, flags: { ...state.flags, [action.flag]: true } };
  }
  if ('unflag' in action) return { ...state, flags: Object.fromEntries(Object.entries(state.flags).filter(([flag]) => !action.unflag.includes(flag))) };
  if ('reset' in action) {
    ctx.cues.push('switch');
    return { ...state, roam: putBack(state, world, state.map) };
  }
  if ('badge' in action) {
    if (state.badges.includes(action.badge)) return state;
    const badge = world.badges.find((b) => b.id === action.badge)!;
    const badges = [...state.badges, action.badge];
    const maxHp = maxHpOf(world, { ...state, badges });
    ctx.cues.push('badge');
    const text = `You earned the ${badge.name}! That is ${badges.length} of ${world.badges.length}. You feel stronger.`;
    return say({ ...state, badges, maxHp, hp: maxHp, pp: fullPp(world, state.moves) }, [text], ctx, 'badge');
  }
  if ('heal' in action) {
    ctx.cues.push(action.rest ? 'rest' : 'heal');
    // A rest is played through: the script waits until its jingle is over (with reduced motion it does not wait).
    const pause = action.rest && !ctx.instant ? { pause: action.rest, rest: { ticks: action.rest, from: state.hp } } : {};
    return { ...state, ...pause, hp: state.maxHp, pp: fullPp(world, state.moves), heal: { map: state.map, x: state.x, y: state.y } };
  }
  if ('boost' in action) {
    const bonusHp = state.bonusHp + action.boost;
    const maxHp = maxHpOf(world, { ...state, bonusHp });
    ctx.cues.push('levelup');
    return say({ ...state, bonusHp, maxHp, hp: state.hp + (maxHp - state.maxHp) }, [`Your max energy grows by ${action.boost}, for good!`], ctx, 'item');
  }
  if ('learn' in action) {
    const move = world.moves[action.learn];
    if (!move || state.moves.includes(action.learn)) return state;
    ctx.cues.push('item');
    ctx.events.push({ kind: 'menu', text: `You can learn ${move.name}: ${describeMove(move)}. Pick a move to replace, or press B to keep your moves.` });
    return { ...state, learn: { move: action.learn, cursor: 0 } };
  }
  if ('coins' in action) {
    ctx.cues.push('coin');
    return say({ ...state, coins: state.coins + action.coins }, [`You got ${money(action.coins, world)}!`], ctx, 'item');
  }
  if ('shop' in action) return openShop(state, action.shop, ctx);
  if ('battle' in action) return startBattle(state, action.battle, action.win, false, ctx, 0, action.quick);
  if ('warp' in action) {
    const spot = resolveSpot(world, action.warp);
    ctx.cues.push(action.cue ?? 'door');
    ctx.events.push({ kind: 'place', text: world.maps[spot.map]!.name });
    // Arriving on a map puts what was pushed about there back in its place (unless its puzzle is solved).
    return { ...state, ...spot, dir: action.warp.dir ?? state.dir, walk: null, roam: putBack(state, world, spot.map, spot) };
  }
  ctx.events.push({ kind: 'ending', text: world.ending.join(' ') });
  return { ...state, scene: 'ending', finished: true, script: [] };
}

/** Runs the waiting actions until one of them opens a dialogue or a battle, which the player has to finish first. */
function runScript(state: GameState, ctx: Ctx): GameState {
  let current = state;
  while (current.script.length > 0 && !current.dialogue && !current.battle && !current.learn && !current.shop && !current.pause && current.scene === 'world') {
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

/**
 * The rest in the cafe as a scene, in 32 equal steps of the rest (the two bars of its jingle): four mugs light up
 * one after another with the notes of the tune (steps 3, 6, 12 and 15), a sparkle comes with the held last note
 * (18), and then the energy bar fills from what it was to full (18 to 28). Null when no rest is being played.
 */
export function restScene(state: GameState): { mugs: number; sparkle: boolean; hp: number } | null {
  if (!state.rest || !state.pause) return null;
  const at = ((state.rest.ticks - state.pause) * 32) / state.rest.ticks;
  const mugs = [3, 6, 12, 15].filter((step) => at >= step).length;
  const fill = Math.max(0, Math.min(1, (at - 18) / 10));
  return { mugs, sparkle: at >= 18, hp: Math.round(state.rest.from + (state.maxHp - state.rest.from) * fill) };
}

/** The tabs of the Start menu, in order; left and right go round. */
export const MENU_TABS = ['items', 'badges', 'dex', 'settings'] as const;
const TAB_NAMES = { items: 'Bag', badges: 'Badges', dex: 'Dex', settings: 'Settings. Sound, volume, screen and mode.' };

/** A row of the DEX as the status region says it: the number, and the name once seen. */
export function dexRow(state: GameState, world: World, at: number): string {
  const entry = world.dex?.[at];
  if (!entry) return '';
  const seen = state.seen?.includes(entry.enemy);
  return `${at + 1}. ${seen ? world.enemies[entry.enemy]!.name : 'Not seen yet'}`;
}

/** The page of a monster in the DEX as the status region says it. */
function dexPage(world: World, at: number): string {
  const entry = world.dex![at]!;
  return `No. ${at + 1} ${world.enemies[entry.enemy]!.name}. ${entry.area ?? 'BOSS'}. ${entry.text} Left and right: CRY or BACK. Up and down: the next one.`;
}

/** The page of a monster open in the DEX: its two buttons, the next one seen up or down, and back to the list. */
function stepDexPage(state: GameState, input: Input, ctx: Ctx): GameState {
  const menu = state.menu!;
  const detail = menu.detail!;
  const dex = ctx.world.dex ?? [];
  if (input.b || (input.a && detail.focus === 1)) {
    ctx.cues.push('cancel');
    ctx.events.push({ kind: 'menu', text: dexRow(state, ctx.world, detail.at) });
    return { ...state, menu: { tab: 'dex', cursor: detail.at } };
  }
  if (input.a) {
    ctx.cues.push(`cry:${dex[detail.at]!.enemy}`);
    return state;
  }
  if (input.pressed === 'left' || input.pressed === 'right') {
    const focus = input.pressed === 'left' ? 0 : 1;
    if (focus === detail.focus) return state;
    ctx.cues.push('cursor');
    ctx.events.push({ kind: 'menu', text: focus === 0 ? 'Cry' : 'Back' });
    return { ...state, menu: { ...menu, detail: { ...detail, focus } } };
  }
  if (input.pressed === 'up' || input.pressed === 'down') {
    const way = input.pressed === 'up' ? -1 : 1;
    let at = detail.at + way;
    while (at >= 0 && at < dex.length && !state.seen?.includes(dex[at]!.enemy)) at += way;
    if (at < 0 || at >= dex.length) return state;
    ctx.cues.push('cursor');
    ctx.events.push({ kind: 'menu', text: dexPage(ctx.world, at) });
    return { ...state, menu: { tab: 'dex', cursor: at, detail: { at, focus: 0 } } };
  }
  return state;
}
const SETTING_NAMES = { sound: 'Sound. A switches it.', volume: 'Volume. Left and right change it.', screen: 'Screen. A switches the LCD look.', mode: 'Mode. A switches between Game Boy and Game Boy Color.' };

/** A move in a few words, for the offer of a new one: on the screen and in the status region. */
export function describeMove(move: MoveDef): string {
  const what = move.heal !== undefined ? `heals ${move.heal}` : `power ${move.power}, hits ${Math.round(move.accuracy * 100)}%`;
  return `${what}, ${move.pp} PP`;
}

/** The entries of the offer of a new move: the moves that can make room (never the first one), and "keep". */
export const learnRows = (state: GameState): string[] => state.moves.slice(1);

/** The offer of a new move: pick the one it replaces, or keep what you have (B, or the last entry). */
function stepLearn(state: GameState, input: Input, ctx: Ctx): GameState {
  const { world } = ctx;
  const learn = state.learn!;
  const rows = learnRows(state);
  const offered = world.moves[learn.move]!;
  // The question: forget this move for the new one? YES replaces it, NO (or B) goes back to the choice.
  if (learn.confirm !== undefined) {
    // YES and NO stand side by side: left and up go to YES, right and down to NO.
    if (input.pressed) {
      const confirm = input.pressed === 'up' || input.pressed === 'left' ? 0 : 1;
      if (confirm === learn.confirm) return state;
      ctx.cues.push('cursor');
      ctx.events.push({ kind: 'menu', text: confirm === 0 ? 'Yes' : 'No' });
      return { ...state, learn: { ...learn, confirm } };
    }
    if (input.b || (input.a && learn.confirm === 1)) {
      ctx.cues.push('cancel');
      ctx.events.push({ kind: 'menu', text: `Replace ${world.moves[rows[learn.cursor]!]!.name}: ${describeMove(world.moves[rows[learn.cursor]!]!)}` });
      return { ...state, learn: { move: learn.move, cursor: learn.cursor } };
    }
    if (!input.a) return state;
    const old = rows[learn.cursor]!;
    ctx.cues.push('confirm');
    const moves = state.moves.map((id) => (id === old ? learn.move : id));
    const pp = Object.fromEntries(moves.map((id) => [id, id === learn.move ? offered.pp : (state.pp[id] ?? 0)]));
    return say({ ...state, learn: null, moves, pp }, [`You forget ${world.moves[old]!.name} and learn ${offered.name}!`], ctx);
  }
  if (input.pressed === 'up' || input.pressed === 'down') {
    const cursor = Math.max(0, Math.min(rows.length, learn.cursor + (input.pressed === 'up' ? -1 : 1)));
    if (cursor === learn.cursor) return state;
    ctx.cues.push('cursor');
    const id = rows[cursor];
    ctx.events.push({ kind: 'menu', text: id ? `Replace ${world.moves[id]!.name}: ${describeMove(world.moves[id]!)}` : 'Keep my moves' });
    return { ...state, learn: { ...learn, cursor } };
  }
  const old = input.a ? rows[learn.cursor] : undefined;
  if (input.b || (input.a && !old)) {
    ctx.cues.push('cancel');
    return say({ ...state, learn: null }, [`You keep your moves. ${offered.name} will have to wait.`], ctx);
  }
  if (!old) return state;
  // A move is picked: ask before it is forgotten.
  ctx.cues.push('confirm');
  ctx.events.push({ kind: 'menu', text: `Replace ${world.moves[old]!.name} with ${offered.name}? Yes or no.` });
  return { ...state, learn: { ...learn, confirm: 0 } };
}

function stepMenu(state: GameState, input: Input, ctx: Ctx): GameState {
  const { world } = ctx;
  const menu = state.menu!;
  if (input.start || (input.b && !menu.detail)) {
    ctx.cues.push('cancel');
    return { ...state, menu: null };
  }
  if (menu.detail) return stepDexPage(state, input, ctx);
  // The settings. The game itself does not know how loud it is or what the screen looks like: it only says what
  // was asked for ("quieter", "louder", "sound", "screen"), and whoever plays the sound and draws the screen acts.
  const setting = menu.tab === 'settings' ? SETTINGS[menu.cursor] : undefined;
  if (setting === 'volume' && (input.pressed === 'left' || input.pressed === 'right')) {
    ctx.cues.push(input.pressed === 'left' ? 'quieter' : 'louder');
    return state;
  }
  if (input.pressed === 'left' || input.pressed === 'right') {
    const at = MENU_TABS.indexOf(menu.tab) + (input.pressed === 'left' ? -1 : 1);
    const tab = MENU_TABS[(at + MENU_TABS.length) % MENU_TABS.length]!;
    ctx.cues.push('cursor');
    ctx.events.push({ kind: 'menu', text: TAB_NAMES[tab] });
    return { ...state, menu: { tab, cursor: 0 } };
  }
  const owned = ownedItems(state, world);
  const count = menu.tab === 'items' ? owned.length : menu.tab === 'badges' ? world.badges.length : menu.tab === 'dex' ? (world.dex?.length ?? 0) : SETTINGS.length;
  if (input.pressed === 'up' || input.pressed === 'down') {
    const cursor = Math.max(0, Math.min(count - 1, menu.cursor + (input.pressed === 'up' ? -1 : 1)));
    if (cursor === menu.cursor) return state;
    ctx.cues.push('cursor');
    if (menu.tab === 'settings') ctx.events.push({ kind: 'menu', text: SETTING_NAMES[SETTINGS[cursor]!] });
    if (menu.tab === 'dex') ctx.events.push({ kind: 'menu', text: dexRow(state, world, cursor) });
    return { ...state, menu: { ...menu, cursor } };
  }
  // A in the DEX: the page of a monster seen, a bump on one not seen yet.
  if (menu.tab === 'dex') {
    const entry = world.dex?.[menu.cursor];
    if (!input.a || !entry) return state;
    if (!state.seen?.includes(entry.enemy)) {
      ctx.cues.push('bump');
      return state;
    }
    ctx.cues.push('confirm');
    ctx.events.push({ kind: 'menu', text: dexPage(world, menu.cursor) });
    return { ...state, menu: { ...menu, detail: { at: menu.cursor, focus: 0 } } };
  }
  if (setting) {
    if (input.a && setting !== 'volume') ctx.cues.push(setting);
    return state;
  }
  if (!input.a || menu.tab !== 'items') return state;
  const id = owned[Math.min(menu.cursor, owned.length - 1)];
  if (!id) return state;
  const item = world.items[id]!;
  ctx.cues.push('confirm');
  const used = applyItem(state, id, world);
  if (!used) return say(state, [`${item.name}: ${item.description}`], ctx);
  if (!used.ok) return say(state, [used.text], ctx);
  ctx.cues.push(used.cue);
  return say({ ...used.state, menu: { ...menu, cursor: 0 } }, [used.text], ctx);
}

/** The player reached a cell: whatever lies there happens, and tall grass may hide something. */
function arrive(state: GameState, ctx: Ctx): GameState {
  const { world } = ctx;
  const map = world.maps[state.map]!;
  // The last plate went down while the player stepped after the boulder: the puzzle of this map is solved, for good.
  if (platesDown(map, state)) {
    ctx.cues.push('gate');
    return runScript({ ...state, flags: { ...state.flags, [map.plates!.flag]: true }, script: [...map.plates!.do, ...state.script] }, ctx);
  }
  const object = objectAt(map, state.x, state.y, state);
  if (object?.trigger === 'step') {
    return runScript({ ...state, script: [...(branchFor(object, state)?.do ?? [])] }, ctx);
  }
  if (map.encounters && tileAt(map, state.x, state.y).grass) {
    if (state.repel > 0) {
      // A spray from the shop: this step in the grass is a safe one. The last one says so.
      if (state.repel > 1) return { ...state, repel: state.repel - 1 };
      ctx.events.push({ kind: 'item', text: 'The spray has worn off.' });
      return { ...state, repel: 0, notice: { text: 'SPRAY OFF', until: state.clock + NOTICE_TICKS }, banner: null };
    }
    const chance = random(state.seed);
    if (chance.value >= map.encounters.rate) return { ...state, seed: chance.seed };
    const pick = random(chance.seed);
    const enemy = map.encounters.enemies[Math.floor(pick.value * map.encounters.enemies.length)]!;
    if (!map.encounters.levels) return startBattle({ ...state, seed: pick.seed }, enemy, [], true, ctx);
    // Its level: somewhere in the range of this place.
    const [low, high] = map.encounters.levels;
    const roll = random(pick.seed);
    const level = low + Math.floor(roll.value * (high - low + 1));
    return startBattle({ ...state, seed: roll.seed }, enemy, [], true, ctx, level);
  }
  return state;
}

/**
 * Walking into something that can be pushed: it moves a cell on when there is room, and the player steps into its
 * place. The status region is told what happened, plates included, so the puzzle can be followed without the picture.
 */
function shove(state: GameState, object: GameObject, dir: Dir, ctx: Ctx): GameState {
  const map = ctx.world.maps[state.map]!;
  const from = placeOf(object, state);
  const to = { x: from.x + DELTA[dir].dx, y: from.y + DELTA[dir].dy };
  if (!roomFor(map, to.x, to.y, state)) {
    ctx.cues.push('bump');
    // Said once per press, not sixty times a second while the direction is held.
    if (ctx.pressed) ctx.events.push({ kind: 'say', text: `The ${object.push} does not move ${dir}: something is in the way.` });
    return state;
  }
  ctx.cues.push('push');
  // It goes at walking pace, just ahead of the player. With reduced motion it is there at once.
  const roam = { ...state.roam, [object.id]: { ...to, fromX: from.x, fromY: from.y, at: ctx.instant ? state.clock - WALK_TICKS : state.clock, ticks: WALK_TICKS } };
  const pushed = { ...state, roam };
  let text = `You push the ${object.push} ${dir}.`;
  if (tileAt(map, to.x, to.y).plate) {
    ctx.cues.push('switch');
    text += ` It settles on a pressure plate: ${covered(map, pushed)} of ${map.plates?.cells.length ?? 1} down.`;
  } else if (tileAt(map, from.x, from.y).plate) {
    text += ' It rolls off the pressure plate.';
  }
  ctx.events.push({ kind: 'say', text });
  const walking = { ...pushed, x: from.x, y: from.y, walk: { fromX: state.x, fromY: state.y, t: 0 } };
  return ctx.instant ? arrive({ ...walking, walk: null }, ctx) : walking;
}

/** What the status region calls whatever is in the way on a cell: the thing that stands there, or the ground itself. */
function obstacle(map: GameMap, x: number, y: number, state: GameState): string {
  const object = objectAt(map, x, y, state);
  if (object) return object.push ? `the ${object.push}` : 'something';
  const tile = tileAt(map, x, y);
  return tile.name ?? (tile.ledge ? 'a ledge' : 'the wall');
}

const stepsOf = (count: number) => (count === 1 ? '1 step' : `${count} steps`);

/**
 * Slippery ground: whoever arrives on it keeps going the same way, cell by cell, until the next cell is not free
 * or the ground is firm again. Nobody steers a slide. With reduced motion the whole slide is one move. `moved` is
 * how many cells the press has moved the player so far: when the slide ends, the status region is told which way
 * it went, how far and what ended it, so the slick rock can be played without the picture.
 */
function glide(state: GameState, ctx: Ctx, moved: number): GameState {
  if (!idle(state)) return state;
  const map = ctx.world.maps[state.map]!;
  if (!tileAt(map, state.x, state.y).slide) return state;
  const to = landing(map, state.x, state.y, state.dir);
  const ahead = to ? objectAt(map, to.x, to.y, state) : undefined;
  if (!to || to.jump || (ahead && !passable(ahead, state))) {
    const { dx, dy } = DELTA[state.dir];
    ctx.cues.push('bump');
    ctx.events.push({ kind: 'say', text: `You slide ${state.dir} ${stepsOf(moved)} and stop against ${obstacle(map, state.x + dx, state.y + dy, state)}.` });
    return state;
  }
  if (!tileAt(map, to.x, to.y).slide) ctx.events.push({ kind: 'say', text: `You slide ${state.dir} ${stepsOf(moved + 1)} and stop on firm ground.` });
  const walking = { ...state, x: to.x, y: to.y, walk: { fromX: state.x, fromY: state.y, t: 0, slide: moved + 1 } };
  return ctx.instant ? glide(arrive({ ...walking, walk: null }, ctx), ctx, moved + 1) : walking;
}

/**
 * Whether walking on a tile leaves a rustle: tall grass only. Other ground where wild things hide (the rubble of
 * the cave) keeps its own look, walked on or not.
 */
export const rustles = (tile: TileDef | undefined): boolean => !!tile?.grass && (tile.look ?? tile.sprite) === 'tallgrass';

/**
 * The trail through the tall grass: the cells of a step that are tall grass rustle from now on (an older rustle of
 * the same cell is replaced), and rustles that are over are dropped.
 */
function rustle(state: GameState, map: GameMap, cells: { x: number; y: number }[]): NonNullable<GameState['trail']> {
  const fresh = cells.filter((cell) => rustles(tileAt(map, cell.x, cell.y))).map((cell) => ({ map: map.id, x: cell.x, y: cell.y, at: state.clock }));
  const kept = (state.trail ?? []).filter((old) => state.clock - old.at < TRAIL_TICKS && !fresh.some((cell) => cell.map === old.map && cell.x === old.x && cell.y === old.y));
  return [...kept, ...fresh];
}

/**
 * Turn to `dir` and take a step if the way is free. Walking into a locked door makes it say why. A ledge that is
 * jumped this way is hopped over: one move, two cells. A boulder in the way is pushed; slippery ground is slid over.
 */
function tryMove(state: GameState, dir: Dir, ctx: Ctx): GameState {
  const { world } = ctx;
  const map = world.maps[state.map]!;
  const turned = state.dir === dir ? state : { ...state, dir };
  const x = state.x + DELTA[dir].dx;
  const y = state.y + DELTA[dir].dy;
  const object = objectAt(map, x, y, turned);
  if (object && loose(object, map, turned)) return shove(turned, object, dir, ctx);
  /** Nothing moves. On slippery ground a press that goes nowhere says why (once per press, not while it is held). */
  const blocked = () => {
    ctx.cues.push('bump');
    if (ctx.pressed && tileAt(map, state.x, state.y).slide) ctx.events.push({ kind: 'say', text: `You cannot slide ${dir}: ${obstacle(map, x, y, turned)} is in the way.` });
    return turned;
  };
  if (object && !passable(object, turned)) {
    if (object.trigger !== 'step') return blocked();
    return runScript({ ...turned, script: [...(branchFor(object, turned)?.do ?? [])] }, ctx);
  }
  // The ground decides where the step ends: the next cell, or the cell behind a ledge that is jumped this way.
  const to = landing(map, state.x, state.y, dir);
  const taken = to?.jump ? objectAt(map, to.x, to.y, turned) : undefined;
  if (!to || (taken && !passable(taken, turned))) return blocked();
  if (to.jump) ctx.cues.push('jump');
  if (tileAt(map, to.x, to.y).slide) ctx.cues.push('slide');
  // Off slippery ground in one step: told like the end of any other slide.
  else if (tileAt(map, state.x, state.y).slide) ctx.events.push({ kind: 'say', text: `You slide ${dir} ${stepsOf(to.jump ? 2 : 1)} and stop on firm ground.` });
  const walk = { fromX: state.x, fromY: state.y, t: 0, ...(to.jump ? { jump: true as const } : {}) };
  const walking = { ...turned, x: to.x, y: to.y, walk, ...(ctx.instant ? {} : { trail: rustle(turned, map, [state, to]) }) };
  return ctx.instant ? glide(arrive({ ...walking, walk: null }, ctx), ctx, to.jump ? 2 : 1) : walking;
}

function interact(state: GameState, ctx: Ctx): GameState {
  const map = ctx.world.maps[state.map]!;
  const object = objectAt(map, state.x + DELTA[state.dir].dx, state.y + DELTA[state.dir].dy, state);
  if (!object || object.trigger !== 'interact') return state;
  const branch = branchFor(object, state);
  if (!branch) return state;
  ctx.cues.push('confirm');
  // Whoever is spoken to turns to the player, for as long as the talk lasts.
  const back: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
  return runScript({ ...state, face: { id: object.id, dir: back[state.dir] }, script: [...branch.do] }, ctx);
}

/** How long someone keeps looking at the player after a talk, in ticks of the game clock (60 a second). */
export const FACE_TICKS = 45;

/** After the talk the clock starts to count; when it has run out, whoever turned to the player looks away again. */
function letGo(state: GameState): GameState {
  const { face } = state;
  if (!face || state.dialogue || state.battle || state.learn || state.shop) return state;
  if (face.until === undefined) return { ...state, face: { ...face, until: state.clock + FACE_TICKS } };
  return state.clock >= face.until ? { ...state, face: null } : state;
}

/**
 * The player is somewhere with another name than a moment ago: the label with the name comes down. Another map
 * always shows it (the way there has told the status region already), and so does the start of the game. A named
 * part of a map shows it on the way in and tells the status region; back out into the open map nothing is shown,
 * it is still the same place. Staying where you are never shows it again.
 */
function arrived(state: GameState, from: string, ctx: Ctx): GameState {
  if (state.scene !== 'world') return state;
  const map = ctx.world.maps[state.map]!;
  const area = areaAt(map, state.x, state.y);
  if (area === state.area) return state;
  const sameMap = state.map === from && state.area !== '';
  if (sameMap && area === map.name) return { ...state, area };
  if (sameMap) ctx.events.push({ kind: 'place', text: area });
  // One label at a time: the name takes the place of a note that is still out.
  return { ...state, area, banner: { text: area, at: state.clock, slide: !ctx.instant }, notice: null };
}

const idle = (state: GameState) => !state.walk && !state.dialogue && !state.battle && !state.menu && !state.learn && !state.shop && state.scene === 'world';

/** What the player does on the map this tick: carry on walking, open the bag, ask for a hint, talk or step. */
function act(state: GameState, input: Input, ctx: Ctx): GameState {
  const { world } = ctx;
  if (state.walk) {
    // With reduced motion a step that was under way (the setting changed mid-step) is finished at once.
    const ticks = state.walk.jump ? JUMP_TICKS : WALK_TICKS;
    const t = ctx.instant ? ticks : state.walk.t + 1;
    if (t < ticks) return { ...state, walk: { ...state.walk, t } };
    const arrived = arrive({ ...state, walk: null }, ctx);
    // On slippery ground the slide goes on, whatever is held.
    const sliding = glide(arrived, ctx, state.walk.slide ?? (state.walk.jump ? 2 : 1));
    if (sliding.walk) return sliding;
    // Still holding the direction: keep walking without a pause between the cells.
    return idle(arrived) && input.dir ? tryMove(arrived, input.dir, ctx) : arrived;
  }
  if (input.start) {
    ctx.cues.push('confirm');
    // The coins are on the screen of the menu; where there is a shop to spend them in, they are told too.
    const purse = Object.keys(world.shops).length > 0 ? `. You have ${money(state.coins, world)}.` : '';
    ctx.events.push({ kind: 'menu', text: `Menu${purse}` });
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
  const ctx: Ctx = { world, events: [], cues: [], instant: options.instant ?? false, pressed: input.pressed !== null };
  // The talk is over (no text, no battle, no offer left): whoever turned to the player turns back, a moment later.
  const done = (next: GameState): Result => ({ state: letGo(arrived(next, state.map, ctx)), events: ctx.events, cues: ctx.cues });

  if (state.scene === 'ending') return done(state);
  if (state.scene === 'title') {
    // B on the title asks for the other mode, Game Boy or Game Boy Color: whoever draws the screen switches it.
    if (input.b) {
      ctx.cues.push('mode');
      return done(state);
    }
    if (!input.a && !input.start) return done(state);
    ctx.cues.push('confirm');
    return done(runScript({ ...state, scene: 'world', script: [{ say: world.intro }] }, ctx));
  }
  // A rest is being played through: every key waits, and then whatever comes after it runs.
  if (state.pause) {
    const left = ctx.instant ? 0 : state.pause - 1;
    if (left > 0) return done({ ...state, pause: left });
    return done(runScript({ ...state, pause: undefined, rest: undefined }, ctx));
  }
  if (state.dialogue) return done(stepDialogue(state, input, ctx));
  if (state.battle) {
    const next = stepBattle(state, input, ctx);
    return done(next.battle ? next : runScript(next, ctx));
  }
  if (state.learn) return done(stepLearn(state, input, ctx));
  if (state.shop) {
    const shopped = stepShop(state, input, ctx);
    if (!shopped.left) return done(shopped.state);
    // Out of the shop: a goodbye, and then whatever was still waiting.
    const bye = world.shops[state.shop.id]?.bye;
    return done(runScript(bye ? { ...shopped.state, script: [{ say: bye }, ...shopped.state.script] } : shopped.state, ctx));
  }
  if (state.menu) return done(stepMenu(state, input, ctx));

  // The player first, then the town: someone you just turned to and talk to has not walked off in between.
  const next = act(state, input, ctx);
  const clock = state.clock + (ctx.instant ? WALK_TICKS : 1);
  if (next.scene !== 'world' || next.dialogue || next.battle || next.menu || next.learn || next.shop) return done({ ...next, clock });
  return done(stroll(next, world, clock, ctx.instant, (object) => gone(object, next)));
}
