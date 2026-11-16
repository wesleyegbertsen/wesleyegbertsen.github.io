import { expect, test, type Page } from '@playwright/test';
import { CRIES } from '../src/features/terminal/game/content/music.ts';
import { DEX } from '../src/features/terminal/game/content/dex.ts';
import { audioLog, box, openSite, stubAudioContext } from './helpers.ts';
import { Pilot, gameOf as game } from './pilot.ts';

// The DEX of Career Quest, on the Start menu: ??? until a monster is met, then its page with a cry. Reduced motion
// is on (one key is one whole move), and the page gets a recording AudioContext.

const input = (page: Page) => page.getByRole('textbox', { name: 'Command' });
const status = (page: Page) => page.getByRole('status');

async function play(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubAudioContext(page);
  const opened = await openSite(page, '/#/terminal');
  await input(page).fill('play');
  await page.keyboard.press('Enter');
  await expect(game(page)).toBeFocused();
  return { pilot: new Pilot(page), errors: opened.errors };
}

/** Presses one of the on-screen buttons the way a finger does. */
async function touch(page: Page, name: string) {
  const rect = await box(page.getByRole('button', { name, exact: true }));
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.up();
}

test('the DEX: ??? before a monster is met, its page after, a cry on that page, up and down between the ones seen, out with B', async ({ page, isMobile }) => {
  test.setTimeout(90_000);
  const { pilot, errors } = await play(page);
  await pilot.start();
  // On the phone the buttons on the screen, on the desktop the keyboard (P is Start).
  const key = async (name: 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'start') => {
    if (isMobile) await touch(page, { up: 'Up', down: 'Down', left: 'Left', right: 'Right', a: 'A', b: 'B', start: 'Start' }[name]);
    else await page.keyboard.press({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', a: 'z', b: 'x', start: 'p' }[name]);
  };

  // Nothing met yet: the DEX is the third tab, every row ???.
  await pilot.press('start');
  await pilot.press('right');
  await pilot.press('right');
  await expect(game(page)).toHaveAttribute('data-menu', 'dex');
  await expect(status(page)).toHaveText('Dex');
  await expect(game(page)).toHaveAttribute('data-seen', '0');
  await expect(game(page)).toHaveAttribute('data-dex-row', DEX[0]!.enemy);
  await pilot.press('down');
  await expect(status(page)).toHaveText('2. Not seen yet');
  // A on a ??? opens nothing.
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-cue', 'bump');
  await expect(game(page)).toHaveAttribute('data-dex', '');
  await pilot.press('start');
  await expect(game(page)).toHaveAttribute('data-menu', '');

  // Into the meadow until two different monsters have been met (and beaten).
  const met: string[] = [];
  for (let i = 0; i < 8 && new Set(met).size < 2; i++) {
    await pilot.hunt('town:3');
    met.push((await game(page).getAttribute('data-battle'))!);
    await pilot.fight();
  }
  const seen = [...new Set(met)].sort((a, b) => DEX.findIndex((entry) => entry.enemy === a) - DEX.findIndex((entry) => entry.enemy === b));
  expect(seen.length).toBe(2);
  await expect(game(page)).toHaveAttribute('data-seen', '2');
  const [first, second] = seen.map((id) => DEX.findIndex((entry) => entry.enemy === id));

  // From here the keys of the device: Start, right twice to the DEX, down to the first one met.
  await key('start');
  await key('right');
  await key('right');
  await expect(game(page)).toHaveAttribute('data-menu', 'dex');
  for (let i = 0; i < first!; i++) await key('down');
  await expect(game(page)).toHaveAttribute('data-dex-row', seen[0]!);
  await key('a');
  await expect(game(page)).toHaveAttribute('data-dex', seen[0]!);
  await expect(game(page)).toHaveAttribute('data-dex-focus', 'cry');
  await expect(status(page)).toContainText(`No. ${first! + 1} `);
  await expect(status(page)).toContainText(DEX[first!]!.text);

  // CRY: its cue, and its first note on the AudioContext.
  const before = (await audioLog(page))[0]!.frequencies.length;
  await key('a');
  await expect(game(page)).toHaveAttribute('data-cue', `cry:${seen[0]}`);
  await expect.poll(async () => (await audioLog(page))[0]!.frequencies.slice(before)).toContain(Math.round(CRIES[seen[0]!]!.from));
  // Still on its page.
  await expect(game(page)).toHaveAttribute('data-dex', seen[0]!);

  // Down: the next one met, past the ??? between them; up: back.
  await key('down');
  await expect(game(page)).toHaveAttribute('data-dex', seen[1]!);
  await expect(status(page)).toContainText(`No. ${second! + 1} `);
  await key('up');
  await expect(game(page)).toHaveAttribute('data-dex', seen[0]!);

  // Right: BACK; left: CRY again. B goes back to the list, at that monster.
  await key('right');
  await expect(game(page)).toHaveAttribute('data-dex-focus', 'back');
  await key('left');
  await expect(game(page)).toHaveAttribute('data-dex-focus', 'cry');
  await key('b');
  await expect(game(page)).toHaveAttribute('data-dex', '');
  await expect(game(page)).toHaveAttribute('data-menu', 'dex');
  await expect(game(page)).toHaveAttribute('data-dex-row', seen[0]!);
  // Left and right on the list change tabs, as on the other pages.
  await key('right');
  await expect(game(page)).toHaveAttribute('data-menu', 'settings');
  expect(errors).toEqual([]);
});
