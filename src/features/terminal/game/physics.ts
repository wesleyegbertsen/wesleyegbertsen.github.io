/** Tuning for the platformer. Lengths are in tiles, times in seconds. Edit freely: the replay test checks the level is still finishable. */

/** One simulation step, in milliseconds (30 steps a second). */
export const STEP_MS = 1000 / 30;
/** The longest frame the loop simulates: after a stall it catches up this much and no more. */
export const MAX_FRAME_MS = 250;

export const RUN_SPEED = 7;
export const GRAVITY = 30;
/** With GRAVITY 30 this lifts the player about 2.4 tiles and carries a jump across a 3-tile pit. */
export const JUMP_SPEED = 12;
export const MAX_FALL = 20;

/** The player's box, a little smaller than a tile so gaps and spikes are fair. */
export const PLAYER_W = 0.8;
export const PLAYER_H = 0.9;

/** What the picture shows, in tiles. */
export const VIEW_COLS = 30;
/** On a narrow screen the picture shows fewer columns, so the tiles stay big enough to see. */
export const VIEW_COLS_NARROW = 18;
export const VIEW_ROWS = 12;

/** Pixels per tile on the canvas. It is scaled to the panel by CSS, so a small number keeps the pixel-art look. */
export const TILE_PX = 16;
