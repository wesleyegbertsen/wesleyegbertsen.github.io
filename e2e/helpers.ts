import { expect, type Page } from '@playwright/test';

export type PlayLog = { src: string; volume: number; startAt: number; ok: boolean };

/**
 * Wraps the browser's real `play()` so tests can see which sound was started,
 * at what volume and offset, and whether the browser actually allowed it.
 * Must run before the page loads.
 */
export async function recordAudio(page: Page) {
  await page.addInitScript(() => {
    const log: unknown[] = [];
    (window as unknown as { __plays: unknown[] }).__plays = log;
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      const entry = {
        src: this.currentSrc || this.src,
        volume: this.volume,
        startAt: this.currentTime,
        ok: false,
      };
      log.push(entry);
      const result = original.call(this);
      result.then(() => (entry.ok = true)).catch(() => {});
      return result;
    };
  });
}

export async function plays(page: Page): Promise<PlayLog[]> {
  return page.evaluate(() => (window as unknown as { __plays: PlayLog[] }).__plays.map((p) => ({ ...p })));
}

/** Plays whose source file name contains `name`. */
export async function playsOf(page: Page, name: string) {
  return (await plays(page)).filter((p) => p.src.includes(name));
}

/** Keeps the tests offline: the hidden video is a YouTube embed. */
export async function stubYouTube(page: Page) {
  // Opaque like the real player: a transparent stub would show the rain through the iframe.
  const body = '<html><body style="margin:0;background:#c00;color:#fff">video</body></html>';
  await page.route('**/*youtube.com/**', (route) => route.fulfill({ contentType: 'text/html', body }));
}

/**
 * Opens the site with audio recording on, YouTube stubbed, and fails on console errors.
 * `path` is where to go (the site routes by hash, for example `/#/projects`); the page is ready when
 * its own content shows: the Projects heading on the projects page, Pikachu everywhere else.
 */
export async function openSite(page: Page, path = '/') {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await recordAudio(page);
  await stubYouTube(page);
  await page.goto(path);
  if (path.includes('#/projects')) {
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  } else {
    await expect(page.getByRole('button', { name: 'Pikachu' })).toBeVisible();
  }
  return { errors };
}

/** Number of non-black pixels on the matrix canvas. */
export async function litPixels(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i]! + data[i + 1]! + data[i + 2]! > 0) lit++;
    return lit;
  });
}
