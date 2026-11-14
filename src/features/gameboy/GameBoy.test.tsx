import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FakeAudio, installFakeAudio } from '../../test/fakeAudio.ts';
import { GameBoy } from './GameBoy.tsx';
import { MailLink } from './MailLink.tsx';

beforeEach(installFakeAudio);
afterEach(() => vi.unstubAllGlobals());

const gameboy = () => screen.getByRole('button', { name: 'Game Boy' });
const video = () => screen.getByTitle('Titan cat video');

describe('GameBoy', () => {
  it('plays the start-up sound at volume 0.3 on click', async () => {
    const user = userEvent.setup();
    render(<GameBoy />);

    await user.click(gameboy());

    const [sound] = FakeAudio.of('gb.mp3');
    expect(sound?.play).toHaveBeenCalledOnce();
    expect(sound?.volume).toBe(0.3);
  });

  it('keeps the video mounted but hidden at first', () => {
    render(<GameBoy />);
    expect(video()).toHaveAttribute('src', 'https://www.youtube.com/embed/8UWb9FWZb2k');
    expect(video()).toHaveAttribute('data-visible', 'false');
    expect(video()).toHaveAttribute('inert');
  });

  it('shows the video with the zelda sound on double-click', async () => {
    const user = userEvent.setup();
    render(<GameBoy />);

    await user.dblClick(gameboy());

    expect(video()).toHaveAttribute('data-visible', 'true');
    expect(video()).not.toHaveAttribute('inert');
    const [zelda] = FakeAudio.of('zelda-item');
    expect(zelda?.play).toHaveBeenCalledOnce();
    expect(zelda?.volume).toBe(0.3);
    // A double-click is two clicks first, so the start-up sound restarts twice.
    expect(FakeAudio.of('gb.mp3')).toHaveLength(2);
  });

  it('hides the video on the next double-click without the zelda sound', async () => {
    const user = userEvent.setup();
    render(<GameBoy />);
    await user.dblClick(gameboy());
    await user.dblClick(gameboy());

    expect(video()).toHaveAttribute('data-visible', 'false');
    expect(FakeAudio.of('zelda-item')).toHaveLength(1);
  });
});

describe('MailLink', () => {
  it('links to the email address', () => {
    render(<MailLink />);
    expect(screen.getByRole('link', { name: 'Email Wesley' })).toHaveAttribute(
      'href',
      'mailto:wesleyegbertsen@gmail.com',
    );
  });
});
