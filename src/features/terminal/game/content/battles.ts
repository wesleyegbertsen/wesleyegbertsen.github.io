import type { BadgeDef, Economy, EnemyDef, ItemDef, Levels, MoveDef, ShopDef } from '../engine/types.ts';

/**
 * Battle numbers and names. HOW TO EDIT
 *
 * - Damage is the move's power, give or take 1. `accuracy` is the chance to hit (1 = always).
 * - The first move in PLAYER_MOVES is the default one, and the one move that can never be swapped out. A test
 *   (world.test.ts) proves that every enemy can be beaten with that move alone, from full energy, at the worst
 *   luck, by a player who is as low in level as that place allows. If you make an enemy tougher than that, the
 *   test fails and tells you which one.
 * - `sprite` is a name from scripts/sprites/enemies.mjs. `level` is what an enemy is worth in XP and the lowest
 *   level it shows up at. A wild enemy gets a level from the range of its AREA; each level above its own adds
 *   LEVELS.enemyHpPerLevel HP.
 * - LEVELS is how the player grows; LEARN is the move that is offered at a level. A new move needs an entry in
 *   MOVES first. `heal` makes a move restore energy instead of hitting.
 * - AREAS says who lives in the tall grass of each map, how often they jump out (`rate`, per step) and how strong
 *   they are. `minLevel` is the lowest level a player can have there: 1 for places that are open from the start;
 *   higher only where a door asks for that level (the cave mouth). BOSS_MIN_LEVEL is the same for bosses. The
 *   three of the last fight (FINAL_BOSSES) are met with four badges at level FINAL_LEVEL or more.
 * - ECONOMY is the money: its name, what the player starts with, what a win drops per level of the enemy (a wild
 *   one, and a boss), and how many of one item the bag takes when buying. SHOPS is what each shop sells and for
 *   how much: an entry needs an item from ITEMS. An item can restore energy (`heal`), the PP of every move
 *   (`restore`) or keep wild enemies away for a number of steps in the tall grass (`repel`).
 * - Nothing in a shop may ever be needed: the balance promise above is made for a player who buys nothing, and
 *   the bot that proves the game can be finished never spends a coin.
 */

/** Energy (HP) at the start, and what each badge adds. */
export const BASE_HP = 30;
export const HP_PER_BADGE = 5;

/** Levels: 1 to 10. XP for a win is the enemy's level times `wildXp` (or `bossXp` for a boss). */
export const LEVELS: Levels = {
  max: 10,
  // Total XP for level 2, 3, 4, 5, 6, 7, 8, 9, 10.
  xp: [10, 25, 45, 70, 100, 140, 190, 250, 320],
  hpPerLevel: 3,
  levelsPerPower: 2,
  wildXp: 3,
  bossXp: 10,
  enemyHpPerLevel: 2,
};

export const MOVES: Record<string, MoveDef> = {
  debug: { name: 'DEBUG', power: 7, accuracy: 1, pp: 25 },
  refactor: { name: 'REFACTOR', power: 11, accuracy: 0.9, pp: 10 },
  deploy: { name: 'DEPLOY', power: 16, accuracy: 0.7, pp: 5 },
  break: { name: 'COFFEE BREAK', power: 0, accuracy: 1, pp: 5, heal: 15 },
  // Offered at a level (see LEARN).
  hotfix: { name: 'HOTFIX', power: 13, accuracy: 0.95, pp: 10 },
  rewrite: { name: 'BIG REWRITE', power: 24, accuracy: 0.75, pp: 4 },
  // Spare ones: put one in LEARN to offer it.
  pairup: { name: 'PAIR UP', power: 9, accuracy: 1, pp: 15 },
  nap: { name: 'POWER NAP', power: 0, accuracy: 1, pp: 3, heal: 30 },
};

export const PLAYER_MOVES = ['debug', 'refactor', 'deploy', 'break'];

/** The move that is offered on reaching a level. The player picks which move it replaces, or keeps what they have. */
export const LEARN: Record<number, string> = { 5: 'hotfix', 10: 'rewrite' };

/** What Fight does when every move is out of PP. */
export const FALLBACK_MOVE: MoveDef = { name: 'PANIC FIX', power: 4, accuracy: 1, pp: 0 };

const attack = (name: string, power: number, accuracy = 1): MoveDef => ({ name, power, accuracy, pp: 0 });

