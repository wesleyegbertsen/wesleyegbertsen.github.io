import type { BadgeDef, EnemyDef, ItemDef, MoveDef } from '../engine/types.ts';

/**
 * Battle numbers and names. HOW TO EDIT
 *
 * - Damage is the move's power, give or take 1. `accuracy` is the chance to hit (1 = always).
 * - The first move in PLAYER_MOVES is the default one. A test (balance.test.ts) proves that every enemy can be
 *   beaten with that move alone, from full energy, at the worst luck. If you make an enemy tougher than that,
 *   the test fails and tells you which one.
 * - `sprite` is a name from scripts/sprites/enemies.mjs.
 */

/** Energy (HP) at the start, and what each badge adds. */
export const BASE_HP = 30;
export const HP_PER_BADGE = 5;

export const MOVES: Record<string, MoveDef> = {
  debug: { name: 'DEBUG', power: 7, accuracy: 1, pp: 25 },
  refactor: { name: 'REFACTOR', power: 11, accuracy: 0.9, pp: 10 },
  deploy: { name: 'DEPLOY', power: 16, accuracy: 0.7, pp: 5 },
  break: { name: 'COFFEE BREAK', power: 0, accuracy: 1, pp: 5, heal: 15 },
};

export const PLAYER_MOVES = ['debug', 'refactor', 'deploy', 'break'];

/** What Fight does when every move is out of PP. */
export const FALLBACK_MOVE: MoveDef = { name: 'PANIC FIX', power: 4, accuracy: 1, pp: 0 };

const attack = (name: string, power: number, accuracy = 1): MoveDef => ({ name, power, accuracy, pp: 0 });

export const ENEMIES: Record<string, EnemyDef> = {
  bug: {
    name: 'BUG',
    hp: 12,
    sprite: 'bug',
    moves: [attack('NULL POINTER', 3, 0.9), attack('OFF BY ONE', 2)],
    defeat: 'The BUG is fixed! It works on your machine now.',
  },
  exam: {
    name: 'FINAL EXAM',
    hp: 28,
    sprite: 'exam',
    moves: [attack('TRICK QUESTION', 4, 0.85), attack('TIME PRESSURE', 3)],
    defeat: 'FINAL EXAM is passed! With flying colours.',
  },
  legacy: {
    name: 'LEGACY CODE',
    hp: 34,
    sprite: 'legacy',
    moves: [attack('SPAGHETTI', 4, 0.9), attack('NO COMMENTS', 3)],
    defeat: 'LEGACY CODE is refactored! It even has tests now.',
  },
  scope: {
    name: 'SCOPE CREEP',
    hp: 32,
    sprite: 'scope',
    moves: [attack('ONE MORE THING', 4, 0.9), attack('QUICK QUESTION', 3)],
    defeat: 'SCOPE CREEP is back in the backlog! The project ships.',
  },
  deadline: {
    name: 'DEADLINE',
    hp: 36,
    sprite: 'deadline',
    moves: [attack('IT IS DUE TODAY', 4, 0.85), attack('TICK TOCK', 3)],
    defeat: 'DEADLINE is met! With a day to spare.',
  },
};

export const ITEMS: Record<string, ItemDef> = {
  coffee: { name: 'COFFEE', description: 'Restores 20 energy.', heal: 20 },
  pizza: { name: 'PIZZA', description: 'Restores all energy.', heal: 99 },
  diploma: { name: 'DIPLOMA', description: 'Proof that the Academy let you go.' },
  keycard: { name: 'KEY CARD', description: 'Opens the server room in the Office.' },
  librarycard: { name: 'LIBRARY CARD', description: 'Opens the Library.' },
  duck: { name: 'RUBBER DUCK', description: 'Explain your problem to it. It listens.' },
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
