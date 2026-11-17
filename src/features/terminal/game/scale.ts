import { SCREEN_H, SCREEN_W } from './render.ts';

/** From this width of the game area on, the controls (or the key list) sit beside the screen, not under it. */
export const WIDE_FROM = 600;

/** Space the Game Boy's body takes around the screen, per layout, in CSS pixels. Game.module.css matches these. */
const CHROME = {
  wide: { x: 280, y: 16 },
  narrow: { x: 28, y: 28 },
};
/** The height of what sits under the screen in the narrow layout: the touch buttons, or the one-line key list. */
const UNDER = { touch: 140, keys: 44 };

/**
 * The largest scale at which the 160x144 screen fits a box, snapped down to a whole number of device pixels per
 * game pixel so the pixels stay square and crisp. When even one device pixel does not fit, it just fits the box.
 */
export function fitScale(width: number, height: number, dpr = 1): number {
  const raw = Math.min(width / SCREEN_W, height / SCREEN_H);
  if (!(raw > 0)) return 1;
  const snapped = Math.floor(raw * dpr) / dpr;
  return snapped > 0 ? snapped : raw;
}

/** How the game lays itself out in an area of this size: beside or under, and how big the screen is. */
export function layout(width: number, height: number, touch: boolean, dpr = 1): { wide: boolean; scale: number } {
  const wide = width >= WIDE_FROM;
  if (wide) return { wide, scale: fitScale(width - CHROME.wide.x, height - CHROME.wide.y, dpr) };
  const under = touch ? UNDER.touch : UNDER.keys;
  return { wide, scale: fitScale(width - CHROME.narrow.x, height - CHROME.narrow.y - under, dpr) };
}
