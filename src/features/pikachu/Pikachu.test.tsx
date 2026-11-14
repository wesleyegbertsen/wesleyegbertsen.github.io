import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FakeAudio, installFakeAudio } from '../../test/fakeAudio.ts';
import { Pikachu } from './Pikachu.tsx';

beforeEach(installFakeAudio);
afterEach(() => vi.unstubAllGlobals());

describe('Pikachu', () => {
  it('plays his cry at default volume and flashes while it plays', async () => {
    const user = userEvent.setup();
    render(<Pikachu />);
    const button = screen.getByRole('button', { name: 'Pikachu' });
    expect(button).toHaveAttribute('data-playing', 'false');

    await user.click(button);

    const [cry] = FakeAudio.of('pikachu');
    expect(cry?.play).toHaveBeenCalledOnce();
    expect(cry?.volume).toBe(1);
    expect(button).toHaveAttribute('data-playing', 'true');
  });

  it('stops flashing when the cry ends', async () => {
    const user = userEvent.setup();
    render(<Pikachu />);
    const button = screen.getByRole('button', { name: 'Pikachu' });
    await user.click(button);

    act(() => FakeAudio.of('pikachu')[0]!.end());

    expect(button).toHaveAttribute('data-playing', 'false');
  });

  it('restarts the cry on a second click', async () => {
    const user = userEvent.setup();
    render(<Pikachu />);
    const button = screen.getByRole('button', { name: 'Pikachu' });
    await user.click(button);
    await user.click(button);

    const cries = FakeAudio.of('pikachu');
    expect(cries).toHaveLength(2);
    expect(cries[0]?.pause).toHaveBeenCalled();
    expect(button).toHaveAttribute('data-playing', 'true');
  });
});