export const ENEMIES: Record<string, EnemyDef> = {
  // --- the meadows of Career Town --------------------------------------------------------------------------------
  bug: {
    name: 'BUG',
    level: 1,
    hp: 12,
    sprite: 'bug',
    moves: [attack('CRASH', 3, 0.9), attack('OFF BY ONE', 2)],
    defeat: 'The BUG is fixed! It works on your machine now.',
  },
  typo: {
    name: 'TYPO',
    level: 1,
    hp: 10,
    sprite: 'typo',
    moves: [attack('TEH', 2), attack('RECIEVE', 3, 0.8)],
    defeat: 'The TYPO is corrected! Spell check approves.',
  },
  lint: {
    name: 'LINT WARNING',
    level: 1,
    hp: 11,
    sprite: 'lint',
    moves: [attack('UNUSED VARIABLE', 2), attack('MISSING SEMICOLON', 2, 0.9)],
    defeat: 'LINT WARNING is resolved! Zero problems.',
  },
  todo: {
    name: 'TODO',
    level: 2,
    hp: 14,
    sprite: 'todo',
    moves: [attack('FIX LATER', 3, 0.9), attack('TEMPORARY HACK', 2)],
    defeat: 'The TODO is done! Only 99 more to go.',
  },

  // --- the east route, on the way to Hobby Hills -----------------------------------------------------------------
  popup: {
    name: 'POPUP',
    level: 2,
    hp: 16,
    sprite: 'popup',
    moves: [attack('ACCEPT ALL', 3), attack('NEWSLETTER', 4, 0.8)],
    defeat: 'The POPUP is closed! It will not ask again. Today.',
  },
  spam: {
    name: 'SPAM',
    level: 2,
    hp: 15,
    sprite: 'spam',
    moves: [attack('YOU WON', 3, 0.9), attack('REPLY ALL', 3)],
    defeat: 'The SPAM is filtered! Inbox zero.',
  },
  lag: {
    name: 'LAG',
    level: 3,
    hp: 18,
    sprite: 'lag',
    moves: [attack('RUBBER BAND', 4, 0.85), attack('PING 999', 3)],
    defeat: 'The LAG is gone! Sixty frames a second.',
  },
  update: {
    name: 'FORCED UPDATE',
    level: 3,
    hp: 20,
    sprite: 'update',
    moves: [attack('RESTART NOW', 4, 0.9), attack('1 OF 99', 3)],
    defeat: 'FORCED UPDATE is installed! Nothing moved. Much.',
  },

  // --- the west route, on the way to the mountain ----------------------------------------------------------------
  flaky: {
    name: 'FLAKY TEST',
    level: 3,
    hp: 20,
    sprite: 'flaky',
    moves: [attack('RED BUILD', 4, 0.8), attack('WORKS LOCALLY', 3)],
    defeat: 'FLAKY TEST is stable! Green three times in a row.',
  },
  debt: {
    name: 'TECH DEBT',
    level: 4,
    hp: 24,
    sprite: 'debt',
    moves: [attack('QUICK HACK', 4, 0.9), attack('INTEREST', 3)],
    defeat: 'TECH DEBT is paid off! For this sprint.',
  },
  meeting: {
    name: 'LONG MEETING',
    level: 3,
    hp: 22,
    sprite: 'meeting',
    moves: [attack('NO AGENDA', 3), attack('RUNS OVER', 4, 0.85)],
    defeat: 'LONG MEETING is over! It could have been an email.',
  },

  // --- the cave: what goes wrong on production -------------------------------------------------------------------
  memleak: {
    name: 'MEMORY LEAK',
    level: 4,
    hp: 26,
    sprite: 'memleak',
    moves: [attack('HEAP GROWS', 5, 0.9), attack('SWAP STORM', 4)],
    defeat: 'MEMORY LEAK is plugged! The graph is flat again.',
  },
  nullptr: {
    name: 'NULL POINTER',
    level: 4,
    hp: 24,
    sprite: 'nullptr',
    moves: [attack('SEGFAULT', 5, 0.85), attack('UNDEFINED', 4)],
    defeat: 'NULL POINTER is checked! It points at something now.',
  },
  race: {
    name: 'RACE CONDITION',
    level: 5,
    hp: 28,
    sprite: 'race',
    moves: [attack('DATA RACE', 5, 0.9), attack('DEADLOCK', 4)],
    defeat: 'RACE CONDITION is locked down! One at a time, please.',
  },
  droptable: {
    name: 'DROPPED TABLE',
    level: 5,
    hp: 30,
    sprite: 'droptable',
    moves: [attack('NO BACKUP', 6, 0.8), attack('CASCADE', 4)],
    defeat: 'DROPPED TABLE is restored! The backup worked.',
  },
  error500: {
    name: '500 ERROR',
    level: 6,
    hp: 32,
    sprite: 'error500',
    moves: [attack('STACK TRACE', 5), attack('RETRY STORM', 5, 0.9)],
    defeat: '500 ERROR is handled! 200 OK.',
  },
  friday: {
    name: 'FRIDAY DEPLOY',
    level: 6,
    hp: 30,
    sprite: 'friday',
    moves: [attack('SHIP IT', 6, 0.8), attack('ROLLBACK', 5)],
    defeat: 'FRIDAY DEPLOY is rolled back! See you on Monday.',
  },
  diskfull: {
    name: 'DISK FULL',
    level: 7,
    hp: 36,
    sprite: 'diskfull',
    moves: [attack('LOG FLOOD', 5), attack('NO SPACE LEFT', 4, 0.9)],
    defeat: 'DISK FULL is cleaned up! 40 GB of logs, gone.',
  },

  // --- the bosses --------------------------------------------------------------------------------------------------
  exam: {
    name: 'FINAL EXAM',
    level: 3,
    hp: 28,
    sprite: 'exam',
    moves: [attack('TRICK QUESTION', 4, 0.85), attack('TIME PRESSURE', 3)],
    defeat: 'FINAL EXAM is passed! With flying colours.',
  },
  legacy: {
    name: 'LEGACY CODE',
    level: 5,
    hp: 34,
    sprite: 'legacy',
    moves: [attack('SPAGHETTI', 4, 0.9), attack('NO COMMENTS', 3)],
    defeat: 'LEGACY CODE is refactored! It even has tests now.',
  },
  scope: {
    name: 'SCOPE CREEP',
    level: 6,
    hp: 32,
    sprite: 'scope',
    moves: [attack('ONE MORE THING', 4, 0.9), attack('QUICK QUESTION', 3)],
    defeat: 'SCOPE CREEP is back in the backlog! The project ships.',
  },
  deadline: {
    name: 'DEADLINE',
    level: 7,
    hp: 36,
    sprite: 'deadline',
    moves: [attack('IT IS DUE TODAY', 4, 0.85), attack('TICK TOCK', 3)],
    defeat: 'DEADLINE is met! With a day to spare.',
  },
  // The last fight, in the Contact Office. `tune` is their own battle music.
  interview: {
    name: 'JOB INTERVIEW',
    level: 8,
    hp: 63,
    sprite: 'interview',
    tune: 'final',
    moves: [attack('WHITEBOARD', 7, 0.9), attack('LIVE CODING', 6), attack('ANY QUESTIONS', 5)],
    defeat: 'JOB INTERVIEW is passed! When can you start?',
  },
  review: {
    name: 'YEARLY REVIEW',
    level: 9,
    hp: 72,
    sprite: 'review',
    tune: 'final',
    moves: [attack('MEETS EXPECTATIONS', 6), attack('STRETCH GOALS', 7, 0.9), attack('FEEDBACK SANDWICH', 5)],
    defeat: 'YEARLY REVIEW is done! Exceeds expectations.',
  },
  impostor: {
    name: 'THE IMPOSTOR',
    level: 10,
    hp: 81,
    sprite: 'impostor',
    tune: 'final',
    moves: [attack('THEY WILL FIND OUT', 7, 0.9), attack('JUST LUCK', 6), attack('COMPARE YOURSELF', 7, 0.85)],
    defeat: 'THE IMPOSTOR fades! You belonged here all along.',
  },
  outage: {
    name: 'THE OUTAGE',
    level: 10,
    hp: 56,
    sprite: 'outage',
    moves: [attack('ALL RED', 5, 0.9), attack('PAGER STORM', 5), attack('STATUS: DOWN', 4)],
    defeat: 'THE OUTAGE is over! All systems operational.',
  },
};

