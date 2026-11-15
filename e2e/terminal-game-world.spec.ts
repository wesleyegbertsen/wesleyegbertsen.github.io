import { expect, test, type Page } from '@playwright/test';
import { audioLog, box, openSite, stubAudioContext } from './helpers.ts';
import { Pilot, gameOf as game } from './pilot.ts';

// The wider world of Career Quest: the volume wheel, levels and XP, the roads out of town, Hobby Hills and the
// dark cave. Reduced motion is on (one key is one whole move), and the page gets a recording AudioContext.

const input = (page: Page) => page.getByRole('textbox', { name: 'Command' });
const status = (page: Page) => page.getByRole('status');
const canvas = (page: Page) => game(page).locator('canvas');
const DARKEST = '8,24,32';

async function play(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubAudioContext(page);
  const opened = await openSite(page, '/#/terminal');
  await input(page).fill('play');
  await page.keyboard.press('Enter');
  await expect(game(page)).toBeFocused();
  return { pilot: new Pilot(page), errors: opened.errors };
}

const master = async (page: Page) => (await audioLog(page))[0]!.master;

/** How many pixels of a part of the game's screen have the darkest shade, and how many it has in all. */
const darkIn = (page: Page, x: number, y: number, w: number, h: number) =>
  canvas(page).evaluate(
    (el, [left, top, width, height, darkest]) => {
      const { data } = (el as HTMLCanvasElement).getContext('2d')!.getImageData(left as number, top as number, width as number, height as number);
      let dark = 0;
      for (let i = 0; i < data.length; i += 4) if (`${data[i]},${data[i + 1]},${data[i + 2]}` === darkest) dark++;
      return { dark, all: data.length / 4 };
    },
    [x, y, w, h, DARKEST] as const,
  );

/** Presses one of the on-screen buttons the way a finger does. */
async function touch(page: Page, name: string) {
  const rect = await box(page.getByRole('button', { name, exact: true }));
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.up();
}

test.describe('the volume wheel', () => {
  test('starts at 50%, turns with left and right on the volume row of the Settings tab, and says so', async ({ page }) => {
    const { pilot, errors } = await play(page);
    await pilot.start();
    await expect(game(page)).toHaveAttribute('data-volume', '50');
    expect(await master(page)).toBe(0.125);

    await pilot.press('start');
    await pilot.press('left');
    await pilot.press('down');
    await expect(game(page)).toHaveAttribute('data-row', 'volume');
    await expect(status(page)).toHaveText('Volume. Left and right change it.');

    await pilot.press('right');
    await expect(game(page)).toHaveAttribute('data-volume', '60');
    await expect(status(page)).toHaveText('Volume 60%');
    expect(await master(page)).toBeCloseTo(0.15, 6);

    for (let i = 0; i < 6; i++) await pilot.press('right');
    await expect(game(page)).toHaveAttribute('data-volume', '100');
    await expect(status(page)).toHaveText('Volume 100%');
    expect(await master(page)).toBe(0.25);

    for (let i = 0; i < 12; i++) await pilot.press('left');
    await expect(game(page)).toHaveAttribute('data-volume', '0');
    await expect(status(page)).toHaveText('Volume 0%');
    expect(await master(page)).toBe(0);
    // Still the settings: left and right did not switch the tab.
    await expect(game(page)).toHaveAttribute('data-menu', 'settings');
    expect(errors).toEqual([]);
  });

  test('is drawn on the screen as steps that fill up', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await pilot.press('start');
    await pilot.press('left');
    await pilot.press('down');
    // The ten steps of the wheel sit at 64..104 by 59..67 on the 160 x 144 screen.
    const wheel = () => darkIn(page, 64, 59, 40, 8);
    const half = (await wheel()).dark;
    expect(half).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) await pilot.press('right');
    const full = (await wheel()).dark;
    expect(full).toBeGreaterThan(half * 2);
    for (let i = 0; i < 10; i++) await pilot.press('left');
    expect((await wheel()).dark).toBe(0);
  });

  test('is apart from the M switch: off stays silent while the wheel turns, on comes back at the new level', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await page.keyboard.press('m');
    await expect(game(page)).toHaveAttribute('data-sound', 'off');
    await pilot.press('start');
    await pilot.press('left');
    await pilot.press('down');
    await pilot.press('right');
    await pilot.press('right');
    await expect(game(page)).toHaveAttribute('data-volume', '70');
    await expect(game(page)).toHaveAttribute('data-sound', 'off');
    expect(await master(page)).toBe(0);
    await page.keyboard.press('m');
    await expect(game(page)).toHaveAttribute('data-sound', 'on');
    expect(await master(page)).toBeCloseTo(0.175, 6);
  });

  test('lasts for the session, in memory only: a reload starts at 50% again', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await pilot.press('start');
    await pilot.press('left');
    await pilot.press('down');
    await pilot.press('left');
    await expect(game(page)).toHaveAttribute('data-volume', '40');
    await page.keyboard.press('Escape');
    await input(page).fill('play');
    await page.keyboard.press('Enter');
    await expect(game(page)).toHaveAttribute('data-volume', '40');
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => /volume|sound|game/i.test(key)))).toEqual([]);
    await page.reload();
    await input(page).fill('play');
    await page.keyboard.press('Enter');
    await expect(game(page)).toHaveAttribute('data-volume', '50');
  });

  test('turns with the D-pad on a touch device', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The D-pad exists on touch devices only');
    await play(page);
    await touch(page, 'A');
    for (let i = 0; i < 12 && (await game(page).getAttribute('data-dialogue')) === 'true'; i++) await touch(page, 'A');
    await touch(page, 'Start');
    await touch(page, 'Left');
    await touch(page, 'Down');
    await expect(game(page)).toHaveAttribute('data-row', 'volume');
    await touch(page, 'Right');
    await touch(page, 'Right');
    await expect(game(page)).toHaveAttribute('data-volume', '70');
    await expect(status(page)).toHaveText('Volume 70%');
    await touch(page, 'Left');
    await expect(game(page)).toHaveAttribute('data-volume', '60');
    expect(await master(page)).toBeCloseTo(0.15, 6);
  });
});

