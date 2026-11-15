import { FONT, PALETTE, TILE, sprites, tiles } from './assets/atlas.ts';
import { BATTLE_MENU, usableItems } from './engine/battle.ts';
import { WALK_TICKS, ownedItems } from './engine/engine.ts';
import { COLS, fold, wrap } from './engine/text.ts';
import type { GameState, World } from './engine/types.ts';
import { objectAt, spriteOf } from './engine/world.ts';

/** The Game Boy's screen, in pixels. */
export const SCREEN_W = 160;
export const SCREEN_H = 144;

/** The three sheets, loaded. */
export type Sheets = { tiles: CanvasImageSource; sprites: CanvasImageSource; font: CanvasImageSource };

/** What the renderer needs of a 2D context, so a test can hand it a recorder. */
export type Painter = Pick<CanvasRenderingContext2D, 'drawImage' | 'fillRect' | 'fillStyle' | 'imageSmoothingEnabled'>;

const [LIGHTEST, , DARK, DARKEST] = PALETTE;
const LINE = 10;
const BOX_Y = 104;

function rect(ctx: Painter, x: number, y: number, w: number, h: number, shade: string) {
  ctx.fillStyle = shade;
  ctx.fillRect(x, y, w, h);
}

/** A text box: light, with a double dark border. */
function box(ctx: Painter, x: number, y: number, w: number, h: number) {
  rect(ctx, x, y, w, h, DARKEST);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, LIGHTEST);
  rect(ctx, x + 2, y + 2, w - 4, h - 4, DARKEST);
  rect(ctx, x + 3, y + 3, w - 6, h - 6, LIGHTEST);
}

/** Text in the bitmap font. `scale` 2 is the big title lettering. */
export function drawText(ctx: Painter, sheets: Sheets, text: string, x: number, y: number, light = false, scale = 1) {
  const { cellW, cellH, cols, first, last, lightY } = FONT;
  [...fold(text)].forEach((char, i) => {
    const code = char.charCodeAt(0);
    const index = (code >= first && code <= last ? code : 63) - first;
    if (index === 0) return;
    ctx.drawImage(
      sheets.font,
      (index % cols) * cellW,
      Math.floor(index / cols) * cellH + (light ? lightY : 0),
      cellW,
      cellH,
      x + i * cellW * scale,
      y,
      cellW * scale,
      cellH * scale,
    );
  });
}

const centred = (text: string, scale = 1) => Math.floor((SCREEN_W - text.length * FONT.cellW * scale) / 2);

/** A tile or a sprite by name, whichever sheet it is on. Unknown names draw nothing. */
function drawSprite(ctx: Painter, sheets: Sheets, name: string, x: number, y: number, scale = 1) {
  if (Object.hasOwn(sprites, name)) {
    const [sx, sy, w, h] = sprites[name as keyof typeof sprites];
    ctx.drawImage(sheets.sprites, sx, sy, w, h, x, y, w * scale, h * scale);
  } else if (Object.hasOwn(tiles, name)) {
    const [sx, sy] = tiles[name as keyof typeof tiles];
    ctx.drawImage(sheets.tiles, sx, sy, TILE, TILE, x, y, TILE * scale, TILE * scale);
  }
}

function hpBar(ctx: Painter, x: number, y: number, w: number, value: number, max: number) {
  rect(ctx, x, y, w, 6, DARKEST);
  rect(ctx, x + 1, y + 1, w - 2, 4, LIGHTEST);
  const fill = value <= 0 ? 0 : Math.max(1, Math.round(((w - 2) * value) / max));
  if (fill > 0) rect(ctx, x + 1, y + 1, fill, 4, DARK);
}

/** Lines of text, of which only the first `shown` characters are drawn (the typewriter). */
function drawLines(ctx: Painter, sheets: Sheets, lines: readonly string[], x: number, y: number, shown = Infinity) {
  let left = shown;
  lines.forEach((line, i) => {
    if (left <= 0) return;
    drawText(ctx, sheets, line.slice(0, left), x, y + i * LINE);
    left -= line.length;
  });
}

/** Where the view starts on one axis: centred on the player, kept inside the map; a small map is centred. */
export function camera(centre: number, size: number, view: number): number {
  if (size <= view) return -Math.floor((view - size) / 2);
  return Math.max(0, Math.min(size - view, Math.round(centre - view / 2)));
}