export type Area = {
  /** The lowest level a player can have here. Above 1 only where a door asks for it. */
  minLevel: number;
  /** The range of levels of the wild enemies. */
  levels: [number, number];
  /** The chance of a wild enemy per step in the tall grass. */
  rate: number;
  enemies: string[];
};

/** Who lives in the tall grass, per map. */
export const AREAS: Record<string, Area> = {
  town: { minLevel: 1, levels: [1, 2], rate: 0.15, enemies: ['bug', 'typo', 'lint', 'todo'] },
  east: { minLevel: 1, levels: [2, 4], rate: 0.14, enemies: ['popup', 'spam', 'lag', 'update'] },
  west: { minLevel: 1, levels: [3, 5], rate: 0.14, enemies: ['flaky', 'debt', 'meeting'] },
  cave: { minLevel: 3, levels: [4, 7], rate: 0.16, enemies: ['memleak', 'nullptr', 'race', 'droptable', 'error500', 'friday', 'diskfull'] },
};

/**
 * The last fight: what Wesley sends out in the Contact Office, one after the other, with a coffee in between.
 * The office asks for all four badges, and the four badge bosses together are worth level FINAL_LEVEL (a test
 * checks that), so that is the least a player can be here.
 */
export const FINAL_BOSSES = ['interview', 'review', 'impostor'];
export const FINAL_LEVEL = 8;

