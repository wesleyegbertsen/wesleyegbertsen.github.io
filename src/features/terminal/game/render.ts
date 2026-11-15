import { camera, type GameState } from './engine.ts';
import type { Level } from './level.ts';
import { PLAYER_H, PLAYER_W, TILE_PX, VIEW_ROWS } from './physics.ts';

/** The canvas's size in its own pixels for a picture `cols` tiles wide. CSS scales it to the panel. */
export const canvasWidth = (cols: number) => cols * TILE_PX;
export const CANVAS_H = VIEW_ROWS * TILE_PX;

export type Palette = { accent: string; ink: string };

const COIN = '#ffd54a';
const SPIKE = '#ff6b6b';
const PLAYER = '#f5f5f5';

/**
 * Draws one frame of the level around the player in simple pixel-art shapes: ground and platforms in the theme's
 * accent colour, coins for items, spikes, a flag, and a small figure. Only the drawing calls of a 2D context are used.
 */
export function drawGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  level: Level,
  palette: Palette,
  cols: number,
) {
  const T = TILE_PX;
  const cam = camera(state, level, cols);
  const px = (col: number) => Math.round((col - cam) * T);
  const first = Math.floor(cam);
  const last = Math.min(level.width - 1, Math.ceil(cam + cols));

  ctx.clearRect(0, 0, canvasWidth(cols), CANVAS_H);

  // Section titles hang in the sky at the start of each section.
  ctx.font = `${Math.round(T * 0.7)}px monospace`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = palette.accent;
  ctx.globalAlpha = 0.6;
  for (const section of level.sections) ctx.fillText(section.label, px(section.start + 1), T);
  ctx.globalAlpha = 1;

  for (let row = 0; row < level.height; row++) {
    for (let col = first; col <= last; col++) {
      const tile = level.tiles[row]?.[col];
      const x = px(col);
      const y = row * T;
      if (tile === '#') {
        const open = level.tiles[row - 1]?.[col] !== '#';
        ctx.fillStyle = palette.accent;
        ctx.globalAlpha = open ? 1 : 0.35;
        ctx.fillRect(x, y, T, T);
        ctx.globalAlpha = 1;
        if (open) {
          ctx.fillStyle = palette.ink;
          ctx.fillRect(x, y + 4, T, 1);
        }
      } else if (tile === '=') {
        ctx.fillStyle = palette.accent;
        ctx.fillRect(x, y, T, 5);
      } else if (tile === '^') {
        ctx.fillStyle = SPIKE;
        ctx.beginPath();
        ctx.moveTo(x, y + T);
        ctx.lineTo(x + T / 2, y + 3);
        ctx.lineTo(x + T, y + T);
        ctx.closePath();
        ctx.fill();
      } else if (tile === '|' || tile === 'F') {
        // A checkpoint is a short post with a small pennant; the flag is the same, taller and gold.
        const reached = tile === 'F' || state.checkpoint.col >= col;
        ctx.fillStyle = palette.accent;
        ctx.fillRect(x + 7, y - (tile === 'F' ? T : 0) + 2, 2, T - 2 + (tile === 'F' ? T : 0));
        ctx.fillStyle = tile === 'F' ? COIN : reached ? palette.accent : palette.ink;
        ctx.fillRect(x + 9, y - (tile === 'F' ? T : 0) + 2, 6, 5);
      }
    }
  }

  for (const item of level.items) {
    if (state.collected.includes(item.label) || item.col < first || item.col > last) continue;
    ctx.fillStyle = COIN;
    ctx.beginPath();
    ctx.arc(px(item.col) + T / 2, item.row * T + T / 2, T * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.ink;
    ctx.fillRect(px(item.col) + T / 2 - 1, item.row * T + T / 2 - 3, 2, 6);
  }

  // The player: a light body with a dark visor, so it reads on any theme colour.
  const x = Math.round((state.x - cam) * T);
  const y = Math.round(state.y * T);
  const w = Math.round(PLAYER_W * T);
  const h = Math.round(PLAYER_H * T);
  ctx.fillStyle = PLAYER;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = palette.ink;
  const facing = state.vx < 0 ? 1 : w - 6;
  ctx.fillRect(x + facing, y + 3, 5, 3);
}
