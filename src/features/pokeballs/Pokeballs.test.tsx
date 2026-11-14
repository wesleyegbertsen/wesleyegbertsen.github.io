import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FakeAudio, installFakeAudio } from '../../test/fakeAudio.ts';
import { Pokeballs } from './Pokeballs.tsx';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  installFakeAudio();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const setup = () => {
  const user = userEvent.setup({ delay: null });
  render(<Pokeballs />);
  return user;
};

const ball = (n: number) => screen.getByRole('button', { name: `Poké Ball ${n}` });

describe('Pokeballs', () => {
  it('shows four balls and no counter at first', () => {
    setup();
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('counts down as balls are found', async () => {
    const user = setup();
    await user.click(ball(1));
    expect(screen.getByRole('status')).toHaveTextContent('Poké Balls left: 3');
    await user.click(ball(2));
    expect(screen.getByRole('status')).toHaveTextContent('Poké Balls left: 2');
    await user.click(ball(3));
    expect(screen.getByRole('status')).toHaveTextContent('Poké Balls left: 1');
  });

  it('plays the catch sound from 0.5s at volume 0.3', async () => {
    const user = setup();
    await user.click(ball(1));
    const [sound] = FakeAudio.of('pokeball');
    expect(sound?.volume).toBe(0.3);
    expect(sound?.currentTime).toBe(0.5);
    expect(sound?.play).toHaveBeenCalledOnce();
  });

  it('ignores a ball that was already found', async () => {
    const user = setup();
    await user.click(ball(1));
    await user.click(ball(1));
    expect(screen.getByRole('status')).toHaveTextContent('Poké Balls left: 3');
    expect(FakeAudio.of('pokeball')).toHaveLength(1);
  });

  it('announces victory and plays the victory sound about 2s after the last ball', async () => {
    const user = setup();
    for (const n of [1, 2, 3, 4]) await user.click(ball(n));

    expect(screen.getByRole('status')).toHaveTextContent('Found all Poké Balls!');
    expect(FakeAudio.of('victory')).toHaveLength(0);

    act(() => void vi.advanceTimersByTime(1800));
    expect(FakeAudio.of('victory')).toHaveLength(0);

    act(() => void vi.advanceTimersByTime(400));
    const [victory] = FakeAudio.of('victory');
    expect(victory?.play).toHaveBeenCalledOnce();
    expect(victory?.volume).toBe(0.3);
  });

  it('does not play the victory sound if unmounted first', async () => {
    const user = userEvent.setup({ delay: null });
    const { unmount } = render(<Pokeballs />);
    for (const n of [1, 2, 3, 4]) await user.click(ball(n));
    unmount();
    act(() => void vi.advanceTimersByTime(3000));
    expect(FakeAudio.of('victory')).toHaveLength(0);
  });
});
