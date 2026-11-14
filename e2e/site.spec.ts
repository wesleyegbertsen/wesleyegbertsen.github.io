import { expect, test, type Locator } from '@playwright/test';
import { THEMES } from '../src/features/theme/themes.ts';
import { box, litPixels, openSite, overlaps, playsOf } from './helpers.ts';

test('loads cleanly with every part of the page', async ({ page }) => {
  const { errors } = await openSite(page);

  await expect(page).toHaveTitle('Wesley Egbertsen');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Wesley Egbertsen' }).getByRole('button', { name: 'Wesley Egbertsen' }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: /logo/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pikachu' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Poké Ball \d$/ })).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Game Boy' })).toBeVisible();
  const bar = page.getByRole('navigation', { name: 'Social and about' });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole('link', { name: 'Email Wesley' })).toHaveAttribute(
    'href',
    'mailto:wesleyegbertsen@gmail.com',
  );
  await expect(page.getByRole('heading', { level: 1, name: 'Wesley Egbertsen' })).toBeVisible();
  await expect(page.getByText('Full-stack .NET & Azure developer · I also build open-source apps')).toBeVisible();

  const featured = page.getByRole('region', { name: 'CardiPaw' });
  await featured.scrollIntoViewIfNeeded();
  await expect(featured).toBeVisible();
  await expect
    .poll(() => featured.getByRole('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("the featured project's View projects link opens the projects page", async ({ page }) => {
  await openSite(page);
  const link = page.getByRole('region', { name: 'CardiPaw' }).getByRole('link', { name: 'View projects' });
  await link.scrollIntoViewIfNeeded();
  await link.click();

  await expect(page).toHaveURL(/#\/projects$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
});

test('the home content is a glass panel like the projects page', async ({ page }) => {
  await openSite(page);
  const read = (glass: Locator) =>
    glass.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        backdropFilter: s.backdropFilter,
        backgroundColor: s.backgroundColor,
        borderTopWidth: s.borderTopWidth,
        borderRadius: s.borderRadius,
        fontFamily: s.fontFamily,
      };
    });
  const home = await read(page.getByRole('heading', { level: 1, name: 'Wesley Egbertsen' }).locator('..'));
  expect(home.backdropFilter).toContain('blur');
  expect(home.fontFamily).toContain('monospace');

  const hasCardImage = await page.evaluate(() =>
    [...document.querySelectorAll('*')].some((el) => getComputedStyle(el).backgroundImage.includes('/assets/bg')),
  );
  expect(hasCardImage).toBe(false);

  await page.goto('/#/projects');
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  const projects = await read(page.getByRole('heading', { level: 1, name: 'Projects' }).locator('..'));
  for (const key of ['backdropFilter', 'backgroundColor', 'borderTopWidth', 'borderRadius'] as const) {
    expect(home[key], key).toBe(projects[key]);
  }
});

test('the home glass stays readable in all four themes', async ({ page }) => {
  await openSite(page);
  const h1 = page.getByRole('heading', { level: 1, name: 'Wesley Egbertsen' });
  const glass = h1.locator('..');
  const teaserName = page.getByRole('region', { name: 'CardiPaw' }).getByRole('heading', { level: 2 });
  const rgb = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  };

  for (const [index, theme] of THEMES.entries()) {
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme.name);
    expect(await glass.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(10, 20, 10, 0.55)');
    expect(await glass.evaluate((el) => getComputedStyle(el).backdropFilter)).toContain('blur');
    expect(await h1.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(242, 247, 232)');
    await expect
      .poll(() => teaserName.evaluate((el) => getComputedStyle(el).color), { timeout: 3000 })
      .toBe(rgb(theme.accent));
    if (index < THEMES.length - 1) await page.mouse.click(3, 3);
  }
});

test('the intro and the featured project fit and leave every Poké Ball reachable', async ({ page, isMobile }) => {
  await openSite(page);

  for (const target of [
    page.getByRole('heading', { level: 1, name: 'Wesley Egbertsen' }),
    page.getByRole('region', { name: 'CardiPaw' }),
  ]) {
    await target.scrollIntoViewIfNeeded();
    await expect(target).toBeInViewport();
  }
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(sideways).toBeLessThanOrEqual(0);

  const glass = page.getByRole('heading', { level: 1, name: 'Wesley Egbertsen' }).locator('..');
  const fixed = [
    isMobile ? page.getByRole('button', { name: 'Menu' }) : page.getByRole('navigation', { name: 'Site' }),
    page.getByRole('navigation', { name: 'Social and about' }),
    page.getByRole('button', { name: 'Game Boy' }),
  ];

  // Each ball must be the topmost element at its own centre, and clear of the glass and the fixed controls.
  const balls = page.getByRole('button', { name: /^Poké Ball \d$/ });
  for (let i = 0; i < 4; i++) {
    const ball = balls.nth(i);
    await ball.scrollIntoViewIfNeeded();
    const covered = await ball.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return top !== el && !el.contains(top);
    });
    expect(covered, `Poké Ball ${i + 1} is covered`).toBe(false);

    const rect = await box(ball);
    expect(overlaps(rect, await box(glass)), `Poké Ball ${i + 1} overlaps the glass`).toBe(false);
    for (const other of fixed) {
      expect(overlaps(rect, await box(other)), `Poké Ball ${i + 1} overlaps a fixed control`).toBe(false);
    }
  }

  // The counter shows after the first find, in white, clear of the glass and every ball.
  await balls.nth(0).click();
  const status = page.getByRole('status');
  await expect(status).toBeVisible();
  const counter = await box(status);
  expect(overlaps(counter, await box(glass))).toBe(false);
  for (let i = 0; i < 4; i++) {
    expect(overlaps(counter, await box(balls.nth(i))), `counter overlaps ball ${i + 1}`).toBe(false);
  }
  await expect(status).toHaveCSS('color', 'rgb(255, 255, 255)');
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

test('serves the PDF at its old URL', async ({ request }) => {
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

  test('education opens in a panel that fits the screen', async ({ page }) => {
    await openSite(page);
    await page.getByRole('button', { name: 'Education', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'My Education' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('listitem').first()).toContainText('HAN University of Applied Sciences');
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

  test('the name brings the cat; the cat puts on glasses and raps', async ({ page }) => {
    await openSite(page);
    // includeHidden: role queries skip hidden elements, and this cat is hidden at first.
    const cat = page.getByRole('button', { name: 'Cat', exact: true, includeHidden: true });
    await expect(cat).toBeHidden();

    const toggle = page
      .getByRole('heading', { level: 1, name: 'Wesley Egbertsen' })
      .getByRole('button', { name: 'Wesley Egbertsen' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(cat).toBeVisible();
    await expect(cat).toBeInViewport({ ratio: 1 });
    expect((await playsOf(page, 'cat-'))[0]?.volume).toBe(1);

    await cat.click();
    await expect(cat).toHaveAttribute('data-glasses', 'true');
    const [rap] = await playsOf(page, 'cat_rap');
    expect(rap?.volume).toBe(0.3);
    await expect.poll(async () => (await playsOf(page, 'cat_rap'))[0]?.ok).toBe(true);

    // Hiding the cat takes the glasses off again.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(cat).toBeHidden();
    await expect(cat).toHaveAttribute('data-glasses', 'false');

    // The keyboard works too.
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(cat).toBeVisible();
    await page.keyboard.press('Space');
    await expect(cat).toBeHidden();
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
    await expect(page.getByRole('heading', { level: 1, name: 'Wesley Egbertsen' })).toBeVisible();
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
