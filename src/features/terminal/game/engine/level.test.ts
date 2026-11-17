import { attackBonus, enemyHpAt, levelFor, maxHpOf, xpAt, xpFor, xpProgress } from './level.ts';
import { levelWorld as world } from './testWorld.ts';

// levelWorld: levels 1 to 4 at 6, 20 and 40 XP; +3 energy a level; +1 damage every level; base energy 20, +5 a badge.

describe('levels', () => {
  it('turns XP into a level, and stops at the top', () => {
    expect(levelFor(0, world)).toBe(1);
    expect(levelFor(5, world)).toBe(1);
    expect(levelFor(6, world)).toBe(2);
    expect(levelFor(19, world)).toBe(2);
    expect(levelFor(20, world)).toBe(3);
    expect(levelFor(40, world)).toBe(4);
    expect(levelFor(99_999, world)).toBe(world.levels.max);
  });

  it('knows where a level starts and how far into it the player is', () => {
    expect(xpAt(1, world)).toBe(0);
    expect(xpAt(2, world)).toBe(6);
    expect(xpAt(4, world)).toBe(40);
    expect(xpProgress({ level: 1, xp: 4 }, world)).toEqual({ into: 4, span: 6 });
    expect(xpProgress({ level: 2, xp: 13 }, world)).toEqual({ into: 7, span: 14 });
    expect(xpProgress({ level: 4, xp: 40 }, world)).toBeNull();
  });

  it('makes a level worth energy and damage', () => {
    expect(maxHpOf(world, { level: 1, badges: [], bonusHp: 0 })).toBe(20);
    expect(maxHpOf(world, { level: 3, badges: [], bonusHp: 0 })).toBe(26);
    expect(maxHpOf(world, { level: 3, badges: ['one'], bonusHp: 10 })).toBe(41);
    expect(attackBonus(1, world)).toBe(0);
    expect(attackBonus(3, world)).toBe(2);
    expect(attackBonus(5, { ...world, levels: { ...world.levels, levelsPerPower: 2 } })).toBe(2);
    expect(attackBonus(2, { ...world, levels: { ...world.levels, levelsPerPower: 2 } })).toBe(0);
  });

  it('gives an enemy above its own level a little more energy, and never less', () => {
    const rat = world.enemies.rat!;
    expect(rat.level).toBe(2);
    expect(enemyHpAt(rat, 2, world)).toBe(rat.hp);
    expect(enemyHpAt(rat, 4, world)).toBe(rat.hp + 4);
    expect(enemyHpAt(rat, 1, world)).toBe(rat.hp);
  });

  it('pays more XP for a higher level, and far more for a boss', () => {
    expect(xpFor(2, true, world)).toBe(6);
    expect(xpFor(4, true, world)).toBe(12);
    expect(xpFor(2, false, world)).toBe(20);
    expect(xpFor(2, false, world)).toBeGreaterThan(xpFor(2, true, world));
  });
});
