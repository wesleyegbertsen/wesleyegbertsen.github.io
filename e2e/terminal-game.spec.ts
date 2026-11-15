import { expect, test, type Page } from '@playwright/test';
import { profile } from '../src/data/profile.ts';
import { openSite } from './helpers.ts';

const input = (page: Page) => page.getByRole('textbox', { name: 'Command' });
const log = (page: Page) => page.getByRole('log', { name: 'Terminal output' });
const game = (page: Page) => page.getByRole('application');
const status = (page: Page) => page.getByRole('status');
const glass = (page: Page) => page.getByRole('heading', { level: 1, name: 'Terminal' }).locator('..');
const playerX = async (page: Page) => Number(await game(page).getAttribute('data-player-x'));

async function run(page: Page, line: string) {
  await input(page).fill(line);
  await page.keyboard.press('Enter');
}

const glassSize = async (page: Page) => {
  const rect = await glass(page).boundingBox();
  return `${Math.round(rect!.width)}x${Math.round(rect!.height)}`;
};

test.describe('the platformer in the terminal', () => {
  test('play opens the game on the same page, in a panel of the same size', async ({ page }) => {
    await openSite(page, '/#/terminal');
    const empty = await glassSize(page);

    await run(page, 'play');

    await expect(game(page)).toBeVisible();
    await expect(game(page)).toBeFocused();
    await expect(input(page)).toHaveCount(0);
    await expect(log(page)).toHaveCount(0);
    await expect(page).toHaveURL(/#\/terminal$/);
    expect(await glassSize(page)).toBe(empty);
    await expect(game(page).locator('canvas')).toHaveAttribute('aria-hidden', 'true');
    await expect(game(page).locator('pre')).toHaveCount(0);
  });

  test('does not scroll sideways while playing', async ({ page }) => {
    await openSite(page, '/#/terminal');
    await run(page, 'play');
    await expect(game(page)).toBeFocused();
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowRight');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('runs while ArrowRight is held and the page does not scroll', async ({ page }) => {
    await openSite(page, '/#/terminal');
    await run(page, 'play');
    await expect(game(page)).toBeFocused();
    const before = await playerX(page);

    await page.keyboard.down('ArrowRight');
    await expect.poll(() => playerX(page)).toBeGreaterThan(before + 1);
    await page.keyboard.up('ArrowRight');

    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('announces the first item, labelled from the data, and nothing per frame', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openSite(page, '/#/terminal');
    await run(page, 'play');
    await expect(game(page)).toBeFocused();
    await expect(status(page)).toHaveText('');

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowRight');
      if ((await status(page).textContent()) !== '') break;
    }

    await expect(status(page)).toHaveText('Collected Betabit');
    await expect(game(page)).toHaveAttribute('data-collected', '1');
  });

  test('Escape returns to the shell with the command line focused', async ({ page }) => {
    await openSite(page, '/#/terminal');
    await run(page, 'whoami');
    await run(page, 'play');
    await expect(game(page)).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(input(page)).toBeFocused();
    await expect(log(page)).toContainText("Left the run. Type 'play' to carry on.");
    await expect(log(page)).toContainText(/whoami\s*guest/);
    await run(page, 'whoami');
    await expect(log(page)).toContainText(/whoami\s*guest\s*(.|\n)*whoami\s*guest/);
  });

  test('with reduced motion a press moves the game once and then it stands still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openSite(page, '/#/terminal');
    await run(page, 'play');
    await expect(game(page)).toBeFocused();
    const picture = () => game(page).locator('canvas').evaluate((el) => (el as HTMLCanvasElement).toDataURL());
    const before = await picture();

    await page.keyboard.press('ArrowRight');
    const after = await picture();
    expect(after).not.toBe(before);

    await page.waitForTimeout(500);
    expect(await picture()).toBe(after);
  });

  test('shows the Left, Right and Jump buttons on touch devices only', async ({ page, isMobile }) => {
    await openSite(page, '/#/terminal');
    await run(page, 'play');
    await expect(game(page)).toBeVisible();

    for (const name of ['Left', 'Right', 'Jump']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(isMobile ? 1 : 0);
    }
  });

  test('holding the Right button moves the player on a touch device', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The buttons exist on touch devices only');
    await openSite(page, '/#/terminal');
    await run(page, 'play');
    const before = await playerX(page);
    const right = page.getByRole('button', { name: 'Right', exact: true });
    const box = (await right.boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(() => playerX(page)).toBeGreaterThan(before);
    await page.mouse.up();
  });

  test('resumes where it was after a visit to another page, and writes nothing to storage', async ({
    page,
    isMobile,
  }) => {
    await openSite(page, '/#/terminal');
    const storageBefore = await page.evaluate(() => Object.keys(localStorage).sort());
    await run(page, 'play');
    await expect(game(page)).toBeFocused();
    await page.keyboard.down('ArrowRight');
    await expect.poll(() => playerX(page)).toBeGreaterThan(5);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(300);
    const x = await playerX(page);

    const goTo = async (name: string) => {
      if (isMobile) await page.getByRole('button', { name: 'Menu' }).click();
      await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name }).click();
    };
    await goTo('Projects');
    await expect(page).toHaveURL(/#\/projects$/);
    await goTo('Terminal');

    await expect(game(page)).toBeVisible();
    expect(await playerX(page)).toBe(x);
    expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual(storageBefore);
  });

  test('a reload brings the shell back, and play starts at the beginning', async ({ page }) => {
    await openSite(page, '/#/terminal');
    await run(page, 'play');
    await page.keyboard.down('ArrowRight');
    await expect.poll(() => playerX(page)).toBeGreaterThan(5);
    await page.keyboard.up('ArrowRight');

    await page.reload();
    await expect(input(page)).toBeVisible();
    await run(page, 'play');

    await expect(game(page)).toBeVisible();
    await expect.poll(() => playerX(page)).toBeLessThanOrEqual(4);
  });

  test('play skip prints the career as text', async ({ page }) => {
    await openSite(page, '/#/terminal');

    await run(page, 'play skip');

    await expect(log(page)).toContainText('Betabit');
    await expect(log(page)).toContainText(profile.links.email);
    await expect(game(page)).toHaveCount(0);
  });

  test('the Skip button leaves the game and prints the career', async ({ page }) => {
    await openSite(page, '/#/terminal');
    await run(page, 'play');

    await page.getByRole('button', { name: 'Skip to text' }).click();

    await expect(input(page)).toBeFocused();
    await expect(log(page)).toContainText('Betabit');
    await expect(log(page)).toContainText(profile.links.email);
  });
});
