import type { EnemyDef, GameState, World } from './types.ts';

/**
 * How the player grows: levels from XP, and what a level is worth. Pure numbers, read from `world.levels`
 * (content/battles.ts), so the balance test and the game always agree.
 */

/** The level that goes with this much XP. */
export function levelFor(xp: number, world: World): number {
  return Math.min(world.levels.max, 1 + world.levels.xp.filter((needed) => xp >= needed).length);
}

/** The total XP at which a level starts. */
export const xpAt = (level: number, world: World): number => (level <= 1 ? 0 : (world.levels.xp[level - 2] ?? Infinity));

/** How far the player is into the current level, for the XP bar: `into` of `span`. At the top level there is nothing left to gain. */
export function xpProgress(state: Pick<GameState, 'level' | 'xp'>, world: World): { into: number; span: number } | null {
  if (state.level >= world.levels.max) return null;
  const from = xpAt(state.level, world);
  return { into: Math.max(0, state.xp - from), span: xpAt(state.level + 1, world) - from };
}

/** What every attack of the player does more at this level. */
export const attackBonus = (level: number, world: World): number => Math.floor((level - 1) / world.levels.levelsPerPower);

/** The player's max energy: the base, the badges, the level and what was won for good. */
export const maxHpOf = (world: World, state: Pick<GameState, 'badges' | 'level' | 'bonusHp'>): number =>
  world.baseHp + world.hpPerBadge * state.badges.length + world.levels.hpPerLevel * (state.level - 1) + state.bonusHp;

/** The HP of an enemy that shows up at `level`: its own, plus a little for every level above its own. */
export const enemyHpAt = (enemy: EnemyDef, level: number, world: World): number =>
  enemy.hp + Math.max(0, level - enemy.level) * world.levels.enemyHpPerLevel;

/** The XP a win is worth: more per level of the enemy, and much more for one that stood guard. */
export const xpFor = (level: number, wild: boolean, world: World): number => level * (wild ? world.levels.wildXp : world.levels.bossXp);
