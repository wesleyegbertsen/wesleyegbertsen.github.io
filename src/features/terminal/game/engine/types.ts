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
};

/** A place, named by an object's character on a map (plus an offset), so maps can be redrawn freely. */
export type Spot = { map: string; at: string; dx?: number; dy?: number; dir?: Dir };

/** One thing that happens when the player talks to, opens or steps on something. They run in order. */
export type Action =
  | { say: string[] }
  | { give: string }
  | { take: string }
  | { flag: string }
  | { badge: string }
  | { heal: true }
  | { battle: string; win: Action[] }
  | { warp: Spot }
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
  /** A different sprite once a flag is set (an opened chest). */
  spriteWhen?: { flag: string; sprite: string };
  /** Gone from the map once this holds (a beaten boss). */
  hideWhen?: Cond;
  solid: boolean;
  /** `interact`: press A while facing it. `step`: walk onto it (or into it, when it does not let you pass). */
  trigger: 'interact' | 'step';
  branches: Branch[];
};

export type TileDef = {
  sprite: string;
  /** A tile drawn first, for sprites with see-through parts (a desk on a floor). */
  under?: string;
  solid: boolean;
  /** Tall grass: wild enemies may appear. */
  grass?: boolean;
};

export type GameMap = {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Legend characters, `cells[y][x]`. */
  cells: string[][];
  objects: GameObject[];
  encounters?: { enemies: string[]; rate: number };
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
  tiles: Record<string, TileDef>;
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
  intro: string[];
  /** What Select says: the first hint whose condition holds. */
  hints: { when?: Cond; text: string }[];
  /** Lines of the ending screen. */
  ending: string[];
};

export type Dialogue = { pages: string[][]; page: number; shown: number };
export type Menu = { tab: 'items' | 'badges'; cursor: number };

/** One line of a battle. HP values in it take effect when the line appears. */
export type BattleStep = { text: string; enemyHp?: number; hp?: number };

export type Battle = {
  enemy: string;
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
  pp: Record<string, number>;
  items: Record<string, number>;
  flags: Record<string, true>;
  badges: string[];
  dialogue: Dialogue | null;
  /** Actions still to run, once the open dialogue or battle is over. */
  script: Action[];
  battle: Battle | null;
  menu: Menu | null;
  /** Where a defeat sends the player back to. */
  heal: { map: string; x: number; y: number };
  seed: number;
  finished: boolean;
};

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

export type Result = { state: GameState; events: GameEvent[] };
