import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FakeAudio, installFakeAudio } from '../../test/fakeAudio.ts';
import { Cat } from './Cat.tsx';
import { Logo } from './Logo.tsx';
import { useCat } from './useCat.ts';

function Harness() {
  const cat = useCat();
  return (
    <>
      <Logo catVisible={cat.visible} onClick={cat.toggleVisible} />
      <Cat visible={cat.visible} glasses={cat.glasses} onClick={cat.toggleGlasses} />
    </>
  );
}

beforeEach(installFakeAudio);
afterEach(() => vi.unstubAllGlobals());

const logo = () => screen.getByRole('button', { name: 'Wesley Egbertsen logo' });
const cat = () => screen.getByRole('button', { name: 'Cat', hidden: true });

describe('logo and cat', () => {
  it('starts with the cat hidden and out of reach', () => {
    render(<Harness />);
    expect(cat()).toHaveAttribute('data-visible', 'false');
    expect(cat()).toHaveAttribute('inert');
  });

  it('shows the cat and meows at default volume when the logo is pressed', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(logo());

    expect(cat()).toHaveAttribute('data-visible', 'true');
    const [meow] = FakeAudio.of('cat.mp3');
    expect(meow?.play).toHaveBeenCalledOnce();
    expect(meow?.volume).toBe(1);
  });

  it('puts glasses on and raps at volume 0.3 when the cat is pressed', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(logo());

    await user.click(cat());

    expect(cat()).toHaveAttribute('data-glasses', 'true');
    const [rap] = FakeAudio.of('cat_rap');
    expect(rap?.play).toHaveBeenCalledOnce();
    expect(rap?.volume).toBe(0.3);
  });

  it('takes the glasses off and stops the rap on a second press', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(logo());
    await user.click(cat());
    await user.click(cat());

    expect(cat()).toHaveAttribute('data-glasses', 'false');
    expect(FakeAudio.of('cat_rap')[0]?.pause).toHaveBeenCalled();
    expect(FakeAudio.of('cat_rap')).toHaveLength(1);
  });

  it('removes the glasses when the rap ends', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(logo());
    await user.click(cat());

    act(() => FakeAudio.of('cat_rap')[0]!.end());

    expect(cat()).toHaveAttribute('data-glasses', 'false');
  });

  it('hides a rapping cat, stops the rap and plays nothing new', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(logo());
    await user.click(cat());
    const sounds = FakeAudio.instances.length;

    await user.click(logo());

    expect(cat()).toHaveAttribute('data-visible', 'false');
    expect(cat()).toHaveAttribute('data-glasses', 'false');
    expect(FakeAudio.of('cat_rap')[0]?.pause).toHaveBeenCalled();
    expect(FakeAudio.instances).toHaveLength(sounds);
  });

  it('stops the meow when the logo is pressed again', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(logo());
    await user.click(logo());
    expect(FakeAudio.of('cat.mp3')[0]?.pause).toHaveBeenCalled();
    expect(FakeAudio.of('cat.mp3')).toHaveLength(1);
  });
});
