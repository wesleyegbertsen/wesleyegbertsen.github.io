import { expect, test, type Page } from '@playwright/test';
import { openSite, stubAudioContext } from './helpers.ts';
import { Pilot, gameOf as game, setMotion } from './pilot.ts';

// The battle screen and the way into it: the boxes of the two fighters, and the transition that plays over the
// map before a battle (a wild enemy: a blink and blinds; a boss: two blinks and an iris, longer). The transition
// needs motion, so these tests walk with reduced motion (the Pilot needs it) and then switch it off.

const input = (page: Page) => page.getByRole('textbox', { name: 'Command' });
const status = (page: Page) => page.getByRole('status');
const canvas = (page: Page) => game(page).locator('canvas');

async function play(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubAudioContext(page);
  const opened = await openSite(page, '/#/terminal');
  await input(page).fill('play');
  await page.keyboard.press('Enter');
  await expect(game(page)).toBeFocused();
  return { pilot: new Pilot(page), errors: opened.errors };
}

type Frame = { at: number; transition: string; music: string; battle: string; cue: string; light: boolean; dark: boolean };

/** Writes down, on every frame the browser draws, what the game says about itself and whether its screen is all light or all dark. */
const record = (page: Page) =>
  page.evaluate(() => {
    const scope = window as unknown as { frames: unknown[]; recording: boolean };
    scope.frames = [];
    scope.recording = true;
    const root = document.querySelector<HTMLElement>('[role="application"]')!;
    const screen = root.querySelector('canvas')!;
    const look = () => {
      if (!scope.recording) return;
      const { data } = screen.getContext('2d')!.getImageData(0, 0, 160, 144);
      let light = true;
      let dark = true;
      for (let i = 0; i < data.length && (light || dark); i += 4) {
        if (data[i] !== 224) light = false;
        if (data[i] !== 8) dark = false;
      }
      const { transition = '', music = '', battle = '', cue = '' } = root.dataset;
      scope.frames.push({ at: performance.now(), transition, music, battle, cue, light, dark });
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });

const recorded = (page: Page) =>
  page.evaluate(() => {
    const scope = window as unknown as { frames: unknown[]; recording: boolean };
    scope.recording = false;
    return scope.frames;
  }) as Promise<Frame[]>;

/** How often the screen went all light, and the most often it did within any one second. */
function blinks(frames: Frame[]) {
  const onsets = frames.filter((frame, i) => frame.light && !frames[i - 1]?.light).map((frame) => frame.at);
  const worst = Math.max(0, ...onsets.map((at) => onsets.filter((other) => other >= at && other < at + 1000).length));
  return { count: onsets.length, worst };
}

/** How many pixels of a part of the screen have the darkest shade. */
const darkIn = (page: Page, x: number, y: number, w: number, h: number) =>
  canvas(page).evaluate(
    (el, [left, top, width, height]) => {
      const { data } = (el as HTMLCanvasElement).getContext('2d')!.getImageData(left!, top!, width!, height!);
      let dark = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] === 8 && data[i + 1] === 24 && data[i + 2] === 32) dark++;
      return dark;
    },
    [x, y, w, h] as const,
  );

/** With reduced motion: to the examiner of the Academy, who is a boss. One more A starts the talk that ends in the battle. */
async function toTheExaminer(page: Page) {
  const { pilot, errors } = await play(page);
  await pilot.start();
  await pilot.goTo('town:A');
  await pilot.goTo('academy:E');
  return { pilot, errors };
}

test.describe('the battle screen', () => {
  test('gives each fighter a box with a bracket: the enemy top left, the player bottom right with the XP bar as its rail', async ({ page }) => {
    const { pilot } = await toTheExaminer(page);
    await pilot.press('a');
    await pilot.read();
    await expect(game(page)).toHaveAttribute('data-battle', 'exam');
    // The uprights of the two brackets, two pixels wide.
    expect(await darkIn(page, 4, 6, 2, 22)).toBe(44);
    expect(await darkIn(page, 154, 58, 2, 36)).toBe(72);
    // The rail of the enemy's box, and the XP bar that is the rail of the player's: its outline, empty at 0 XP.
    expect(await darkIn(page, 4, 26, 94, 2)).toBe(188);
    expect(await darkIn(page, 90, 91, 64, 1)).toBe(64);
    expect(await darkIn(page, 91, 92, 62, 1)).toBe(0);
    expect(await darkIn(page, 90, 93, 64, 1)).toBe(64);
    // Nothing but paper between the enemy's box and its picture, and right of the player's box.
    expect(await darkIn(page, 104, 0, 16, 44)).toBe(0);
    expect(await darkIn(page, 156, 44, 4, 60)).toBe(0);
  });
});