function drawWorld(ctx: Painter, sheets: Sheets, state: GameState, world: World) {
  const map = world.maps[state.map]!;
  const progress = state.walk ? state.walk.t / WALK_TICKS : 1;
  const from = state.walk ?? { fromX: state.x, fromY: state.y };
  const px = Math.round((from.fromX + (state.x - from.fromX) * progress) * TILE);
  const py = Math.round((from.fromY + (state.y - from.fromY) * progress) * TILE);
  const camX = camera(px + TILE / 2, map.width * TILE, SCREEN_W);
  const camY = camera(py + TILE / 2, map.height * TILE, SCREEN_H);

  rect(ctx, 0, 0, SCREEN_W, SCREEN_H, DARKEST);
  for (let cy = Math.max(0, Math.floor(camY / TILE)); cy < map.height && cy * TILE < camY + SCREEN_H; cy++) {
    for (let cx = Math.max(0, Math.floor(camX / TILE)); cx < map.width && cx * TILE < camX + SCREEN_W; cx++) {
      const tile = world.tiles[map.cells[cy]![cx]!];
      if (!tile) continue;
      if (tile.under) drawSprite(ctx, sheets, tile.under, cx * TILE - camX, cy * TILE - camY);
      drawSprite(ctx, sheets, tile.sprite, cx * TILE - camX, cy * TILE - camY);
    }
  }
  for (const object of map.objects) {
    const sprite = spriteOf(object, state);
    if (!sprite || objectAt(map, object.x, object.y, state) !== object) continue;
    drawSprite(ctx, sheets, sprite, object.x * TILE - camX, object.y * TILE - camY);
  }
  const frame = state.walk && state.walk.t >= WALK_TICKS / 2 ? 1 : 0;
  drawSprite(ctx, sheets, `player-${state.dir}-${frame}`, px - camX, py - camY);
}

function drawDialogue(ctx: Painter, sheets: Sheets, state: GameState) {
  const dialogue = state.dialogue!;
  const page = dialogue.pages[dialogue.page]!;
  box(ctx, 0, BOX_Y, SCREEN_W, SCREEN_H - BOX_Y);
  drawLines(ctx, sheets, page, 8, BOX_Y + 6, dialogue.shown);
  const whole = dialogue.shown >= page.reduce((sum, line) => sum + line.length, 0);
  if (whole && dialogue.page < dialogue.pages.length - 1) {
    // More to read: a small arrow in the corner.
    rect(ctx, 146, 134, 5, 1, DARKEST);
    rect(ctx, 147, 135, 3, 1, DARKEST);
    rect(ctx, 148, 136, 1, 1, DARKEST);
  }
}

function drawMenu(ctx: Painter, sheets: Sheets, state: GameState, world: World) {
  const menu = state.menu!;
  box(ctx, 0, 0, SCREEN_W, SCREEN_H);
  drawText(ctx, sheets, 'BAG', 14, 8);
  drawText(ctx, sheets, 'BADGES', 62, 8);
  rect(ctx, menu.tab === 'items' ? 14 : 62, 17, (menu.tab === 'items' ? 3 : 6) * FONT.cellW - 1, 1, DARKEST);
  drawText(ctx, sheets, '< >', 128, 8);
  drawText(ctx, sheets, 'ENERGY', 14, 24);
  hpBar(ctx, 56, 25, 50, state.hp, state.maxHp);
  drawText(ctx, sheets, `${state.hp}/${state.maxHp}`, 110, 24);
  rect(ctx, 8, 35, SCREEN_W - 16, 1, DARK);

  let note: string;
  if (menu.tab === 'items') {
    const owned = ownedItems(state, world);
    const cursor = Math.min(menu.cursor, owned.length - 1);
    owned.slice(0, 6).forEach((id, i) => {
      if (i === cursor) drawText(ctx, sheets, '>', 10, 42 + i * LINE);
      drawText(ctx, sheets, `${world.items[id]!.name} x${state.items[id]}`, 18, 42 + i * LINE);
    });
    note = owned.length === 0 ? 'Your bag is empty.' : world.items[owned[cursor]!]!.description;
  } else {
    world.badges.forEach((badge, i) => {
      const earned = state.badges.includes(badge.id);
      if (i === menu.cursor) drawText(ctx, sheets, '>', 10, 42 + i * LINE);
      drawText(ctx, sheets, earned ? `* ${badge.name}` : '- ???', 18, 42 + i * LINE);
    });
    note = `${state.badges.length} of ${world.badges.length} badges.`;
  }
  rect(ctx, 8, BOX_Y + 1, SCREEN_W - 16, 1, DARK);
  drawLines(ctx, sheets, wrap(fold(note), COLS).slice(0, 3), 8, BOX_Y + 6);
}

