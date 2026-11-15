import type { Battle } from './types.ts';

/**
 * The way into a battle: a short show over the map before the battle screen comes up. A wild enemy gets a blink
 * and blinds that close; a boss gets two blinks and an iris that closes, and takes more than twice as long. The
 * battle counts it down in ticks (`intro`), so it is part of the state and the same every time. With reduced
 * motion there is none: the battle screen is there at once.
 *
 * The screen never goes bright three times within a second (a test counts, the battle screen after it included).
 */

/** How long the transition into a wild battle takes, in ticks (60 a second). */
export const WILD_TICKS = 48;
/** And into a battle against a boss. */
export const BOSS_TICKS = 108;

/** One picture of the transition: the screen washed out to the lightest shade, or how far the dark has closed (0 to 1). */
export type Curtain = { flash: boolean; cover: number; shape: 'blinds' | 'iris' };

/** The beats of each transition, in ticks from its start: when the screen is washed out, and when the dark closes. */
const WILD = { ticks: WILD_TICKS, washes: [[2, 8]], close: [10, 42], shape: 'blinds' } as const;
const BOSS = { ticks: BOSS_TICKS, washes: [[2, 14], [26, 38]], close: [50, 100], shape: 'iris' } as const;

/** How many ticks the way into a battle takes. */
export const introTicks = (wild: boolean) => (wild ? WILD_TICKS : BOSS_TICKS);

/** What the transition looks like at this moment of a battle, or null when it is over. */
export function curtainOf(battle: Pick<Battle, 'intro' | 'wild'>): Curtain | null {
  if (battle.intro <= 0) return null;
  const plan = battle.wild ? WILD : BOSS;
  const t = plan.ticks - battle.intro;
  const flash = plan.washes.some(([from, to]) => t >= from && t < to);
  const [from, to] = plan.close;
  const cover = Math.max(0, Math.min(1, (t - from) / (to - from)));
  return { flash, cover, shape: plan.shape };
}
