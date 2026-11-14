import { expect, test, type Locator, type Page } from '@playwright/test';
import { THEMES } from '../src/features/theme/themes.ts';
import { openSite } from './helpers.ts';

const GREEN = THEMES[0]!;
const RED = THEMES[1]!;
const BLUE = THEMES[2]!;

/** `#rrggbb` as the browser prints a computed solid colour. */
function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

const themeName = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
const style = (locator: Locator, property: 'color' | 'backgroundColor' | 'borderLeftColor' | 'borderTopColor') =>
  locator.evaluate((el, p) => getComputedStyle(el)[p], property);

/** Clicks the exposed background corner, which moves the rain and the theme to the next colour. */
async function nextColour(page: Page) {
  await page.mouse.click(3, 3);
}

/** The element that shows the menu's accent: the current link on wide screens, the toggle on narrow ones. */
function menuAccent(page: Page, isMobile: boolean) {
  return isMobile
    ? page.getByRole('button', { name: 'Menu' })
    : page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Home' });
}

test.describe('the matrix colour is the site theme', () => {
  test('a click on the background moves the theme and the menu together', async ({ page, isMobile }) => {
    await openSite(page);
    expect(await themeName(page)).toBe('green');
    await expect.poll(() => style(menuAccent(page, isMobile), 'color')).toBe(rgb(GREEN.accent));

    await nextColour(page);

    await expect.poll(() => themeName(page)).toBe('red');
    expect(await page.evaluate(() => localStorage.getItem('currentMatrixFontColorIndex'))).toBe('1');
    await expect.poll(() => style(menuAccent(page, isMobile), 'color'), { timeout: 3000 }).toBe(rgb(RED.accent));
  });

  test('the open mobile menu border follows the theme', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'narrow screens only');
    await openSite(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    const overlay = page.getByRole('navigation', { name: 'Site' }).locator('div');
    const green = await style(overlay, 'borderTopColor');

    await page.keyboard.press('Escape');
    await nextColour(page);
    await expect.poll(() => themeName(page)).toBe('red');
    await page.getByRole('button', { name: 'Menu' }).click();

    await expect.poll(() => style(overlay, 'borderTopColor'), { timeout: 3000 }).not.toBe(green);
  });

  test('pills and both timelines follow the theme', async ({ page }) => {
    await openSite(page);
    await nextColour(page);
    await expect.poll(() => themeName(page)).toBe('red');

    await page.getByRole('button', { name: 'Skills' }).click();
    const pill = page.getByRole('dialog', { name: 'My Technical Skills' }).getByRole('listitem').first();
    await expect.poll(() => style(pill, 'backgroundColor'), { timeout: 3000 }).toBe(rgb(RED.accentSoft));
    expect(await style(pill, 'color')).toBe(rgb(RED.accentOnLight));

    await page.getByRole('button', { name: 'Work experience' }).click();
    const work = page.getByRole('dialog', { name: 'My Work Experience' }).getByRole('list');
    expect(await style(work, 'borderLeftColor')).toBe(rgb(RED.accentOnLight));

    await page.getByRole('button', { name: 'Education', exact: true }).click();
    const education = page.getByRole('dialog', { name: 'My Education' }).getByRole('list');
    expect(await style(education, 'borderLeftColor')).toBe(rgb(RED.accentOnLight));
  });

  test('the project card buttons and glass border follow the theme', async ({ page }) => {
    await openSite(page, '/#/projects');
    const live = page.getByRole('link', { name: 'Live site' });
    const glass = page.getByRole('heading', { level: 1, name: 'Projects' }).locator('..');
    expect(await style(live, 'backgroundColor')).toBe(rgb(GREEN.accent));
    const greenBorder = await style(glass, 'borderTopColor');

    await nextColour(page);

    await expect.poll(() => style(live, 'backgroundColor'), { timeout: 3000 }).toBe(rgb(RED.accent));
    expect(await style(live, 'color')).toBe(rgb(RED.onAccent));
    await expect.poll(() => style(glass, 'borderTopColor')).not.toBe(greenBorder);
  });

  test('the theme survives a reload', async ({ page }) => {
    await openSite(page, '/#/projects');
    await nextColour(page);
    await expect.poll(() => themeName(page)).toBe('red');

    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();

    expect(await themeName(page)).toBe('red');
    await expect
      .poll(() => style(page.getByRole('link', { name: 'Live site' }), 'backgroundColor'))
      .toBe(rgb(RED.accent));
  });

  test('a stored theme is on the page before React renders anything', async ({ page, isMobile }) => {
    await page.addInitScript(() => {
      localStorage.setItem('currentMatrixFontColorIndex', '2');
      const order: string[] = [];
      (window as unknown as { __order: string[] }).__order = order;
      new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === 'attributes') order.push(`theme:${document.documentElement.dataset.theme}`);
          else if ((record.target as HTMLElement).id === 'root' && record.addedNodes.length) order.push('react');
        }
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-theme'] });
    });
    await openSite(page);

    const order = await page.evaluate(() => (window as unknown as { __order: string[] }).__order);
    // main.tsx sets the stored theme first, so the first thing seen is the theme and it is never green.
    expect(order[0]).toBe('theme:blue');
    expect(order).not.toContain('theme:green');
    expect(order.indexOf('theme:blue')).toBeLessThan(order.indexOf('react'));
    await expect.poll(() => style(menuAccent(page, isMobile), 'color')).toBe(rgb(BLUE.accent));
  });

  test('loading a stored theme does not fade in from green', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(() => {
      localStorage.setItem('currentMatrixFontColorIndex', '2');
      const seen: string[] = [];
      (window as unknown as { __accents: string[] }).__accents = seen;
      let frames = 0;
      const tick = () => {
        const root = document.documentElement;
        if (root.dataset.theme) seen.push(getComputedStyle(root).getPropertyValue('--accent').trim());
        if (++frames < 90) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await openSite(page);
    await page.waitForTimeout(1500);

    const seen = await page.evaluate(() => (window as unknown as { __accents: string[] }).__accents);
    expect(seen.length).toBeGreaterThan(10);
    // One value for the whole load: no frame ever shows green or a colour between green and blue.
    expect(new Set(seen).size).toBe(1);
  });

  test('an invalid stored colour falls back to green, and the first click goes to red', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('currentMatrixFontColorIndex', '9'));
    await openSite(page);
    expect(await themeName(page)).toBe('green');

    await nextColour(page);

    expect(await page.evaluate(() => localStorage.getItem('currentMatrixFontColorIndex'))).toBe('1');
    await expect.poll(() => themeName(page)).toBe('red');
  });

  test('the GitHub and LinkedIn hovers keep their brand colours in every theme', async ({ page, isMobile }) => {
    test.skip(isMobile, 'hover needs a pointer');
    await openSite(page);
    const bar = page.getByRole('navigation', { name: 'Social and about' });

    for (const theme of [RED, BLUE]) {
      await nextColour(page);
      await expect.poll(() => themeName(page)).toBe(theme.name);

      await bar.getByRole('link', { name: 'GitHub' }).hover();
      await expect
        .poll(() => style(bar.getByRole('link', { name: 'GitHub' }), 'color'), { timeout: 3000 })
        .toBe('rgb(110, 84, 148)');
      await bar.getByRole('link', { name: 'LinkedIn' }).hover();
      await expect
        .poll(() => style(bar.getByRole('link', { name: 'LinkedIn' }), 'color'), { timeout: 3000 })
        .toBe('rgb(0, 115, 177)');
      await bar.getByRole('button', { name: 'Skills' }).hover();
      await expect
        .poll(() => style(bar.getByRole('button', { name: 'Skills' }), 'color'), { timeout: 3000 })
        .toBe(rgb(theme.accent));
    }
  });
});

test.describe('theme motion', () => {
  test('colours fade for most visitors', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openSite(page);
    // The fade is switched on one paint after load, so a stored theme does not animate in.
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).transitionProperty))
      .toContain('--accent');
  });

  test('colours switch at once when the visitor asks for less motion', async ({ page, isMobile }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openSite(page);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).transitionDuration)).toBe('0s');

    await nextColour(page);

    // No polling: the new colour is there on the first read.
    await expect.poll(() => themeName(page)).toBe('red');
    expect(await style(menuAccent(page, isMobile), 'color')).toBe(rgb(RED.accent));
  });
});