function drawBattle(ctx: Painter, sheets: Sheets, state: GameState, world: World) {
  const battle = state.battle!;
  const enemy = world.enemies[battle.enemy]!;
  rect(ctx, 0, 0, SCREEN_W, SCREEN_H, LIGHTEST);

  // The enemy: name and energy on the left, picture on the right.
  drawText(ctx, sheets, enemy.name, 8, 8);
  drawText(ctx, sheets, 'HP', 8, 19);
  hpBar(ctx, 22, 20, 60, battle.enemyHp, enemy.hp);
  drawSprite(ctx, sheets, enemy.sprite, 116, 6);
  rect(ctx, 108, 40, 48, 2, DARK);

  // The player: seen from behind on the left, energy on the right.
  drawSprite(ctx, sheets, 'player-up-0', 12, 60, 2);
  rect(ctx, 4, 92, 48, 2, DARK);
  drawText(ctx, sheets, 'YOU', 78, 62);
  drawText(ctx, sheets, 'HP', 78, 73);
  hpBar(ctx, 92, 74, 60, state.hp, state.maxHp);
  drawText(ctx, sheets, `${state.hp}/${state.maxHp}`, 104, 84);

  if (battle.phase === 'steps') {
    box(ctx, 0, BOX_Y, SCREEN_W, SCREEN_H - BOX_Y);
    drawLines(ctx, sheets, wrap(battle.steps[0]?.text ?? '', COLS).slice(0, 3), 8, BOX_Y + 6, battle.shown);
    return;
  }
  if (battle.phase === 'menu') {
    box(ctx, 0, BOX_Y, 100, SCREEN_H - BOX_Y);
    drawLines(ctx, sheets, ['What will', 'you do?'], 8, BOX_Y + 6);
    box(ctx, 98, BOX_Y, SCREEN_W - 98, SCREEN_H - BOX_Y);
    BATTLE_MENU.forEach((label, i) => {
      if (i === battle.cursor) drawText(ctx, sheets, '>', 104, BOX_Y + 6 + i * LINE);
      drawText(ctx, sheets, label, 112, BOX_Y + 6 + i * LINE);
    });
    return;
  }
  // The moves or the items: a taller box, one entry per line.
  box(ctx, 0, 56, SCREEN_W, SCREEN_H - 56);
  const entries =
    battle.phase === 'moves'
      ? world.playerMoves.map((id) => [world.moves[id]!.name, `${state.pp[id] ?? 0}/${world.moves[id]!.pp}`] as const)
      : usableItems(state, world).map((id) => [world.items[id]!.name, `x${state.items[id]}`] as const);
  drawText(ctx, sheets, battle.phase === 'moves' ? 'MOVE' : 'ITEM', 16, 62);
  drawText(ctx, sheets, battle.phase === 'moves' ? 'PP' : '', 128, 62);
  rect(ctx, 8, 72, SCREEN_W - 16, 1, DARK);
  entries.slice(0, 6).forEach(([name, amount], i) => {
    if (i === battle.cursor) drawText(ctx, sheets, '>', 8, 78 + i * LINE);
    drawText(ctx, sheets, name, 16, 78 + i * LINE);
    drawText(ctx, sheets, amount, SCREEN_W - 8 - amount.length * FONT.cellW, 78 + i * LINE);
  });
}

function drawScenery(ctx: Painter, sheets: Sheets, cast: string[]) {
  for (let x = 0; x < SCREEN_W; x += TILE) {
    drawSprite(ctx, sheets, x < 32 || x >= SCREEN_W - 32 ? 'tree' : 'grass', x, 112);
    drawSprite(ctx, sheets, 'path', x, 128);
  }
  cast.forEach((name, i) => drawSprite(ctx, sheets, name, 80 - cast.length * 10 + i * 20, 124));
}

function drawTitle(ctx: Painter, sheets: Sheets, world: World) {
  rect(ctx, 0, 0, SCREEN_W, SCREEN_H, LIGHTEST);
  rect(ctx, 8, 14, SCREEN_W - 16, 2, DARK);
  drawText(ctx, sheets, world.title, centred(world.title, 2), 22, false, 2);
  rect(ctx, 8, 44, SCREEN_W - 16, 2, DARK);
  drawText(ctx, sheets, 'the career of', centred('the career of'), 56);
  const name = fold(world.subtitle);
  drawText(ctx, sheets, name, centred(name), 68);
  drawText(ctx, sheets, '- PRESS A -', centred('- PRESS A -'), 92);
  drawScenery(ctx, sheets, ['player-down-0', 'cat']);
}

function drawEnding(ctx: Painter, sheets: Sheets, world: World) {
  rect(ctx, 0, 0, SCREEN_W, SCREEN_H, LIGHTEST);
  const [head = '', ...rest] = world.ending.map(fold);
  drawText(ctx, sheets, head, centred(head, 2), 14, false, 2);
  rect(ctx, 8, 36, SCREEN_W - 16, 2, DARK);
  rest
    .flatMap((line) => wrap(line, COLS))
    .slice(0, 6)
    .forEach((line, i) => drawText(ctx, sheets, line, centred(line), 46 + i * LINE));
  drawScenery(ctx, sheets, ['player-right-0', 'wesley', 'cat']);
}

/** Draws the whole screen for a state: the map, or a battle, with the menu and the text box on top. */
export function drawGame(ctx: Painter, sheets: Sheets, state: GameState, world: World) {
  ctx.imageSmoothingEnabled = false;
  if (state.scene === 'title') return drawTitle(ctx, sheets, world);
  if (state.scene === 'ending') return drawEnding(ctx, sheets, world);
  if (state.battle) drawBattle(ctx, sheets, state, world);
  else if (state.menu) drawMenu(ctx, sheets, state, world);
  else drawWorld(ctx, sheets, state, world);
  if (state.dialogue) drawDialogue(ctx, sheets, state);
}
