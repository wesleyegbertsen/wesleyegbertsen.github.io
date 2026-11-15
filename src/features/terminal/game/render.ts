import { FONT, PALETTE, TILE, sprites, tiles } from './assets/atlas.ts';
import { bannerOut } from './engine/banner.ts';
import { BATTLE_MENU, usableItems } from './engine/battle.ts';
import { JUMP_TICKS, WALK_TICKS, learnRows, ownedItems } from './engine/engine.ts';
import { xpProgress } from './engine/level.ts';
import { money } from './engine/shop.ts';
import { lit } from './engine/light.ts';
import { COLS, fold, wrap } from './engine/text.ts';
import { curtainOf, type Curtain } from './engine/transition.ts';
import { SETTINGS, type Dir, type GameObject, type GameState, type MoveDef, type World } from './engine/types.ts';
import { placeOf, strollProgress } from './engine/wander.ts';
import { gone, spriteOf } from './engine/world.ts';

/** The Game Boy's screen, in pixels. */
export const SCREEN_W = 160;
export const SCREEN_H = 144;

/** The three sheets, loaded. */
export type Sheets = { tiles: CanvasImageSource; sprites: CanvasImageSource; font: CanvasImageSource };

/** What the renderer needs of a 2D context, so a test can hand it a recorder. */
export type Painter = Pick<CanvasRenderingContext2D, 'drawImage' | 'fillRect' | 'fillStyle' | 'imageSmoothingEnabled'>;

/** What is shown on top of the game that is not part of its state: whether the sound is off, and how loud it is (0 to 10). */
export type Hud = { muted: boolean; volume: number; lcd?: boolean };

/** The volume wheel has this many steps. */
export const VOLUME_STEPS = 10;

const [LIGHTEST, , DARK, DARKEST] = PALETTE;
const LINE = 10;
const BOX_Y = 104;
/** The height of the note in the corner and of the label with the name of a place. */
const NOTE_H = 16;
/** How many ticks of the game clock each of the two pictures of an animated tile is shown. */
export const FRAME_TICKS = 30;
/**
 * The Start menu, top to bottom: the tabs (6), the level and the XP (18), the energy and the coins (28), a rule
 * (38), the list of the open tab from 42 (five rows of the bag ten pixels apart, or the three settings fourteen
 * apart), what was collected (94), a rule (105) and three lines of note from 110.
 */
/** How many items the bag shows at once; a longer list scrolls with the cursor. */
const BAG_ROWS = 5;
/** The line of the things to collect, under the list. */
const COLLECT_Y = 94;
/** The settings: where the first row is, and how far apart they are. */
const SETTINGS_Y = 46;
const SETTINGS_LINE = 14;
/** The most coins the menu has room to show beside the energy: four digits. The purse itself has no limit. */
const COINS_SHOWN = 9999;
/** The see-through tiles that darken a cell of a dark place: a sparse dither, then a dense one. Past those it is black. */
const SHADES = ['', 'shade-1', 'shade-2'] as const;

/** The picture to show now: the plain one, or its `-b` twin every other beat when it is animated. */
const frameOf = (sprite: string, animated: boolean | undefined, clock: number) =>
  animated && Math.floor(clock / FRAME_TICKS) % 2 === 1 ? `${sprite}-b` : sprite;

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

const drawable = (name: string) => Object.hasOwn(sprites, name) || Object.hasOwn(tiles, name);

/**
 * The picture of a thing that can look somewhere: turned to the player while it is talked to, else the way of
 * its last step. People have a picture per side (the plain one looks at you). The dog is drawn from the side
 * (the plain one looks left) and has its own pictures going away (`-up`) and coming closer (`-down`); an animal
 * without those keeps its side when it goes up or down. Anything else has just the one picture.
 */
export function facingSprite(sprite: string, object: GameObject, state: GameState): string {
  const roaming = state.roam[object.id];
  const dir: Dir | undefined = state.face?.id === object.id ? state.face.dir : roaming?.dir;
  if (!dir) return sprite;
  if (drawable(`${sprite}-${dir}`)) return `${sprite}-${dir}`;
  if (dir === 'down' && drawable(`${sprite}-up`)) return sprite;
  const side = dir === 'left' || dir === 'right' ? dir : roaming?.side;
  return side && drawable(`${sprite}-${side}`) ? `${sprite}-${side}` : sprite;
}

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

