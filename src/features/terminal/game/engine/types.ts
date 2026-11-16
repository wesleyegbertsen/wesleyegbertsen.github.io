/** The shapes the engine works on. Nothing here knows about React, the DOM or the canvas. */

export type Dir = 'up' | 'down' | 'left' | 'right';

/** A test on the player's progress. Every field that is given must hold. */
export type Cond = {
  flag?: string;
  notFlag?: string;
  /** Carries at least one of this item. */
  item?: string;
  /** Carries none of this item. */
  noItem?: string;
  /** Has at least this many badges. */
  badges?: number;
  /** Carries at least `min` of an item (the collector counts stars). */
  count?: { item: string; min: number };
  /** Is at least this level (the cave mouth). */
  level?: number;
};

/** A place, named by an object's character on a map (plus an offset), so maps can be redrawn freely. */
export type Spot = { map: string; at: string; dx?: number; dy?: number; dir?: Dir };

/** One thing that happens when the player talks to, opens or steps on something. They run in order. */
export type Action =
  | { say: string[] }
  /** `quiet`: no text box, only a line for the status region and a sound (a star picked up in passing). */
  | { give: string; quiet?: true }
  | { take: string }
  /** `cue`: a sound to go with it (a hidden way that opens). */
  | { flag: string; cue?: Cue }
  /** Takes flags back (a riddle that starts over after a wrong answer). */
  | { unflag: string[] }
  /** Puts every pushed thing of this map back where the map put it (a reset lever). See engine/push.ts. */
  | { reset: true }
  | { badge: string }
  /**
   * Restores energy and moves. `rest`: a real rest (the cafe), with its jingle (the cue `rest`) played through for
   * this many ticks before the next action runs; with reduced motion the next action runs at once.
   */
  | { heal: true; rest?: number }
  /** `quick`: this battle follows another one at once (the last fight), so the way into it is the short one. */
  | { battle: string; win: Action[]; quick?: true }
  /** `cue`: what the way sounds like. A door by default; `path` for the edge of a map, `cave` for a cave mouth. */
  | { warp: Spot; cue?: Cue }
  /** Max energy grows by this much, for good (the prize at the end of the cave). */
  | { boost: number }
  /** Offers a new move: the player picks one to replace, or keeps what they have. */
  | { learn: string }
  /** Hands over this many coins, with a line that says so. */
  | { coins: number }
  /** Opens a shop (a name in `world.shops`): a list to buy from, until the player leaves it. */
  | { shop: string }
  | { ending: true };

/** What an object does while `when` holds. The first branch that holds is the one that runs. */
export type Branch = {
  when?: Cond;
  do: Action[];
  /** For things you step on: whether the player may walk onto it. Defaults to "it warps somewhere". */
  pass?: boolean;
};

export type GameObject = {
  /** `<map>:<character>`. */
  id: string;
  x: number;
  y: number;
  /** A name on the tile or the sprite sheet. Without one the object is an invisible marker. */
  sprite?: string;
  /** Animated: the sheet also has `<sprite>-b`, and the two take turns (the fountain). */
  animated?: boolean;
  /** A different sprite once a flag is set (an opened chest). */
  spriteWhen?: { flag: string; sprite: string };
  /** Gone from the map once this holds (a beaten boss). */
  hideWhen?: Cond;
  solid: boolean;
  /** `interact`: press A while facing it. `step`: walk onto it (or into it, when it does not let you pass). */
  trigger: 'interact' | 'step';
  branches: Branch[];
  /**
   * Strolls about: every `every` ticks of the game clock it may take a step, never further than `radius` cells
   * from where the map puts it, never onto a road. See wander.ts.
   */
  wander?: { radius: number; every: number };
  /**
   * Can be pushed: walking into it moves it one cell on when that cell is free, and the player steps after it.
   * The text is what the status region calls it ("boulder"). See engine/push.ts.
   */
  push?: string;
};