test.describe('the settings', () => {
  test('are the third tab of the Start menu, and SOUND there is the same switch as M', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await pilot.press('start');
    await pilot.press('right');
    await expect(game(page)).toHaveAttribute('data-menu', 'badges');
    await pilot.press('right');
    await expect(game(page)).toHaveAttribute('data-menu', 'settings');
    await expect(game(page)).toHaveAttribute('data-row', 'sound');
    await expect(status(page)).toHaveText('Settings. Sound, volume and screen.');
    await pilot.press('a');
    await expect(game(page)).toHaveAttribute('data-sound', 'off');
    await expect(status(page)).toHaveText('Sound off');
    expect(await master(page)).toBe(0);
    await page.keyboard.press('m');
    await expect(game(page)).toHaveAttribute('data-sound', 'on');
    expect(await master(page)).toBe(0.125);
    // The bag no longer has a volume row: down stays in the list.
    await pilot.press('right');
    await pilot.press('down');
    await expect(game(page)).toHaveAttribute('data-menu', 'items');
    await expect(game(page)).toHaveAttribute('data-row', '');
  });

  test('the screen has an LCD look laid over it, which SCREEN switches off and on', async ({ page }) => {
    const { pilot, errors } = await play(page);
    await pilot.start();
    const lcd = page.getByTestId('lcd');
    await expect(game(page)).toHaveAttribute('data-lcd', 'on');
    await expect(lcd).toHaveAttribute('aria-hidden', 'true');
    // Exactly over the screen, and it lets the pointer through.
    const over = await box(lcd);
    const under = await box(canvas(page));
    for (const side of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(over[side] - under[side])).toBeLessThan(1);
    expect(await lcd.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    expect(await lcd.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('linear-gradient');
    // The grid is one cell per game pixel.
    const cell = await lcd.evaluate((el) => parseFloat(getComputedStyle(el).backgroundSize));
    expect(cell).toBeCloseTo(under.width / 160, 1);
    // The picture under it is untouched: still the four shades and nothing else.
    const shades = await canvas(page).evaluate((el) => {
      const { data } = (el as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 160, 144);
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i += 4) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      return seen.size;
    });
    expect(shades).toBeLessThanOrEqual(4);

    await pilot.press('start');
    await pilot.press('left');
    await pilot.press('down');
    await pilot.press('down');
    await expect(game(page)).toHaveAttribute('data-row', 'screen');
    await pilot.press('a');
    await expect(game(page)).toHaveAttribute('data-lcd', 'off');
    await expect(status(page)).toHaveText('LCD look off');
    await expect(lcd).toHaveCount(0);
    await pilot.press('a');
    await expect(lcd).toHaveCount(1);
    await expect(status(page)).toHaveText('LCD look on');
    expect(errors).toEqual([]);
  });
});

test.describe('levels', () => {
  test('a wild enemy has a level, and beating it gives XP by that level', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await expect(game(page)).toHaveAttribute('data-level', '1');
    await expect(game(page)).toHaveAttribute('data-xp', '0');
    // Into the meadow at the bottom left of town, where a gold star lies in the tall grass.
    await pilot.hunt('town:3');
    const enemy = await game(page).getAttribute('data-battle');
    expect(['bug', 'typo', 'lint', 'todo']).toContain(enemy);
    await expect(status(page)).toHaveText(/^A wild [A-Z ]+ appeared!$/);
    const level = Number(await game(page).getAttribute('data-foe-level'));
    expect(level).toBeGreaterThanOrEqual(1);
    expect(level).toBeLessThanOrEqual(2);

    const heard: string[] = [];
    for (let i = 0; i < 80 && (await game(page).getAttribute('data-battle')) !== ''; i++) {
      await page.keyboard.press('z');
      heard.push((await status(page).textContent()) ?? '');
    }
    await expect(game(page)).toHaveAttribute('data-battle', '');
    expect(heard).toContain(`You gain ${level * 3} XP.`);
    await expect(game(page)).toHaveAttribute('data-xp', String(level * 3));
  });

  test('a boss is worth a level or two, which shows in the energy', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await pilot.goTo('town:A');
    await pilot.goTo('academy:E');
    await pilot.press('a');
    await pilot.read();
    await expect(game(page)).toHaveAttribute('data-foe-level', '3');
    await pilot.fight();
    // FINAL EXAM is level 3: 30 XP, which is level 3. Base 30, a badge 5, two levels 6.
    await expect(game(page)).toHaveAttribute('data-xp', '30');
    await expect(game(page)).toHaveAttribute('data-level', '3');
    await expect(game(page)).toHaveAttribute('data-hp', '41');
  });
});

