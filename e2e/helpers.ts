import { expect, type Locator, type Page } from '@playwright/test';

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

export type AudioLog = {
  /** State of the context: suspended, running or closed. */
  state: string;
  resumes: number;
  suspends: number;
  closes: number;
  /** The value of the gain that feeds the speakers, or null when there is none yet. */
  master: number | null;
  /** How many sounds were started (oscillators and noise). */
  started: number;
  /** The first frequency of every oscillator that was started, in order. */
  frequencies: number[];
};

/**
 * Puts a recording AudioContext where the browser's is, so a test can see what the game's sound does without a
 * sound being made: how many contexts there are, whether they were woken, frozen or closed, what the master
 * volume is, and which notes were started. The stub starts asleep, as a browser may. Must run before the page loads.
 */
export async function stubAudioContext(page: Page) {
  await page.addInitScript(() => {
    type Sink = { to?: unknown };
    const contexts: unknown[] = [];
    (window as unknown as { __audio: unknown[] }).__audio = contexts;

    class Param {
      first: number | null = null;
      constructor(public value: number) {}
      setValueAtTime(value: number) {
        this.first ??= value;
        this.value = value;
      }
      linearRampToValueAtTime() {}
      exponentialRampToValueAtTime() {}
      cancelScheduledValues() {}
    }
    class Node implements Sink {
      to?: unknown;
      connect(target: unknown) {
        this.to = target;
      }
      disconnect() {}
    }
    class Gain extends Node {
      gain = new Param(1);
    }
    class Source extends Node {
      type = 'sine';
      frequency = new Param(440);
      playbackRate = new Param(1);
      buffer: unknown = null;
      loop = false;
      constructor(private readonly log: { type: string; frequency: number }[]) {
        super();
      }
      setPeriodicWave() {
        this.type = 'custom';
      }
      start() {
        this.log.push({ type: this.type, frequency: this.frequency.first ?? this.frequency.value });
      }
      stop() {}
    }
    class StubAudioContext {
      state = 'suspended';
      sampleRate = 8000;
      destination = { name: 'destination' };
      resumes = 0;
      suspends = 0;
      closes = 0;
      gains: Gain[] = [];
      started: { type: string; frequency: number }[] = [];
      private ran = 0;
      private since = 0;
      constructor() {
        contexts.push(this);
      }
      get currentTime() {
        return this.ran + (this.state === 'running' ? (performance.now() - this.since) / 1000 : 0);
      }
      private halt(state: string) {
        this.ran = this.currentTime;
        this.state = state;
      }
      createGain() {
        const gain = new Gain();
        this.gains.push(gain);
        return gain;
      }
      createOscillator() {
        return new Source(this.started);
      }
      createBufferSource() {
        const source = new Source(this.started);
        source.type = 'noise';
        return source;
      }
      createBuffer(_channels: number, length: number) {
        const data = new Float32Array(length);
        return { getChannelData: () => data };
      }
      createPeriodicWave() {
        return {};
      }
      resume() {
        this.resumes++;
        if (this.state === 'suspended') {
          this.since = performance.now();
          this.state = 'running';
        }
        return Promise.resolve();
      }
      suspend() {
        this.suspends++;
        if (this.state === 'running') this.halt('suspended');
        return Promise.resolve();
      }
      close() {
        this.closes++;
        this.halt('closed');
        return Promise.resolve();
      }
    }
    Object.assign(window, { AudioContext: StubAudioContext, webkitAudioContext: undefined });
  });
}

/** Takes the AudioContext away, as in a browser that has none. Must run before the page loads. */
export async function removeAudioContext(page: Page) {
  await page.addInitScript(() => {
    Object.assign(window, { AudioContext: undefined, webkitAudioContext: undefined });
  });
}

/** What the stubbed contexts were asked to do so far, one entry per context the page made. */
export async function audioLog(page: Page): Promise<AudioLog[]> {
  return page.evaluate(() => {
    type Stub = {
      state: string;
      resumes: number;
      suspends: number;
      closes: number;
      destination: unknown;
      gains: { to?: unknown; gain: { value: number } }[];
      started: { type: string; frequency: number }[];
    };
    return (window as unknown as { __audio: Stub[] }).__audio.map((context) => ({
      state: context.state,
      resumes: context.resumes,
      suspends: context.suspends,
      closes: context.closes,
      master: context.gains.find((gain) => gain.to === context.destination)?.gain.value ?? null,
      started: context.started.length,
      frequencies: context.started.filter((source) => source.type !== 'noise').map((source) => Math.round(source.frequency)),
    }));
  });
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
 * its own content shows: the Projects heading on the projects page, the Terminal heading on the terminal page,
 * the name heading everywhere else.
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
  } else if (path.includes('#/terminal')) {
    await expect(page.getByRole('heading', { level: 1, name: 'Terminal' })).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { level: 1, name: 'Wesley Egbertsen' })).toBeVisible();
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

export type Rect = { x: number; y: number; width: number; height: number };

/** The bounding box of a visible element, or an error if it has none. */
export async function box(locator: Locator): Promise<Rect> {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error('element has no box');
  return rect;
}

export function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
