import type { GameState } from './types.ts';

/**
 * The label with the name of a place: it slides in from the top, stays a moment and slides back. All of it is
 * counted on the game clock, which stands still in a text box and a battle, so the label waits there too.
 */

/** How many ticks the label takes to slide in, and to slide back out (60 ticks a second). */
export const BANNER_SLIDE = 12;
/** How long it stays in between. */
export const BANNER_HOLD = 108;
/** With reduced motion it does not slide: it is there for this long (a step is 10 ticks there), and then gone. */
export const BANNER_STILL = 60;

/** How far the label is out at this moment: 0 is not at all, 1 is all of it. */
export function bannerOut(state: Pick<GameState, 'banner' | 'clock'>): number {
  const { banner } = state;
  if (!banner) return 0;
  const t = state.clock - banner.at;
  if (t < 0) return 0;
  if (!banner.slide) return t < BANNER_STILL ? 1 : 0;
  if (t < BANNER_SLIDE) return t / BANNER_SLIDE;
  if (t <= BANNER_SLIDE + BANNER_HOLD) return 1;
  return Math.max(0, 1 - (t - BANNER_SLIDE - BANNER_HOLD) / BANNER_SLIDE);
}

/** The name on the label while any of it is in view, or an empty string. */
export const bannerText = (state: Pick<GameState, 'banner' | 'clock'>): string => (bannerOut(state) > 0 ? state.banner!.text : '');