export type TileDef = {
  sprite: string;
  /** A tile drawn first, for sprites with see-through parts (a desk on a floor). */
  under?: string;
  solid: boolean;
  /** Tall grass: wild enemies may appear. */
  grass?: boolean;
  /** A road: townsfolk never stroll onto it, so the way between the doors is always free. */
  road?: boolean;
  /** Animated: the sheet also has `<sprite>-b`, and the two take turns. */
  animated?: boolean;
  /**
   * A ledge: a step in the ground that is jumped in this direction only. Walking onto it that way hops over it
   * and lands on the cell behind it; from every other side it is a wall. A ledge is `solid`, so nobody strolls
   * onto it.
   */
  ledge?: Dir;
  /** A pressure plate: a pushed thing can be left on it. Every plate of a map covered solves the map's `plates`. */
  plate?: boolean;
  /** Slippery: whoever steps onto it keeps going the same way until something stops them, or the ground does. */
  slide?: boolean;
  /** A light in a dark place: this many cells around it are lit, like around the player (a brazier). */
  light?: number;
  /** What the status region calls it when it stops a slide ("a rock"). Without one it is "the wall". */
  name?: string;
  /**
   * Joins its neighbours (a fence): each cell is drawn by the sides it shares with more of the same tile, as
   * `<sprite>-<sides>` (`fence-ew` for a run across, `fence-ns` up and down, `fence-es` a corner...). parseMap
   * picks the picture and writes it in `look`.
   */
  join?: true;
  /** The picture drawn for this cell when it is not `sprite` (picked by parseMap for a tile that joins). */
  look?: string;
};

/** A named part of a map: a rectangle of cells. Walking into it shows its name, like walking onto another map does. */
export type Region = { name: string; x: number; y: number; w: number; h: number };

export type GameMap = {
  id: string;
  name: string;
  /** The parts of this map that have a name of their own (a plaza, the last chamber of the cave). */
  areas?: Region[];
  width: number;
  height: number;
  /** Legend characters, `cells[y][x]`. */
  cells: string[][];
  /** The legend of this map: what each of those characters is. */
  tiles: Record<string, TileDef>;
  objects: GameObject[];
  /**
   * Wild enemies in the tall grass: who, how often (0 to 1 per step) and the range of their levels. An enemy is
   * never below its own level; each level above it adds a little HP.
   */
  encounters?: { enemies: string[]; rate: number; levels?: [number, number] };
  /** A dark place: only this many cells around the player are lit (see engine/light.ts). */
  dark?: number;
  /**
   * The puzzle of the pressure plates: once a pushed thing stands on every plate of the map, `flag` is set for
   * good, `do` runs, and the pushed things stay where they are from then on. `cells` are the plates (parseMap
   * finds them).
   */
  plates?: { flag: string; do: Action[]; cells: { x: number; y: number }[] };
  /** The lights of a dark place (parseMap finds them: the tiles with `light`). */
  lights?: { x: number; y: number; radius: number }[];
};

export type MoveDef = {
  name: string;
  /** Damage is power - 1, power or power + 1. */
  power: number;
  /** Chance to hit, 0 to 1. */
  accuracy: number;
  /** How often the player can use it before resting. Enemies ignore it. */
  pp: number;
  /** Restores this much of the user's HP instead of hitting. */
  heal?: number;
};

export type EnemyDef = {
  name: string;
  /** Its level: what it is worth in XP, and the lowest level it appears at. */
  level: number;
  /** Energy at its own level. */
  hp: number;
  sprite: string;
  moves: MoveDef[];
  /** The line that ends a won battle. */
  defeat: string;
  /** A tune of its own for the battle (a name in content/music.ts), in place of the usual boss tune. */
  tune?: string;
};

export type ItemDef = {
  name: string;
  description: string;
  /** Restores this much energy. */
  heal?: number;
  /** Restores the PP of every move. */
  restore?: true;
  /** Keeps wild enemies away for this many steps in the tall grass. Used from the bag, not in a battle. */
  repel?: number;
};
/** A shop: what it sells and for how much, and what is said on the way out. */
export type ShopDef = { name: string; stock: { item: string; price: number }[]; bye?: string[] };
/** Money: what it is called, what the player starts with, what a win is worth per level of the enemy, and how many of one item fit the bag when buying. */
export type Economy = { currency: string; start: number; wildCoins: number; bossCoins: number; bagLimit: number };
export type BadgeDef = { id: string; name: string };

