import { useEffect, useState } from 'react';
import fontUrl from './assets/font.png';
import spritesUrl from './assets/sprites.png';
import tilesUrl from './assets/tiles.png';
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
