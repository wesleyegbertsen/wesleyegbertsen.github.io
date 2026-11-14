import { expect, test, type Locator, type Page } from '@playwright/test';
import { litPixels, openSite } from './helpers.ts';

/** Goes to the projects page through the site menu, opening it first on a narrow screen. */
async function openProjectsFromMenu(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole('button', { name: 'Menu' }).click();
  }
  await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Projects' }).click();
}

type Rect = { x: number; y: number; width: number; height: number };

async function box(locator: Locator): Promise<Rect> {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error('element has no box');
  return rect;
}

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test.describe('projects page', () => {
  test('a deep link loads the CardiPaw card with working images and links', async ({ page }) => {
    const { errors } = await openSite(page, '/#/projects');

    const card = page.getByRole('article', { name: 'CardiPaw' });
    await expect(card).toBeVisible();
    await expect(card.getByRole('link', { name: 'Live site' })).toHaveAttribute('href', 'https://cardipaw.com/');

    const images = card.getByRole('img');
    await expect(images).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      const image = images.nth(i);
      await image.scrollIntoViewIfNeeded();
      await expect(image).toBeInViewport();
      await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
      await expect(image).toHaveAttribute('src', /\/assets\/cardipaw-/);
    }
    expect(errors).toEqual([]);
  });

  test('Back and Forward move between home and projects; an unknown address goes home', async ({
    page,
    isMobile,
  }) => {
    await openSite(page);
    await openProjectsFromMenu(page, isMobile);
    await expect(page).toHaveURL(/#\/projects$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();

    // The first entry is the bare address the browser opened, which is home without a hash.
    await page.goBack();
    await expect(page).toHaveURL(/\/(#\/)?$/);
    await expect(page.getByRole('button', { name: 'Pikachu' })).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(/#\/projects$/);

    await openSite(page, '/#/unknown');
    await expect(page).toHaveURL(/#\/$/);
  });

  test('keeps the rain, the colour click, the panels and the bottom icons', async ({ page }) => {
    await openSite(page, '/#/projects');
    await expect.poll(() => litPixels(page), { timeout: 5000 }).toBeGreaterThan(50);

    await page.mouse.click(3, 3);
    expect(await page.evaluate(() => localStorage.getItem('currentMatrixFontColorIndex'))).toBe('1');

    await expect(page.getByRole('button', { name: 'Game Boy' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Email Wesley' })).toBeVisible();

    await page.getByRole('button', { name: 'Skills' }).click();
    await expect(page.getByRole('dialog', { name: 'My Technical Skills' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const glass = page.getByRole('heading', { level: 1, name: 'Projects' }).locator('..');
    expect(await glass.evaluate((el) => getComputedStyle(el).backdropFilter)).toContain('blur');
  });

  test('does not scroll sideways', async ({ page }) => {
    await openSite(page, '/#/projects');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('site menu', () => {
  test('wide screens: a transparent, monospace, uppercase list with a lit current item', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'wide screens only');
    await openSite(page);

    const nav = page.getByRole('navigation', { name: 'Site' });
    await expect(nav).toBeVisible();
    await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0);
    expect(await nav.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');

    const home = nav.getByRole('link', { name: 'Home' });
    const projects = nav.getByRole('link', { name: 'Projects' });
    const style = (link: Locator) =>
      link.evaluate((el) => {
        const own = getComputedStyle(el);
        const before = getComputedStyle(el, '::before');
        return {
          font: own.fontFamily,
          transform: own.textTransform,
          opacity: Number(own.opacity),
          shadow: own.textShadow,
          content: before.content,
          visibility: before.visibility,
        };
      });

    const current = await style(home);
    expect(current.font).toContain('monospace');
    expect(current.transform).toBe('uppercase');
    expect(current.content).toBe('">"');
    expect(current.visibility).toBe('visible');
    expect(current.shadow).not.toBe('none');

    const other = await style(projects);
    // Dimmed, but still easy to read over the rain.
    expect(other.opacity).toBeLessThan(1);
    expect(other.opacity).toBeGreaterThanOrEqual(0.75);
    expect(other.visibility).toBe('hidden');

    // A soft dark fade behind the list (not a box) keeps the rain from fighting the text.
    const fade = await nav.evaluate((el) => {
      const behind = getComputedStyle(el, '::before');
      return { image: behind.backgroundImage, events: behind.pointerEvents };
    });
    expect(fade.image).toContain('radial-gradient');
    expect(fade.events).toBe('none');
  });

  test('narrow screens: a Menu button works from the keyboard', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'narrow screens only');
    await openSite(page);

    const nav = page.getByRole('navigation', { name: 'Site' });
    await expect(nav.getByRole('link', { name: 'Projects' })).toHaveCount(0);

    const toggle = page.getByRole('button', { name: 'Menu' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(nav.getByRole('link', { name: 'Home' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();

    await page.keyboard.press('Enter');
    await nav.getByRole('link', { name: 'Projects' }).click();
    await expect(page).toHaveURL(/#\/projects$/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(nav.getByRole('link', { name: 'Projects' })).toHaveCount(0);
  });

  for (const path of ['/', '/#/projects']) {
    test(`stays clear of the page content and the click-through corner on ${path}`, async ({ page }) => {
      await openSite(page, path);
      const nav = await box(page.getByRole('navigation', { name: 'Site' }));

      // The background click point must not land on the menu.
      expect(3 >= nav.x && 3 <= nav.x + nav.width && 3 >= nav.y && 3 <= nav.y + nav.height).toBe(false);

      const others = [
        page.getByRole('link', { name: 'Email Wesley' }),
        page.getByRole('navigation', { name: 'Social and about' }),
        page.getByRole('button', { name: 'Game Boy' }),
        ...(path === '/'
          ? [
              page.getByRole('button', { name: 'Wesley Egbertsen logo' }),
              page.getByRole('button', { name: 'Pikachu' }),
              page.getByRole('button', { name: /^Poké Ball \d$/ }).first(),
              page.getByRole('button', { name: /^Poké Ball \d$/ }).last(),
            ]
          : [page.getByRole('heading', { level: 1, name: 'Projects' }).locator('..')]),
      ];
      for (const other of others) {
        expect(overlaps(nav, await box(other))).toBe(false);
      }
    });
  }
});