/** Everything the content modules hand to the engine. */
export type World = {
  title: string;
  subtitle: string;
  maps: Record<string, GameMap>;
  start: Spot;
  /**
   * Where every defeat brings the player back to (the cafe), whatever was the last place rested at. Without it a
   * defeat goes back to the last place that healed (`heal` in the state).
   */
  respawn?: Spot;
  items: Record<string, ItemDef>;
  startItems: Record<string, number>;
  moves: Record<string, MoveDef>;
  /** The player's moves, in menu order. The first one is the default. */
  playerMoves: string[];
  /** What Fight does when every move is out of PP, so a battle can always go on. */
  fallbackMove: MoveDef;
  enemies: Record<string, EnemyDef>;
  badges: BadgeDef[];
  baseHp: number;
  hpPerBadge: number;
  /** How the player grows. See engine/level.ts. */
  levels: Levels;
  /** The move that is offered on reaching a level. */
  learn: Record<number, string>;
  /** Money and the shops it is spent in. See engine/shop.ts. */
  economy: Economy;
  shops: Record<string, ShopDef>;
  intro: string[];
  /** What Select says: the first hint whose condition holds. */
  hints: { when?: Cond; text: string }[];
  /** Lines of the ending screen. */
  ending: string[];
  /** The things to collect, counted on the Start menu: the item and how many of it the maps hide. */
  collect?: Collect[];
  /** Which tune plays where: names of tracks in content/music.ts. A map without an entry plays `indoors`. */
  music?: { title: string; ending: string; wild: string; boss: string; victory: string; indoors: string; maps: Record<string, string> };
};

/**
 * `label` is the word on the Start menu, `mark` the sign before the count in the corner note. `icon` is a small
 * picture (8 by 8, a name on the sheets) drawn in the place of the mark, and before the label on the menu.
 */
export type Collect = { item: string; total: number; label: string; mark: string; icon?: string };

export type Levels = {
  /** The highest level. */
  max: number;
  /** The total XP needed for level 2, 3, 4... one entry per level after the first. */
  xp: number[];
  /** Max energy added per level. */
  hpPerLevel: number;
  /** Every this many levels, each attack does one more damage. */
  levelsPerPower: number;
  /** XP for a win, per level of the enemy: a wild one, and one that stood guard (a boss). */
  wildXp: number;
  bossXp: number;
  /** HP a wild enemy has more per level above its own. */
  enemyHpPerLevel: number;
};

export type Dialogue = { pages: string[][]; page: number; shown: number };
/** The Start menu: the bag, the badge case and the settings. */
export type Menu = { tab: 'items' | 'badges' | 'settings'; cursor: number };
/** The rows of the settings tab, in order. */
export const SETTINGS = ['sound', 'volume', 'screen', 'mode'] as const;
/**
 * The offer of a new move: the cursor runs over the moves that can make room, and a last entry that keeps them.
 * `confirm` is there while the game asks whether to really forget the move under the cursor: 0 on YES, 1 on NO.
 */
export type Learn = { move: string; cursor: number; confirm?: 0 | 1 };
/**
 * An open shop: the cursor runs over its stock and a last entry that leaves. `amount` is how many of the item
 * under the cursor A buys (left and right change it; 1 on every new row). `note` is what the last press led to
 * (how many and for how much, bought, too dear, bag full).
 */
export type Shopping = { id: string; cursor: number; amount: number; note: string };

/** One line of a battle. HP, XP and level values in it take effect when the line appears. */
export type BattleStep = { text: string; enemyHp?: number; hp?: number; xp?: number; level?: number; coins?: number; cheer?: true; cue?: Cue };

export type Battle = {
  enemy: string;
  /** The enemy's level in this battle, and the HP it started with. */
  level: number;
  enemyMax: number;
  /** The enemy is down: the fanfare plays from that line on. */
  cheer: boolean;
  enemyHp: number;
  wild: boolean;
  /** Ticks left of the way in: the transition over the map before the battle screen (engine/transition.ts). 0 once it is up. */
  intro: number;
  /** This boss follows another one at once: the way in is the short one (QUICK_TICKS), with the sound `round`. */
  quick?: true;
  phase: 'steps' | 'menu' | 'moves' | 'items';
  steps: BattleStep[];
  shown: number;
  cursor: number;
  outcome: 'win' | 'lose' | 'run' | null;
  win: Action[];
};

