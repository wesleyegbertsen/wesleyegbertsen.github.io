import { expect, test, type Page } from '@playwright/test';
import { profile } from '../src/data/profile.ts';
import { openSite } from './helpers.ts';

const input = (page: Page) => page.getByRole('textbox', { name: 'Command' });
const log = (page: Page) => page.getByRole('log', { name: 'Terminal output' });
const glass = (page: Page) => page.getByRole('heading', { level: 1, name: 'Terminal' }).locator('..');

/** Types a line and presses Enter. */
async function run(page: Page, line: string) {
  await input(page).fill(line);
  await page.keyboard.press('Enter');
}

test.describe('the terminal page', () => {
  test('opens from the site menu', async ({ page, isMobile }) => {
    await openSite(page);
    const nav = page.getByRole('navigation', { name: 'Site' });
    if (isMobile) await page.getByRole('button', { name: 'Menu' }).click();

    await nav.getByRole('link', { name: 'Terminal' }).click();

    await expect(page).toHaveURL(/#\/terminal$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Terminal' })).toBeVisible();
  });

  test('has the input focused, runs commands and tells an unknown one apart', async ({ page }) => {
    const { errors } = await openSite(page, '/#/terminal');
    await expect(input(page)).toBeFocused();

    await run(page, 'whoami');
    await expect(log(page)).toContainText('guest@wesleyegbertsen:~$ whoami');
    await expect(log(page)).toContainText(/whoami\s*guest/);

    await run(page, 'nope');
    await expect(log(page)).toContainText("command not found: nope. Type 'help' to see the commands.");

    expect(errors).toEqual([]);
  });

  test('lists the home folder and prints a file from it', async ({ page }) => {
    await openSite(page, '/#/terminal');

    await run(page, 'ls');
    await expect(log(page)).toContainText('about.txt');
    await run(page, 'cat about.txt');

    await expect(log(page)).toContainText(profile.role);
  });

  test('recalls the last command with the Up arrow', async ({ page }) => {
    await openSite(page, '/#/terminal');
    await run(page, 'echo hello there');

    await page.keyboard.press('ArrowUp');

    await expect(input(page)).toHaveValue('echo hello there');
  });

  test('completes with Tab, and lets Tab leave when the input is empty', async ({ page }) => {
    await openSite(page, '/#/terminal');
    await input(page).fill('cat ab');
    await page.keyboard.press('Tab');
    await expect(input(page)).toHaveValue('cat about.txt ');
    await expect(input(page)).toBeFocused();

    await input(page).fill('');
    await page.keyboard.press('Tab');
    await expect(input(page)).not.toBeFocused();
  });

  test('clears with Ctrl+L and stays on the page', async ({ page }) => {
    await openSite(page, '/#/terminal');
    await run(page, 'whoami');
    await expect(log(page)).toContainText('guest');

    await page.keyboard.press('Control+l');

    await expect(log(page)).toBeEmpty();
    await expect(page.getByRole('heading', { level: 1, name: 'Terminal' })).toBeVisible();
  });

  test('focuses the input again after a click on the output', async ({ page }) => {
    await openSite(page, '/#/terminal');
    await expect(input(page)).toBeFocused();
    await input(page).blur();
    await expect(input(page)).not.toBeFocused();

    await log(page).click();

    await expect(input(page)).toBeFocused();
  });

  test('open projects goes to the projects page', async ({ page }) => {
    await openSite(page, '/#/terminal');

    await run(page, 'open projects');

    await expect(page).toHaveURL(/#\/projects$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  });

  test('theme blue sets the real site theme and stores it', async ({ page }) => {
    // Colours fade for 0.4 s, so switch the fade off.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openSite(page, '/#/terminal');

    await run(page, 'theme blue');

    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('blue');
    expect(await page.evaluate(() => localStorage.getItem('currentMatrixFontColorIndex'))).toBe('2');
  });

  test('the glass is blurred, and its border follows the theme', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openSite(page, '/#/terminal');
    const border = () => glass(page).evaluate((el) => getComputedStyle(el).borderTopColor);
    const before = await border();
    expect(await glass(page).evaluate((el) => getComputedStyle(el).backdropFilter)).toContain('blur');

    await run(page, 'theme red');

    await expect.poll(border).not.toBe(before);
  });

  test('matrix runs and ends on the visitor theme, with the rain out of the screen reader output', async ({ page }) => {
    await openSite(page, '/#/terminal');

    await run(page, 'matrix');

    await expect(log(page).locator('[data-kind="rain"]')).toHaveCount(12);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme), { timeout: 5000 }).toBe('green');
    await expect(log(page).locator('[data-kind="rain"]').first()).toHaveAttribute('aria-hidden', 'true');
  });

  test('keeps its output, folder and history after a visit to another page', async ({ page, isMobile }) => {
    await openSite(page, '/#/terminal');
    await run(page, 'cd projects');
    await run(page, 'echo still here');

    const goTo = async (name: string) => {
      if (isMobile) await page.getByRole('button', { name: 'Menu' }).click();
      await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name }).click();
    };
    await goTo('Home');
    await expect(page.getByRole('heading', { level: 1, name: 'Wesley Egbertsen' })).toBeVisible();
    await goTo('Projects');
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    await goTo('Terminal');

    await expect(log(page)).toContainText('echo still here');
    await expect(log(page)).toContainText('still here');
    await expect(page.getByText('guest@wesleyegbertsen:~/projects$').last()).toBeVisible();
    await page.keyboard.press('ArrowUp');
    await expect(input(page)).toHaveValue('echo still here');
  });

  test('help fits the terminal without scrolling', async ({ page }) => {
    await openSite(page, '/#/terminal');

    await run(page, 'help');

    await expect(log(page)).toContainText('neofetch');
    const scrolls = await log(page).evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(scrolls).toBe(false);
    await expect(log(page).getByText('Welcome.')).toBeInViewport({ ratio: 1 });
  });

  test('takes commands and their fixed words in any case', async ({ page }) => {
    const { errors } = await openSite(page, '/#/terminal');

    await run(page, 'HELP');
    await expect(log(page)).toContainText('guest@wesleyegbertsen:~$ HELP');
    await expect(log(page)).toContainText('neofetch');
    await expect(log(page)).not.toContainText('command not found');

    await run(page, 'PLAY SKIP');
    await expect(log(page)).toContainText('guest@wesleyegbertsen:~$ PLAY SKIP');
    await expect(log(page)).toContainText('Betabit');
    await expect(log(page)).toContainText(profile.links.email);
    await expect(log(page)).not.toContainText('Usage: play');
    await expect(page.getByRole('application')).toHaveCount(0);

    await run(page, 'WHOAMI');
    await expect(log(page)).toContainText(/WHOAMI\s*guest/);
    expect(errors).toEqual([]);
  });

  test('keeps its size however much is printed', async ({ page }) => {
    await openSite(page, '/#/terminal');
    const size = async () => {
      const rect = await glass(page).boundingBox();
      return `${Math.round(rect!.width)}x${Math.round(rect!.height)}`;
    };
    const empty = await size();

    await run(page, 'help');
    expect(await size()).toBe(empty);
    await run(page, 'cat projects/cardipaw.md');
    await run(page, 'neofetch');
    expect(await size()).toBe(empty);

    await page.keyboard.press('Control+l');
    expect(await size()).toBe(empty);
  });

  test('does not scroll sideways, even after long output', async ({ page }) => {
    await openSite(page, '/#/terminal');
    await run(page, 'cat projects/cardipaw.md');
    await run(page, 'neofetch');
    await run(page, 'cowsay a long line of words that wraps around on a narrow screen');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
