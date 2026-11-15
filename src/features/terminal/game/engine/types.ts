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
  | { flag: string }
  | { badge: string }
  | { heal: true }
  | { battle: string; win: Action[] }
  | { warp: Spot }
  /** Max energy grows by this much, for good (the prize at the end of the cave). */
  | { boost: number }
  /** Offers a new move: the player picks one to replace, or keeps what they have. */
  | { learn: string }
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
};

export type GameMap = {
  id: string;
  name: string;
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
};

export type ItemDef = { name: string; description: string; heal?: number };
export type BadgeDef = { id: string; name: string };

/** Everything the content modules hand to the engine. */
export type World = {
  title: string;
  subtitle: string;
  maps: Record<string, GameMap>;
  start: Spot;
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

/** `label` is the word on the Start menu, `mark` the sign before the count in the corner note. */
export type Collect = { item: string; total: number; label: string; mark: string };

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
/** The Start menu. `row` says the cursor is on the volume row under the list. */
export type Menu = { tab: 'items' | 'badges'; cursor: number; row?: 'volume' };
/** The offer of a new move: the cursor runs over the moves that can make room, and a last entry that keeps them. */
export type Learn = { move: string; cursor: number };

/** One line of a battle. HP, XP and level values in it take effect when the line appears. */
export type BattleStep = { text: string; enemyHp?: number; hp?: number; xp?: number; level?: number; cheer?: true; cue?: Cue };

export type Battle = {
  enemy: string;
  /** The enemy's level in this battle, and the HP it started with. */
  level: number;
  enemyMax: number;
  /** The enemy is down: the fanfare plays from that line on. */
  cheer: boolean;
  enemyHp: number;
  wild: boolean;
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
  /** While walking: where the step started and how many ticks of it have passed. x and y are already the target. */
  walk: { fromX: number; fromY: number; t: number } | null;
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
  /** Where a defeat sends the player back to. */
  heal: { map: string; x: number; y: number };
  seed: number;
  finished: boolean;
  /** Ticks spent walking about. Drives the townsfolk and the animated tiles; it stands still in text and battles. */
  clock: number;
  /** Where the townsfolk who left their spot are now, by object id. `at` is the clock when the step began. */
  roam: Record<string, Roaming>;
  /** A short note in the corner of the map (the star count after a find), shown until the clock reaches `until`. */
  notice: { text: string; until: number } | null;
};

export type Roaming = { x: number; y: number; fromX: number; fromY: number; at: number };

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
  | 'star'
  | 'badge'
  | 'bump'
  | 'heal'
  | 'hit'
  | 'hurt'
  | 'miss'
  | 'faint'
  | 'low'
  | 'run'
  | 'encounter'
  | 'levelup'
  /** The volume row of the Start menu: the game turns the sound down or up a step. */
  | 'quieter'
  | 'louder';

export type Result = { state: GameState; events: GameEvent[]; cues: Cue[] };