/** The level the cave mouth asks for, and the one the door to its last chamber asks for. */
export const CAVE_LEVEL = AREAS.cave!.minLevel;
export const DEEP_CAVE_LEVEL = 5;

/** The lowest level a player can have when facing each boss. The four badge bosses can be met at level 1. */
export const BOSS_MIN_LEVEL: Record<string, number> = {
  exam: 1,
  legacy: 1,
  scope: 1,
  deadline: 1,
  outage: DEEP_CAVE_LEVEL,
  interview: FINAL_LEVEL,
  review: FINAL_LEVEL,
  impostor: FINAL_LEVEL,
};

/** The bag shows the items in this order. */
export const ITEMS: Record<string, ItemDef> = {
  stroopwafel: { name: 'STROOPWAFEL', description: 'Restores 10 energy.', heal: 10 },
  coffee: { name: 'COFFEE', description: 'Restores 20 energy.', heal: 20 },
  energydrink: { name: 'ENERGY DRINK', description: 'Restores 40 energy.', heal: 40 },
  tea: { name: 'GREEN TEA', description: 'Restores the PP of every move.', restore: true },
  spray: { name: 'BUG SPRAY', description: 'No wild enemies for 60 steps in tall grass.', repel: 60 },
  pizza: { name: 'PIZZA', description: 'Restores all energy.', heal: 99 },
  bento: { name: 'BENTO', description: 'Restores all energy. Made with care.', heal: 99 },
  diploma: { name: 'DIPLOMA', description: 'Proof that the Academy let you go.' },
  keycard: { name: 'KEY CARD', description: 'Opens the server room in the Office.' },
  librarycard: { name: 'LIBRARY CARD', description: 'Opens the Library.' },
  duck: { name: 'RUBBER DUCK', description: 'Explain your problem to it. It listens.' },
  letter: { name: 'LETTER', description: 'For the head librarian.' },
  star: { name: 'GOLD STAR', description: 'Shiny. A collector in town wants them all.' },
  trophy: { name: 'TROPHY', description: 'Proof that you looked under every rock.' },
  stamp: { name: 'HOBBY STAMP', description: 'From the stamp rally in HOBBY HILLS. Ten make a full card.' },
  omamori: { name: 'OMAMORI', description: 'A lucky charm for a full stamp card.' },
  medal: { name: 'UPTIME MEDAL', description: 'Five nines. You ended THE OUTAGE.' },
};

/** The items that are hidden all over the maps and counted on the Start menu: gold stars and hobby stamps. */
export const COLLECT = 'star';
export const STAMP = 'stamp';

/**
 * Money. A win drops the enemy's level times `wildCoins` (a wild one) or `bossCoins` (a boss): a Lv 3 FLAKY TEST
 * leaves 6 COINS, the FINAL EXAM 30. `bagLimit` is how many of one item the shop will sell you.
 */
export const ECONOMY: Economy = { currency: 'COINS', start: 15, wildCoins: 2, bossCoins: 10, bagLimit: 9 };

/** The shops: what is on the shelf, in this order, and the price. `bye` is said on the way out. */
export const SHOPS: Record<string, ShopDef> = {
  cafe: {
    name: 'CAFE SHOP',
    stock: [
      { item: 'stroopwafel', price: 5 },
      { item: 'coffee', price: 10 },
      { item: 'energydrink', price: 25 },
      { item: 'tea', price: 30 },
      { item: 'spray', price: 20 },
      { item: 'pizza', price: 60 },
    ],
    bye: ['Thanks! Come back any time.'],
  },
};

/** What the player carries at the start. */
export const START_ITEMS: Record<string, number> = { coffee: 2 };

/** One badge per building, in the order the badge case shows them. */
export const BADGES: BadgeDef[] = [
  { id: 'education', name: 'DEGREE BADGE' },
  { id: 'experience', name: 'CAREER BADGE' },
  { id: 'projects', name: 'MAKER BADGE' },
  { id: 'skills', name: 'SKILL BADGE' },
];