test.describe('beyond the town', () => {
  test('the main road leads east to Hobby Hills, where a stop stamps the card', async ({ page }) => {
    const { pilot, errors } = await play(page);
    await pilot.start();
    await pilot.goTo('town:)');
    await expect(game(page)).toHaveAttribute('data-map', 'east');
    await expect(game(page)).toHaveAttribute('data-music', 'route');
    // A road, not a door: it sounds like steps.
    await expect(game(page)).toHaveAttribute('data-cue', 'path');
    await expect(status(page)).toHaveText('East Road');
    await pilot.goTo('east:)');
    await expect(game(page)).toHaveAttribute('data-map', 'hills');
    await expect(game(page)).toHaveAttribute('data-music', 'hills');

    await pilot.goTo('hills:1');
    await pilot.press('a');
    await expect(status(page)).toContainText('A telescope');
    await pilot.read();
    await expect(status(page)).toHaveText('Found a HOBBY STAMP! 1 of 10.');
    await expect(game(page)).toHaveAttribute('data-cue', 'star');
    // Looking again gives the text, not a second stamp.
    await pilot.press('a');
    await pilot.read();
    await expect(status(page)).not.toHaveText(/HOBBY STAMP/);
    expect(pilot.state.items.stamp).toBe(1);
    expect(errors).toEqual([]);
  });

  test('the cave turns a beginner away', async ({ page }) => {
    const { pilot } = await play(page);
    await pilot.start();
    await pilot.goTo('town:(');
    await expect(game(page)).toHaveAttribute('data-map', 'west');
    await pilot.goTo('west:D');
    await expect(game(page)).toHaveAttribute('data-map', 'west');
    await expect(status(page)).toContainText('Come back at Lv 3');
  });

  test('the cave is dark: light around the player, black further off, and the tune changes', async ({ page }) => {
    const { pilot, errors } = await play(page);
    await pilot.start();
    // Level 3 first: the FINAL EXAM is worth that.
    await pilot.goTo('town:A');
    await pilot.goTo('academy:E');
    await pilot.press('a');
    await pilot.read();
    await pilot.fight();
    await pilot.goTo('academy:m');
    await pilot.goTo('town:(');
    // In daylight the screen is far from black.
    const outside = await darkIn(page, 0, 0, 160, 144);
    expect(outside.dark / outside.all).toBeLessThan(0.35);

    await pilot.goTo('west:D');
    await expect(game(page)).toHaveAttribute('data-map', 'cave');
    await expect(game(page)).toHaveAttribute('data-music', 'cave');
    await expect(status(page)).toHaveText('The Cave');
    // Walked in going left: arrived at the east side of the cave, still facing left, with the sound of a cave.
    await expect(game(page)).toHaveAttribute('data-dir', 'left');
    await expect(game(page)).toHaveAttribute('data-x', '21');
    await expect(game(page)).toHaveAttribute('data-cue', 'cave');

    const whole = await darkIn(page, 0, 0, 160, 144);
    expect(whole.dark / whole.all).toBeGreaterThan(0.6);
    // The far corner is black (the top left: the speaker sits in the top right); the player's own cell is not.
    const corner = await darkIn(page, 0, 0, 32, 32);
    expect(corner.dark).toBe(corner.all);
    const x = Number(await game(page).getAttribute('data-x'));
    const y = Number(await game(page).getAttribute('data-y'));
    // The cave is 24 x 17 cells and the view 10 x 9: the camera holds the player near the right edge.
    const left = Math.max(0, Math.min(24 * 16 - 160, x * 16 + 8 - 80));
    const top = Math.max(0, Math.min(17 * 16 - 144, y * 16 + 8 - 72));
    const here = await darkIn(page, x * 16 - left, y * 16 - top, 16, 16);
    expect(here.dark).toBeLessThan(here.all * 0.8);
    // A step on, the light has moved along.
    await pilot.press('left');
    await expect(game(page)).toHaveAttribute('data-x', String(x - 1));
    const after = await darkIn(page, 0, 0, 160, 144);
    expect(after.dark / after.all).toBeGreaterThan(0.6);
    expect(errors).toEqual([]);
  });
});