export type GameState = {
  scene: 'title' | 'world' | 'ending';
  map: string;
  x: number;
  y: number;
  dir: Dir;
  /**
   * While walking: where the step started and how many ticks of it have passed. x and y are already the target.
   * `jump`: this step is a hop over a ledge, two cells long, and takes JUMP_TICKS instead of WALK_TICKS.
   * `slide`: this step is part of a slide over slippery ground: nobody steered it, and the legs stand still. The
   * number is how many cells the press that began it has moved the player once this step is done.
   */
  walk: { fromX: number; fromY: number; t: number; jump?: true; slide?: number } | null;
  hp: number;
  maxHp: number;
  /** 1 to `world.levels.max`, and the XP gathered so far. */
  level: number;
  xp: number;
  /** Max energy won for good (a prize), on top of what the level and the badges give. */
  bonusHp: number;
  /** The moves the player knows, in menu order. The first one is the default and is never replaced. */
  moves: string[];
  pp: Record<string, number>;
  items: Record<string, number>;
  flags: Record<string, true>;
  badges: string[];
  dialogue: Dialogue | null;
  /** Actions still to run, once the open dialogue or battle is over. */
  script: Action[];
  battle: Battle | null;
  menu: Menu | null;
  learn: Learn | null;
  shop: Shopping | null;
  /** Money. In memory only, like everything else here. */
  coins: number;
  /** Steps in the tall grass that are still safe from wild enemies (a spray from the shop). */
  repel: number;
  /** Who is being talked to, and which way they turned for it. They turn back a moment after the talk is over: at clock `until`. */
  face: { id: string; dir: Dir; until?: number } | null;
  /**
   * The tall grass that was just walked through: the cells rustle for TRAIL_TICKS of the game clock from `at`.
   * Only with motion; the oldest entries go when they are over.
   */
  trail?: { map: string; x: number; y: number; at: number }[];
  /** Ticks left of a rest that is played through (its jingle): nothing happens until they are over. */
  pause?: number;
  /** The rest that is being played through: how many ticks it takes in all, and the energy before it (the scene). */
  rest?: { ticks: number; from: number };
  /** Where a defeat sends the player back to. */
  heal: { map: string; x: number; y: number; dir?: Dir };
  seed: number;
  finished: boolean;
  /** Ticks spent walking about. Drives the townsfolk and the animated tiles; it stands still in text and battles. */
  clock: number;
  /**
   * Where the things that left their spot are now, by object id: the townsfolk who stroll, and what was pushed.
   * `at` is the clock when the step began.
   */
  roam: Record<string, Roaming>;
  /** A short note in the corner of the map (the star count after a find), shown until the clock reaches `until`. */
  notice: { text: string; until: number } | null;
  /** The name of the place the player is in: a named part of the map, or else the map. Empty before the game starts. */
  area: string;
  /**
   * The label with the name of a place that was just entered. `at` is the clock when it appeared; how far it is
   * out at a given clock is in engine/banner.ts. `slide` is off with reduced motion: it is there, and then it is not.
   */
  banner: { text: string; at: number; slide: boolean } | null;
};

/** `ticks` is how long the step takes when it is not a stroll (a push goes at walking pace). `dir` is the way of the last step; `side` the last step sideways (animals drawn from the side keep it going up or down). */
export type Roaming = { x: number; y: number; fromX: number; fromY: number; at: number; dir?: Dir; side?: 'left' | 'right'; ticks?: number };

/** Something worth telling a screen reader. */
export type GameEvent = {
  kind: 'say' | 'item' | 'badge' | 'battle' | 'place' | 'defeat' | 'menu' | 'ending';
  text: string;
};

export type Input = {
  /** The direction held down. */
  dir: Dir | null;
  /** A direction pressed this tick (menus move once per press). */
  pressed: Dir | null;
  a: boolean;
  b: boolean;
  start: boolean;
  select: boolean;
};

export const NO_INPUT: Input = { dir: null, pressed: null, a: false, b: false, start: false, select: false };

/**
 * Something worth a sound. The engine only names what happened; what it sounds like is in content/music.ts.
 */
export type Cue =
  | 'cursor'
  | 'confirm'
  | 'cancel'
  | 'blip'
  | 'door'
  | 'item'
  /** Coins change hands: picked up, or paid in a shop. */
  | 'coin'
  | 'star'
  | 'badge'
  | 'bump'
  /** A hop over a ledge. */
  | 'jump'
  /** A boulder is pushed a cell on; the player slides over slippery ground; a switch or a plate clicks; a gate opens. */
  | 'push'
  | 'slide'
  | 'switch'
  | 'gate'
  | 'heal'
  /** A rest in the cafe: a jingle of a few seconds, played through before the barista speaks. */
  | 'rest'
  | 'hit'
  | 'hurt'
  | 'miss'
  | 'faint'
  | 'low'
  | 'run'
  | 'encounter'
  /** A boss steps up: the longer sound of the longer transition. */
  | 'showdown'
  /** The next boss of a fight that goes on: the short sound of the short transition. */
  | 'round'
  | 'levelup'
  /** Walking off the edge of a map onto the next one, and going into or out of a cave: not doors. */
  | 'path'
  | 'cave'
  /** The settings of the Start menu: the game turns the sound down or up a step, switches it, switches the LCD look, or switches between Game Boy and Game Boy Color. */
  | 'quieter'
  | 'louder'
  | 'sound'
  | 'screen'
  | 'mode';

export type Result = { state: GameState; events: GameEvent[]; cues: Cue[] };
