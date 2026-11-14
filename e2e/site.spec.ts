import { expect, test } from '@playwright/test';
import { litPixels, openSite, playsOf } from './helpers.ts';

test('loads cleanly with every part of the page', async ({ page }) => {
  const { errors } = await openSite(page);

  await expect(page).toHaveTitle('Wesley Egbertsen');
  await expect(page.getByRole('button', { name: 'Wesley Egbertsen logo' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Poké Ball \d$/ })).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Game Boy' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Email Wesley' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Social and about' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('does not scroll sideways and allows zoom', async ({ page }) => {
  await openSite(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).not.toMatch(/user-scalable|maximum-scale/);
});

test('serves the custom domain file and the PDF at their old URLs', async ({ request }) => {
  const cname = await request.get('/CNAME');
  expect(cname.ok()).toBe(true);
  expect(await cname.text()).toContain('www.wesleyegbertsen.nl');

  const pdf = await request.get('/docs/Replacing%20Paper%20Contracts%20With%20Ethereum.pdf');
  expect(pdf.ok()).toBe(true);
  expect(pdf.headers()['content-type']).toContain('pdf');
});

test.describe('panels', () => {
  test('skills open as chips and close on Escape', async ({ page }) => {
    await openSite(page);
    const button = page.getByRole('button', { name: 'Skills' });
    await button.click();

    const dialog = page.getByRole('dialog', { name: 'My Technical Skills' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('listitem')).toHaveCount(16);
    await expect(dialog.getByText('GitHub', { exact: true })).toBeVisible();
    await expect(dialog).toBeInViewport({ ratio: 1 });

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
  });

  test('work experience fits the screen and scrolls inside the panel', async ({ page }) => {
    await openSite(page);
    await page.getByRole('button', { name: 'Work experience' }).click();

    const dialog = page.getByRole('dialog', { name: 'My Work Experience' });
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByRole('listitem').first()).toContainText('Consultant');
    await expect(dialog.getByRole('listitem').first()).toContainText('May 2026 - Present');

    // Ten jobs are taller than the panel, so the oldest one starts out of view.
    const last = dialog.getByRole('listitem').last();
    await expect(last).not.toBeInViewport();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    await expect(dialog).toBeInViewport({ ratio: 1 });
  });

  test('an outside press closes a panel and one panel replaces the other', async ({ page }) => {
    await openSite(page);
    await page.getByRole('button', { name: 'Skills' }).click();
    await page.getByRole('button', { name: 'Work experience' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.getByRole('dialog', { name: 'My Work Experience' })).toBeVisible();

    // Top-left corner: background, clear of the content.
    await page.mouse.click(3, 3);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('easter eggs', () => {
  test('Pikachu cries and flashes until it ends', async ({ page }) => {
    await openSite(page);
    const pikachu = page.getByRole('button', { name: 'Pikachu' });
    await pikachu.click();

    await expect(pikachu).toHaveAttribute('data-playing', 'true');
    const [cry] = await playsOf(page, 'pikachu');
    expect(cry?.volume).toBe(1);
    await expect.poll(async () => (await playsOf(page, 'pikachu'))[0]?.ok).toBe(true);
    // The real clip is short, so the flashing stops by itself.
    await expect(pikachu).toHaveAttribute('data-playing', 'false', { timeout: 15_000 });
  });

  test('finding all four Poké Balls counts down and then celebrates', async ({ page }) => {
    await openSite(page);
    const status = page.getByRole('status');

    await expect(status).toHaveCount(0);
    for (const [index, left] of [[1, 3], [2, 2], [3, 1]] as const) {
      await page.getByRole('button', { name: `Poké Ball ${index}` }).click();
      await expect(status).toHaveText(`Poké Balls left: ${left}`);
    }
    // Pressing a found ball again changes nothing.
    await page.getByRole('button', { name: 'Poké Ball 1' }).click();
    await expect(status).toHaveText('Poké Balls left: 1');

    await page.getByRole('button', { name: 'Poké Ball 4' }).click();
    await expect(status).toHaveText('Found all Poké Balls!');

    const catches = await playsOf(page, 'pokeball');
    expect(catches).toHaveLength(4);
    expect(catches.every((c) => c.volume === 0.3 && c.startAt === 0.5)).toBe(true);

    await expect.poll(async () => (await playsOf(page, 'victory')).length, { timeout: 5000 }).toBe(1);
    const [victory] = await playsOf(page, 'victory');
    expect(victory?.volume).toBe(0.3);
    await expect.poll(async () => (await playsOf(page, 'victory'))[0]?.ok).toBe(true);
  });

  test('the logo brings the cat; the cat puts on glasses and raps', async ({ page }) => {
    await openSite(page);
    // includeHidden: role queries skip hidden elements, and this cat is hidden at first.
    const cat = page.getByRole('button', { name: 'Cat', includeHidden: true });
    await expect(cat).toBeHidden();

    await page.getByRole('button', { name: 'Wesley Egbertsen logo' }).click();
    await expect(cat).toBeVisible();
    await expect(cat).toBeInViewport({ ratio: 1 });
    expect((await playsOf(page, 'cat-'))[0]?.volume).toBe(1);

    await cat.click();
    await expect(cat).toHaveAttribute('data-glasses', 'true');
    const [rap] = await playsOf(page, 'cat_rap');
    expect(rap?.volume).toBe(0.3);
    await expect.poll(async () => (await playsOf(page, 'cat_rap'))[0]?.ok).toBe(true);

    // Hiding the cat takes the glasses off again.
    await page.getByRole('button', { name: 'Wesley Egbertsen logo' }).click();
    await expect(cat).toBeHidden();
    await expect(cat).toHaveAttribute('data-glasses', 'false');
  });

  test('the Game Boy beeps, and a double-click slides the video in and out', async ({ page }) => {
    await openSite(page);
    const gameboy = page.getByRole('button', { name: 'Game Boy' });
    const video = page.getByTitle('Titan cat video');

    await expect(video).toBeHidden();
    // Zoom is allowed, so a double-tap must not be taken by the browser's double-tap zoom.
    await expect(gameboy).toHaveCSS('touch-action', 'manipulation');
    await gameboy.click();
    expect((await playsOf(page, 'gb-'))[0]?.volume).toBe(0.3);

    await gameboy.dblclick();
    await expect(video).toBeVisible();
    await expect(video).toBeInViewport({ ratio: 1 });
    expect(await playsOf(page, 'zelda-item')).toHaveLength(1);

    await gameboy.dblclick();
    await expect(video).toBeHidden();
    expect(await playsOf(page, 'zelda-item')).toHaveLength(1);
  });
});

test.describe('matrix backdrop', () => {
  test('rains, and a click on the background cycles and remembers the colour', async ({ page }) => {
    await openSite(page);
    await expect.poll(() => litPixels(page), { timeout: 5000 }).toBeGreaterThan(50);

    const key = () => page.evaluate(() => localStorage.getItem('currentMatrixFontColorIndex'));
    expect(await key()).toBeNull();

    await page.mouse.click(3, 3);
    expect(await key()).toBe('1');
    await page.mouse.click(3, 3);
    expect(await key()).toBe('2');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Pikachu' })).toBeVisible();
    expect(await key()).toBe('2');
  });

  test('a stale or invalid stored colour is ignored: the cycle restarts from green', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('currentMatrixFontColorIndex', '9'));
    const { errors } = await openSite(page);
    await expect.poll(() => litPixels(page), { timeout: 5000 }).toBeGreaterThan(50);

    // Valid fallback is index 0, so the first click must store 1 (an unvalidated 9 would give 2).
    await page.mouse.click(3, 3);
    expect(await page.evaluate(() => localStorage.getItem('currentMatrixFontColorIndex'))).toBe('1');
    expect(errors).toEqual([]);
  });

  test('stays black under reduced motion and starts raining when that preference is lifted', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openSite(page);
    await page.waitForTimeout(1500);
    expect(await litPixels(page)).toBe(0);

    // Positive control: the same page rains once the preference changes.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect.poll(() => litPixels(page), { timeout: 5000 }).toBeGreaterThan(50);
  });

  test('stops drawing while the tab is hidden', async ({ page }) => {
    await openSite(page);
    await expect.poll(() => litPixels(page), { timeout: 5000 }).toBeGreaterThan(50);

    // Pretend the tab went to the background.
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const before = await litPixels(page);
    await page.waitForTimeout(1000);
    expect(await litPixels(page)).toBe(before);
  });
});