test.describe('the way into a battle', () => {
  test('a boss: two blinks and an iris over the map, in silence, then the battle screen and the boss tune', async ({ page }) => {
    const { errors } = await toTheExaminer(page);
    await setMotion(page, true);
    await record(page);
    // The examiner talks first; the text types itself. A, until the transition starts.
    for (let i = 0; i < 200 && (await game(page).getAttribute('data-battle')) === ''; i++) {
      await page.keyboard.press('z');
      await page.waitForTimeout(40);
    }
    await expect(game(page)).toHaveAttribute('data-transition', 'boss');
    // The line is announced at once, while the map is still on the screen.
    await expect(status(page)).toHaveText('FINAL EXAM wants to battle!');
    await expect(game(page)).toHaveAttribute('data-transition', '', { timeout: 6000 });
    await expect(game(page)).toHaveAttribute('data-music', 'boss');
    const frames = await recorded(page);

    const show = frames.filter((frame) => frame.transition === 'boss');
    const length = show.at(-1)!.at - show[0]!.at;
    // 108 ticks at 60 a second: 1.8 seconds, give or take a slow frame.
    expect(length).toBeGreaterThan(1400);
    expect(length).toBeLessThan(3200);
    expect(new Set(show.map((frame) => frame.music))).toEqual(new Set(['']));
    expect(new Set(show.map((frame) => frame.cue))).toEqual(new Set(['showdown']));
    // The screen blinks twice (a slow machine may miss a frame, never add one) and never three times in a second.
    const { count, worst } = blinks(show);
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(2);
    expect(worst).toBeLessThan(3);
    // It ends all dark, and the battle screen follows.
    expect(show.at(-1)!.dark).toBe(true);
    expect(show.filter((frame) => frame.dark).length).toBeGreaterThanOrEqual(2);
    expect(errors).toEqual([]);
  });

  test('a wild enemy: one blink and blinds, shorter, then the battle tune', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    // Into the meadow at the bottom left of town; whatever jumps out on the way is fought off.
    await pilot.goTo('town:3');
    await setMotion(page, true);
    await record(page);
    // Up and down the tall grass until something jumps out.
    for (let i = 0; i < 80 && (await game(page).getAttribute('data-battle')) === ''; i++) {
      const key = i % 2 === 0 ? 'ArrowDown' : 'ArrowUp';
      await page.keyboard.down(key);
      await page.waitForTimeout(250);
      await page.keyboard.up(key);
    }
    await expect(game(page)).not.toHaveAttribute('data-battle', '');
    await expect(status(page)).toHaveText(/^A wild [A-Z ]+ appeared!$/);
    await expect(game(page)).toHaveAttribute('data-transition', '', { timeout: 6000 });
    await expect(game(page)).toHaveAttribute('data-music', 'battle');
    const frames = await recorded(page);

    const show = frames.filter((frame) => frame.transition === 'wild');
    const length = show.at(-1)!.at - show[0]!.at;
    // 48 ticks: 0.8 seconds.
    expect(length).toBeGreaterThan(500);
    expect(length).toBeLessThan(1800);
    expect(new Set(show.map((frame) => frame.music))).toEqual(new Set(['']));
    expect(new Set(show.map((frame) => frame.cue))).toEqual(new Set(['encounter']));
    expect(blinks(show).count).toBeLessThanOrEqual(1);
    expect(show.at(-1)!.dark).toBe(true);
    // The map tune played up to the transition and the battle tune after it.
    const before = frames.filter((frame) => frame.at < show[0]!.at).at(-1);
    expect(before?.music).toBe('town');
  });

  test('with reduced motion there is none: the battle screen is there at once, and nothing blinks', async ({ page }) => {
    const { pilot } = await toTheExaminer(page);
    await record(page);
    await pilot.press('a');
    await pilot.read();
    await expect(game(page)).toHaveAttribute('data-battle', 'exam');
    await expect(game(page)).toHaveAttribute('data-transition', '');
    await expect(game(page)).toHaveAttribute('data-music', 'boss');
    await expect(game(page)).toHaveAttribute('data-cue', 'showdown');
    await page.waitForTimeout(300);
    const frames = await recorded(page);
    expect(frames.length).toBeGreaterThan(5);
    expect(frames.some((frame) => frame.transition !== '')).toBe(false);
    expect(frames.some((frame) => frame.light || frame.dark)).toBe(false);
    // And no extra press: one A after the line is the menu, as before.
    await pilot.fight();
    await expect(game(page)).toHaveAttribute('data-battle', '');
  });
});
