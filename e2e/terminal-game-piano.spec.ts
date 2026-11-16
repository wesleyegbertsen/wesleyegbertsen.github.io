import { expect, test, type Page } from '@playwright/test';
import { frequencyOf } from '../src/features/terminal/game/audio/score.ts';
import { TRACKS } from '../src/features/terminal/game/content/music.ts';
import { audioLog, openSite, stubAudioContext } from './helpers.ts';
import { Pilot, gameOf as game } from './pilot.ts';

// The player piano in the cafe: on, off, on again and out of the cafe. Reduced motion is on (one key is one whole
// move), and the page gets a recording AudioContext.

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

/** The notes each voice of a track starts with, in Hz as the stub writes them down. */
const firstOf = (track: string) =>
  TRACKS[track]!.voices.map((voice) => voice.notes.trim().split(/\s+/)[0]!.split(':')[0]!).filter((token) => /^[A-G]/.test(token)).map((name) => Math.round(frequencyOf(name)));
const heardSince = async (page: Page, from: number) => (await audioLog(page))[0]!.frequencies.slice(from);

test('the player piano in the cafe plays the Moonlight Sonata, stops on a second A, and stops when the player leaves', async ({ page }) => {
  const { pilot, errors } = await play(page);
  await pilot.start();
  await pilot.goTo('town:X');
  await expect(game(page)).toHaveAttribute('data-map', 'cafe');
  await expect(game(page)).toHaveAttribute('data-music', 'cafe');
  await pilot.goTo('cafe:k');
  await expect(game(page)).toHaveAttribute('data-piano', 'off');

  // On: the piece, its first notes (the triplets' G sharp and the low C sharp) on the AudioContext.
  let from = (await audioLog(page))[0]!.frequencies.length;
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-piano', 'on');
  await expect(game(page)).toHaveAttribute('data-music', 'moonlight');
  await expect(status(page)).toHaveText('The player piano plays.');
  await expect.poll(() => heardSince(page, from)).toEqual(expect.arrayContaining(firstOf('moonlight')));

  // A again: off, and the cafe's own tune from its start.
  from = (await audioLog(page))[0]!.frequencies.length;
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-piano', 'off');
  await expect(game(page)).toHaveAttribute('data-music', 'cafe');
  await expect(status(page)).toHaveText('The player piano stops.');
  await expect.poll(() => heardSince(page, from)).toEqual(expect.arrayContaining(firstOf('cafe')));

  // On again, and out of the door: the town's tune, and the piano is off when the player comes back.
  await pilot.press('a');
  await expect(game(page)).toHaveAttribute('data-piano', 'on');
  await pilot.goTo('cafe:m');
  await expect(game(page)).toHaveAttribute('data-map', 'town');
  await expect(game(page)).toHaveAttribute('data-piano', 'off');
  await expect(game(page)).toHaveAttribute('data-music', 'town');
  await pilot.goTo('town:X');
  await expect(game(page)).toHaveAttribute('data-map', 'cafe');
  await expect(game(page)).toHaveAttribute('data-piano', 'off');
  await expect(game(page)).toHaveAttribute('data-music', 'cafe');
  expect(errors).toEqual([]);
});