function hpBar(ctx: Painter, x: number, y: number, w: number, value: number, max: number, h = 6) {
  rect(ctx, x, y, w, h, DARKEST);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, LIGHTEST);
  const fill = value <= 0 ? 0 : Math.max(1, Math.round(((w - 2) * value) / max));
  if (fill > 0) rect(ctx, x + 1, y + 1, Math.min(w - 2, fill), h - 2, DARK);
}

/** The XP bar: thinner than the energy bar, and full at the top level. */
function xpBar(ctx: Painter, x: number, y: number, w: number, state: GameState, world: World, h = 4) {
  const progress = xpProgress(state, world);
  hpBar(ctx, x, y, w, progress ? progress.into : 1, progress ? progress.span : 1, h);
}

const rightAligned = (text: string, right: number) => right - text.length * FONT.cellW;

/** A move's numbers, short enough for a column: power and accuracy, or what it heals. */
const moveStats = (move: MoveDef) => (move.heal !== undefined ? `+${move.heal}` : `${move.power} ${Math.round(move.accuracy * 100)}%`);

/** The volume wheel as the Game Boy would draw it: ten steps that grow, filled up to the level. */
function drawVolume(ctx: Painter, x: number, y: number, hud: Hud) {
  for (let i = 0; i < VOLUME_STEPS; i++) {
    const h = 2 + Math.round((i * 6) / (VOLUME_STEPS - 1));
    if (i < hud.volume) rect(ctx, x + i * 4, y + 8 - h, 3, h, hud.muted ? DARK : DARKEST);
    else rect(ctx, x + i * 4, y + 7, 3, 1, DARK);
  }
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

/** How high a hop over a ledge is at the top of its arc, in pixels. */
export const HOP_PIXELS = 7;

/** How far off the ground the player is during a hop, by how far along it is (0 to 1): up, over and down again. */
export function hopHeight(progress: number): number {
  return Math.max(0, Math.round(Math.sin(Math.PI * Math.max(0, Math.min(1, progress))) * HOP_PIXELS));
}

function drawWorld(ctx: Painter, sheets: Sheets, state: GameState, world: World) {
  const map = world.maps[state.map]!;
  const progress = state.walk ? state.walk.t / (state.walk.jump ? JUMP_TICKS : WALK_TICKS) : 1;
  const from = state.walk ?? { fromX: state.x, fromY: state.y };
  // A hop over a ledge: the player leaves the ground in an arc, and a shadow stays on it.
  const hop = state.walk?.jump ? hopHeight(progress) : 0;
  const px = Math.round((from.fromX + (state.x - from.fromX) * progress) * TILE);
  const py = Math.round((from.fromY + (state.y - from.fromY) * progress) * TILE);
  const camX = camera(px + TILE / 2, map.width * TILE, SCREEN_W);
  const camY = camera(py + TILE / 2, map.height * TILE, SCREEN_H);

  rect(ctx, 0, 0, SCREEN_W, SCREEN_H, DARKEST);
  for (let cy = Math.max(0, Math.floor(camY / TILE)); cy < map.height && cy * TILE < camY + SCREEN_H; cy++) {
    for (let cx = Math.max(0, Math.floor(camX / TILE)); cx < map.width && cx * TILE < camX + SCREEN_W; cx++) {
      const tile = map.tiles[map.cells[cy]![cx]!];
      if (!tile) continue;
      if (tile.under) drawSprite(ctx, sheets, tile.under, cx * TILE - camX, cy * TILE - camY);
      drawSprite(ctx, sheets, frameOf(tile.sprite, tile.animated, state.clock), cx * TILE - camX, cy * TILE - camY);
    }
  }
  for (const object of map.objects) {
    const sprite = spriteOf(object, state);
    if (!sprite || gone(object, state)) continue;
    const roaming = state.roam[object.id];
    if (!roaming) {
      drawSprite(ctx, sheets, frameOf(facingSprite(sprite, object, state), object.animated, state.clock), object.x * TILE - camX, object.y * TILE - camY);
      continue;
    }
    // Someone on a stroll: between two cells while the step lasts, with a little bob.
    const along = strollProgress(roaming, state.clock);
    const at = placeOf(object, state);
    const ox = Math.round((roaming.fromX + (at.x - roaming.fromX) * along) * TILE);
    const oy = Math.round((roaming.fromY + (at.y - roaming.fromY) * along) * TILE);
    drawSprite(ctx, sheets, facingSprite(sprite, object, state), ox - camX, oy - camY - (along < 1 && Math.floor(along * 4) % 2 === 1 ? 1 : 0));
  }
  // The player steps with one foot, then the other, and the arms swing against them: the cell tells which.
  const foot = (state.x + state.y) % 2 === 1 ? 2 : 1;
  // On slippery ground the legs stand still: the player slides.
  const frame = state.walk && !state.walk.slide && (state.walk.jump ? hop > 0 : state.walk.t >= WALK_TICKS / 2) ? foot : 0;
  if (hop > 0) rect(ctx, px - camX + 4, py - camY + 13, 8, 2, DARK);
  drawSprite(ctx, sheets, `player-${state.dir}-${frame}`, px - camX, py - camY - hop);

  // A dark place: the light reaches a few cells around the player and falls off to black. It only moves with
  // the player, so nothing flickers. A fire bowl lights the cells around it the same way, wherever the player is.
  if (map.dark !== undefined) {
    for (let cy = Math.floor(camY / TILE); cy * TILE < camY + SCREEN_H; cy++) {
      for (let cx = Math.floor(camX / TILE); cx * TILE < camX + SCREEN_W; cx++) {
        const dim = lit(cx, cy, px / TILE, py / TILE, map.dark, map.lights);
        if (dim === 0) continue;
        if (dim === 3) rect(ctx, cx * TILE - camX, cy * TILE - camY, TILE, TILE, DARKEST);
        else drawSprite(ctx, sheets, SHADES[dim], cx * TILE - camX, cy * TILE - camY);
      }
    }
  }

  // The name of a place that was just entered: a label in the style of the note below, centred, that slides
  // down from above the screen and back. It is drawn after the darkness, so a cave shows it too.
  const drop = Math.round(bannerOut(state) * NOTE_H);
  if (drop > 0) {
    const name = fold(state.banner!.text);
    const width = name.length * FONT.cellW + 11;
    const left = Math.floor((SCREEN_W - width) / 2);
    box(ctx, left, drop - NOTE_H, width, NOTE_H);
    drawText(ctx, sheets, name, left + 6, drop - NOTE_H + 4);
  }

  // The note after a find: the count, in the corner, for a moment. While the label is out it hangs under it. A
  // thing to collect with a picture of its own shows that picture in the place of its mark.
  if (state.notice && state.clock < state.notice.until) {
    const { text } = state.notice;
    box(ctx, 0, drop, text.length * FONT.cellW + 11, NOTE_H);
    const icon = world.collect?.find((collect) => collect.icon && text.startsWith(`${collect.mark} `))?.icon;
    if (icon) drawSprite(ctx, sheets, icon, 5, drop + 4);
    drawText(ctx, sheets, icon ? ` ${text.slice(1)}` : text, 6, drop + 4);
  }
}

/** A small speaker in the corner: with sound waves, or crossed out when the sound is off. */
function drawSpeaker(ctx: Painter, muted: boolean) {
  const x = 146;
  const y = 2;
  rect(ctx, x, y, 13, 11, DARKEST);
  rect(ctx, x + 1, y + 1, 11, 9, LIGHTEST);
  rect(ctx, x + 2, y + 4, 2, 3, DARKEST);
  rect(ctx, x + 4, y + 3, 1, 5, DARKEST);
  rect(ctx, x + 5, y + 2, 1, 7, DARKEST);
  if (muted) {
    for (const [dx, dy] of [[7, 4], [9, 4], [8, 5], [7, 6], [9, 6]] as const) rect(ctx, x + dx, y + dy, 1, 1, DARKEST);
  } else {
    rect(ctx, x + 7, y + 4, 1, 3, DARKEST);
    rect(ctx, x + 9, y + 3, 1, 5, DARKEST);
  }
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

/** The settings tab: the sound, how loud it is, and the look of the screen. */
function drawSettings(ctx: Painter, sheets: Sheets, cursor: number, hud?: Hud): string {
  const at = SETTINGS[Math.min(cursor, SETTINGS.length - 1)]!;
  const row = (name: (typeof SETTINGS)[number]) => SETTINGS_Y + SETTINGS.indexOf(name) * SETTINGS_LINE;
  drawText(ctx, sheets, '>', 10, row(at));
  drawText(ctx, sheets, 'SOUND', 18, row('sound'));
  drawText(ctx, sheets, 'VOLUME', 18, row('volume'));
  drawText(ctx, sheets, 'SCREEN', 18, row('screen'));
  if (hud) {
    drawText(ctx, sheets, hud.muted ? 'OFF' : 'ON', 64, row('sound'));
    drawVolume(ctx, 64, row('volume') - 1, hud);
    drawText(ctx, sheets, `${hud.volume * 10}%`, 110, row('volume'));
    drawText(ctx, sheets, hud.lcd === false ? 'PLAIN' : 'LCD', 64, row('screen'));
  }
  if (at === 'sound') return 'A switches the sound off or on. So does the M key.';
  if (at === 'volume') return 'Left and right change the volume.';
  return 'A switches the LCD look: a pixel grid, as on the real thing.';
}

function drawMenu(ctx: Painter, sheets: Sheets, state: GameState, world: World, hud?: Hud) {
  const menu = state.menu!;
  box(ctx, 0, 0, SCREEN_W, SCREEN_H);
  const tabs = { items: ['BAG', 10], badges: ['BADGES', 38], settings: ['SETTINGS', 84] } as const;
  for (const [name, x] of Object.values(tabs)) drawText(ctx, sheets, name, x, 6);
  rect(ctx, tabs[menu.tab][1], 15, tabs[menu.tab][0].length * FONT.cellW - 1, 1, DARKEST);
  drawText(ctx, sheets, '<>', 140, 6);

  // Who you are by now, in two rows that end at the same places: the level, a bar and the XP towards the next
  // one; the energy, a bar and the money. Both bars end at 90, and the numbers on the right end at the margin.
  const progress = xpProgress(state, world);
  const xp = progress ? `XP ${progress.into}/${progress.span}` : 'XP MAX';
  drawText(ctx, sheets, `LV ${state.level}`, 14, 18);
  xpBar(ctx, 50, 20, 40, state, world);
  drawText(ctx, sheets, xp, rightAligned(xp, SCREEN_W - 8), 18);
  const purse = `${world.economy.currency} ${Math.min(state.coins, COINS_SHOWN)}`;
  drawText(ctx, sheets, `HP ${state.hp}/${state.maxHp}`, 14, 28);
  hpBar(ctx, 66, 29, 24, state.hp, state.maxHp);
  drawText(ctx, sheets, purse, rightAligned(purse, SCREEN_W - 8), 28);
  rect(ctx, 8, 38, SCREEN_W - 16, 1, DARK);

  let note: string;
  if (menu.tab === 'items') {
    const owned = ownedItems(state, world);
    const cursor = Math.min(menu.cursor, owned.length - 1);
    // A long bag scrolls: the cursor stays in view.
    const top = Math.max(0, Math.min(cursor - BAG_ROWS + 2, owned.length - BAG_ROWS));
    owned.slice(top, top + BAG_ROWS).forEach((id, i) => {
      if (top + i === cursor) drawText(ctx, sheets, '>', 10, 42 + i * LINE);
      drawText(ctx, sheets, `${world.items[id]!.name} x${state.items[id]}`, 18, 42 + i * LINE);
    });
    note = owned.length === 0 ? 'Your bag is empty.' : world.items[owned[cursor]!]!.description;
  } else if (menu.tab === 'settings') {
    note = drawSettings(ctx, sheets, menu.cursor, hud);
  } else {
    world.badges.slice(0, BAG_ROWS).forEach((badge, i) => {
      const earned = state.badges.includes(badge.id);
      if (i === menu.cursor) drawText(ctx, sheets, '>', 10, 42 + i * LINE);
      drawText(ctx, sheets, earned ? `* ${badge.name}` : '- ???', 18, 42 + i * LINE);
    });
    note = `${state.badges.length} of ${world.badges.length} badges.`;
  }

  // The foot of the list: what was found of the things to collect.
  (world.collect ?? []).slice(0, 2).forEach((collect, i) => {
    const text = `${collect.label} ${state.items[collect.item] ?? 0}/${collect.total}`;
    // A picture of its own goes before the word.
    const indent = collect.icon ? 10 : 0;
    const left = i === 0 ? 8 : rightAligned(text, SCREEN_W - 8) - indent;
    if (collect.icon) drawSprite(ctx, sheets, collect.icon, left, COLLECT_Y);
    drawText(ctx, sheets, text, left + indent, COLLECT_Y);
  });
  rect(ctx, 8, BOX_Y + 1, SCREEN_W - 16, 1, DARK);
  drawLines(ctx, sheets, wrap(fold(note), COLS).slice(0, 3), 8, BOX_Y + 6);
}

/** The offer of a new move: what it does, and the moves that can make room for it. */
function drawLearn(ctx: Painter, sheets: Sheets, state: GameState, world: World) {
  const learn = state.learn!;
  const offered = world.moves[learn.move]!;
  box(ctx, 0, 0, SCREEN_W, SCREEN_H);
  drawText(ctx, sheets, 'NEW MOVE', 14, 8);
  drawText(ctx, sheets, `LV ${state.level}`, rightAligned(`LV ${state.level}`, SCREEN_W - 14), 8);
  drawText(ctx, sheets, offered.name, 14, 20);
  const stats = offered.heal !== undefined ? `HEALS ${offered.heal}  PP ${offered.pp}` : `POW ${offered.power}  HIT ${Math.round(offered.accuracy * 100)}%  PP ${offered.pp}`;
  drawText(ctx, sheets, stats, 14, 30);
  rect(ctx, 8, 41, SCREEN_W - 16, 1, DARK);
  drawText(ctx, sheets, 'REPLACE WHICH?', 14, 46);
  const rows = learnRows(state);
  rows.forEach((id, i) => {
    const move = world.moves[id]!;
    const numbers = moveStats(move);
    drawText(ctx, sheets, move.name, 18, 58 + i * LINE);
    drawText(ctx, sheets, numbers, rightAligned(numbers, SCREEN_W - 8), 58 + i * LINE);
  });
  drawText(ctx, sheets, 'KEEP MY MOVES', 18, 58 + rows.length * LINE);
  drawText(ctx, sheets, '>', 10, 58 + Math.min(learn.cursor, rows.length) * LINE);
  rect(ctx, 8, BOX_Y + 1, SCREEN_W - 16, 1, DARK);
  drawLines(ctx, sheets, [`${world.moves[state.moves[0]!]!.name} always stays.`, 'A: swap it in.', 'B: keep your moves.'], 8, BOX_Y + 6);
}

/**
 * A shop: its name and the player's coins at the top, then what it sells (how many of it are in the bag, and the
 * price) and the way out. The row under the cursor also shows how many A buys, between arrows (left and right
 * change it), and its price is that of all of them. The foot says what the item under the cursor does, or what
 * the last press led to.
 */
function drawShop(ctx: Painter, sheets: Sheets, state: GameState, world: World) {
  const open = state.shop!;
  const shop = world.shops[open.id]!;
  box(ctx, 0, 0, SCREEN_W, SCREEN_H);
  drawText(ctx, sheets, shop.name, 14, 8);
  const purse = money(state.coins, world);
  drawText(ctx, sheets, purse, rightAligned(purse, SCREEN_W - 8), 8);
  rect(ctx, 8, 19, SCREEN_W - 16, 1, DARK);
  const cursor = Math.min(open.cursor, shop.stock.length);
  // A row: the name (12 letters at most) from 18, the count in the bag from 94, the picker from 111, the price up to 152.
  shop.stock.forEach((entry, i) => {
    const picked = i === cursor ? open.amount : 1;
    const price = String(entry.price * picked);
    drawText(ctx, sheets, world.items[entry.item]!.name, 18, 24 + i * LINE);
    drawText(ctx, sheets, `x${state.items[entry.item] ?? 0}`, 94, 24 + i * LINE);
    if (i === cursor) drawText(ctx, sheets, `<${picked}>`, 111, 24 + i * LINE);
    drawText(ctx, sheets, price, rightAligned(price, SCREEN_W - 8), 24 + i * LINE);
  });
  drawText(ctx, sheets, 'LEAVE', 18, 24 + shop.stock.length * LINE);
  drawText(ctx, sheets, '>', 10, 24 + cursor * LINE);
  rect(ctx, 8, BOX_Y + 1, SCREEN_W - 16, 1, DARK);
  const entry = shop.stock[cursor];
  const note = open.note || (entry ? world.items[entry.item]!.description : 'A: buy. B: leave.');
  drawLines(ctx, sheets, wrap(fold(note), COLS).slice(0, 3), 8, BOX_Y + 6);
}

/** Where the two boxes of the battle screen stand, the pitch of their rows and the width of an energy bar. */
const HUD = { enemy: { x: 4, y: 6 }, you: { x: 76, y: 58 }, row: 10, bar: 62 } as const;

function drawBattle(ctx: Painter, sheets: Sheets, state: GameState, world: World) {
  const battle = state.battle!;
  const enemy = world.enemies[battle.enemy]!;
  rect(ctx, 0, 0, SCREEN_W, SCREEN_H, LIGHTEST);

  // Each fighter has a box in one style: the name and the level, the energy under it, and a bracket down one
  // side and along the bottom. The enemy's is top left with the bracket on its left, the player's bottom right
  // with the bracket on its right. Labels, bars and rows are the same in both.
  const { enemy: foe, you } = HUD;

  // The enemy: no numbers, its picture on the right. The longest name at Lv10 (19 characters) ends before it.
  rect(ctx, foe.x, foe.y, 2, 22, DARKEST);
  rect(ctx, foe.x, foe.y + 20, 94, 2, DARKEST);
  rect(ctx, foe.x + 94, foe.y + 21, 4, 1, DARKEST);
  drawText(ctx, sheets, `${enemy.name} Lv${battle.level}`, foe.x + 5, foe.y);
  drawText(ctx, sheets, 'HP', foe.x + 5, foe.y + HUD.row);
  hpBar(ctx, foe.x + 19, foe.y + HUD.row + 2, HUD.bar, battle.enemyHp, battle.enemyMax, 5);
  drawSprite(ctx, sheets, enemy.sprite, 124, 6);
  rect(ctx, 118, 40, 40, 2, DARK);

  // The player: seen from behind on the left. The energy with its numbers, and the XP as the rail of the box:
  // a thin bar that runs into the upright.
  drawSprite(ctx, sheets, 'player-up-0', 12, 60, 2);
  rect(ctx, 4, 92, 48, 2, DARK);
  const energy = `${state.hp}/${state.maxHp}`;
  const end = you.x + 14 + HUD.bar;
  drawText(ctx, sheets, `YOU Lv${state.level}`, you.x, you.y);
  drawText(ctx, sheets, 'HP', you.x, you.y + HUD.row);
  hpBar(ctx, you.x + 14, you.y + HUD.row + 2, HUD.bar, state.hp, state.maxHp, 5);
  drawText(ctx, sheets, energy, rightAligned(energy, end), you.y + 2 * HUD.row - 1);
  drawText(ctx, sheets, 'XP', you.x, you.y + 3 * HUD.row - 1);
  xpBar(ctx, you.x + 14, you.y + 33, HUD.bar + 2, state, world, 3);
  rect(ctx, end + 2, you.y, 2, 36, DARKEST);

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
      ? state.moves.map((id) => [world.moves[id]!.name, `${state.pp[id] ?? 0}/${world.moves[id]!.pp}`] as const)
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

/**
 * The way into a battle, over the map. A blink washes the whole screen out to the lightest shade; then the dark
 * closes: blinds from both sides for a wild enemy, an iris around the middle for a boss. It moves on whole steps
 * of 8 (blinds) and 4 (iris) pixels, like the Game Boy would.
 */
function drawCurtain(ctx: Painter, curtain: Curtain) {
  if (curtain.flash) return rect(ctx, 0, 0, SCREEN_W, SCREEN_H, LIGHTEST);
  if (curtain.cover <= 0) return;
  if (curtain.shape === 'blinds') {
    const width = Math.min(SCREEN_W, Math.ceil((curtain.cover * SCREEN_W) / 8) * 8);
    for (let row = 0; row * TILE < SCREEN_H; row++) rect(ctx, row % 2 === 0 ? 0 : SCREEN_W - width, row * TILE, width, TILE, DARKEST);
    return;
  }
  // The iris: a frame that grows inwards until nothing is left of the hole.
  const side = Math.min(SCREEN_W / 2, Math.ceil((curtain.cover * SCREEN_W) / 2 / 4) * 4);
  const lid = Math.min(SCREEN_H / 2, Math.ceil((curtain.cover * SCREEN_H) / 2 / 4) * 4);
  rect(ctx, 0, 0, SCREEN_W, lid, DARKEST);
  rect(ctx, 0, SCREEN_H - lid, SCREEN_W, lid, DARKEST);
  rect(ctx, 0, lid, side, SCREEN_H - 2 * lid, DARKEST);
  rect(ctx, SCREEN_W - side, lid, side, SCREEN_H - 2 * lid, DARKEST);
}

function drawScenery(ctx: Painter, sheets: Sheets, cast: string[]) {
  for (let x = 0; x < SCREEN_W; x += TILE) {
    drawSprite(ctx, sheets, x < 32 || x >= SCREEN_W - 32 ? 'tree' : 'grass', x, 112);
    drawSprite(ctx, sheets, 'path', x, 128);
  }
  cast.forEach((name, i) => drawSprite(ctx, sheets, name, 80 - cast.length * 10 + i * 20, 124));
}

function drawTitle(ctx: Painter, sheets: Sheets, world: World) {
  // (The speaker is drawn on top by drawGame.)
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

/** The ending: its lines, and under them the purse as a score, where there is money and room (five lines at most). */
function drawEnding(ctx: Painter, sheets: Sheets, state: GameState, world: World) {
  rect(ctx, 0, 0, SCREEN_W, SCREEN_H, LIGHTEST);
  const [head = '', ...rest] = world.ending.map(fold);
  drawText(ctx, sheets, head, centred(head, 2), 14, false, 2);
  rect(ctx, 8, 36, SCREEN_W - 16, 2, DARK);
  const lines = rest.flatMap((line) => wrap(line, COLS)).slice(0, 6);
  lines.forEach((line, i) => drawText(ctx, sheets, line, centred(line), 46 + i * LINE));
  const purse = `Your purse: ${money(state.coins, world)}.`;
  if (Object.keys(world.shops).length > 0 && lines.length < 5) drawText(ctx, sheets, purse, centred(purse), 52 + lines.length * LINE);
  drawScenery(ctx, sheets, ['player-right-0', 'wesley', 'cat']);
}

/** Draws the whole screen for a state: the map, or a battle, with the menu and the text box on top. */
export function drawGame(ctx: Painter, sheets: Sheets, state: GameState, world: World, hud?: Hud) {
  ctx.imageSmoothingEnabled = false;
  if (state.scene === 'title') {
    drawTitle(ctx, sheets, world);
    if (hud) drawSpeaker(ctx, hud.muted);
    return;
  }
  if (state.scene === 'ending') return drawEnding(ctx, sheets, state, world);
  const curtain = state.battle && curtainOf(state.battle);
  if (curtain) {
    // The way into a battle: still the map, with the transition closing over everything on it.
    drawWorld(ctx, sheets, state, world);
    if (hud) drawSpeaker(ctx, hud.muted);
    drawCurtain(ctx, curtain);
    return;
  }
  if (state.battle) drawBattle(ctx, sheets, state, world);
  else if (state.learn) drawLearn(ctx, sheets, state, world);
  else if (state.shop) drawShop(ctx, sheets, state, world);
  else if (state.menu) drawMenu(ctx, sheets, state, world, hud);
  else {
    drawWorld(ctx, sheets, state, world);
    if (hud) drawSpeaker(ctx, hud.muted);
  }
  if (state.dialogue) drawDialogue(ctx, sheets, state);
}
