import { useEffect, useState } from 'react';
import fontUrl from './assets/font.png';
import spritesUrl from './assets/sprites.png';
import tilesUrl from './assets/tiles.png';
import { PALETTE } from './assets/atlas.ts';
import { PALETTES, dimmed, recolour, type Palette, type PaletteId } from './palettes.ts';
import type { Sheets } from './render.ts';

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });
}

// Loaded once per page load, however often the game is opened.
let loading: Promise<Sheets> | null = null;

/** The sprite sheets, or null while they load (or when they cannot: the game then stays on its text paths). */
export function useSheets(): Sheets | null {
  const [sheets, setSheets] = useState<Sheets | null>(null);
  useEffect(() => {
    let live = true;
    loading ??= Promise.all([load(tilesUrl), load(spritesUrl), load(fontUrl)]).then(([tiles, sprites, font]) => ({ tiles, sprites, font }));
    loading.then(
      (loaded) => live && setSheets(loaded),
      () => {
        loading = null;
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return sheets;
}

const coloured = new WeakMap<Sheets, Sheets>();

/** One sheet, copied and recoloured into a palette (palettes.ts). Null where the page cannot draw (tests). */
function tinted(image: CanvasImageSource, palette: Palette): HTMLCanvasElement | null {
  const { width, height } = image as HTMLImageElement;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || !width || !height) return null;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height);
  recolour(pixels.data, palette);
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

/**
 * The sheets with their copies for Game Boy Color mode: one set per palette, made the first time colour is asked
 * for and kept for the page. Where they cannot be made, the plain sheets (the game then stays green).
 */
export function withColour(sheets: Sheets): Sheets {
  const known = coloured.get(sheets);
  if (known) return known;
  const sets = Object.entries(PALETTES).map(([id, palette]) => {
    const [tiles, sprites, font] = [sheets.tiles, sheets.sprites, sheets.font].map((image) => tinted(image, palette));
    return tiles && sprites && font ? ([id, { tiles, sprites, font }] as const) : null;
  });
  const made: Sheets = sets.every(Boolean) ? { ...sheets, colour: Object.fromEntries(sets as [string, NonNullable<Sheets['colour']>[PaletteId]][]) as Sheets['colour'] } : sheets;
  coloured.set(sheets, made);
  return made;
}

const dark = new WeakMap<Sheets, Sheets>();

/**
 * The sheets with their dimmed copies for the dim LCD (palettes.ts dim): the Game Boy's three in the dimmed
 * greens, and one set per palette of Game Boy Color mode in its dimmed colours. Made the first time the dim screen
 * is asked for and kept for the page; where they cannot be made, the sheets as they are (the screen stays bright).
 */
export function withDim(sheets: Sheets): Sheets {
  const known = dark.get(sheets);
  if (known) return known;
  const copy = (palette: Palette) => {
    const [tiles, sprites, font] = [sheets.tiles, sheets.sprites, sheets.font].map((image) => tinted(image, dimmed(palette)));
    return tiles && sprites && font ? { tiles, sprites, font } : null;
  };
  const gb = copy(PALETTE as unknown as Palette);
  const sets = Object.entries(PALETTES).map(([id, palette]) => {
    const set = copy(palette);
    return set ? ([id, set] as const) : null;
  });
  const colour = sets.every(Boolean) ? (Object.fromEntries(sets as [string, NonNullable<Sheets['colour']>[PaletteId]][]) as Sheets['colour']) : undefined;
  const made: Sheets = gb ? { ...sheets, dim: { gb, colour } } : sheets;
  dark.set(sheets, made);
  return made;
}
