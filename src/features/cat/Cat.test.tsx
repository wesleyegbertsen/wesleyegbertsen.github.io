import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FakeAudio, installFakeAudio } from '../../test/fakeAudio.ts';
import { Cat } from './Cat.tsx';
import { CatToggle } from './CatToggle.tsx';
import { useCat } from './useCat.ts';

function Harness() {
  const cat = useCat();
  return (
    <>
      <CatToggle catVisible={cat.visible} onClick={cat.toggleVisible}>
        Wesley Egbertsen
      </CatToggle>
      <Cat visible={cat.visible} glasses={cat.glasses} onClick={cat.toggleGlasses} />
    </>
  );
}

beforeEach(installFakeAudio);
afterEach(() => vi.unstubAllGlobals());

const toggle = () => screen.getByRole('button', { name: 'Wesley Egbertsen' });
const cat = () => screen.getByRole('button', { name: 'Cat', hidden: true });

describe('name toggle and cat', () => {
  it('starts with the cat hidden and out of reach', () => {
    render(<Harness />);
    expect(cat()).toHaveAttribute('data-visible', 'false');
    expect(cat()).toHaveAttribute('inert');
  });

  it('shows the cat and meows at default volume when the name is pressed', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(toggle());

    expect(cat()).toHaveAttribute('data-visible', 'true');
    const [meow] = FakeAudio.of('cat.mp3');
    expect(meow?.play).toHaveBeenCalledOnce();
    expect(meow?.volume).toBe(1);
  });

  it('puts glasses on and raps at volume 0.3 when the cat is pressed', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(toggle());

    await user.click(cat());

    expect(cat()).toHaveAttribute('data-glasses', 'true');
    const [rap] = FakeAudio.of('cat_rap');
    expect(rap?.play).toHaveBeenCalledOnce();
    expect(rap?.volume).toBe(0.3);
  });

  it('takes the glasses off and stops the rap on a second press', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(toggle());
    await user.click(cat());
    await user.click(cat());

    expect(cat()).toHaveAttribute('data-glasses', 'false');
    expect(FakeAudio.of('cat_rap')[0]?.pause).toHaveBeenCalled();
    expect(FakeAudio.of('cat_rap')).toHaveLength(1);
  });

  it('removes the glasses when the rap ends', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(toggle());
    await user.click(cat());

    act(() => FakeAudio.of('cat_rap')[0]!.end());

    expect(cat()).toHaveAttribute('data-glasses', 'false');
  });

  it('hides a rapping cat, stops the rap and plays nothing new', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(toggle());
    await user.click(cat());
    const sounds = FakeAudio.instances.length;

    await user.click(toggle());

    expect(cat()).toHaveAttribute('data-visible', 'false');
    expect(cat()).toHaveAttribute('data-glasses', 'false');
    expect(FakeAudio.of('cat_rap')[0]?.pause).toHaveBeenCalled();
    expect(FakeAudio.instances).toHaveLength(sounds);
  });

  it('stops the meow when the name is pressed again', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(toggle());
    await user.click(toggle());
    expect(FakeAudio.of('cat.mp3')[0]?.pause).toHaveBeenCalled();
    expect(FakeAudio.of('cat.mp3')).toHaveLength(1);
  });

  it("reports the cat's state with aria-pressed", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle());
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
  });

  it('works from the keyboard', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    toggle().focus();
    await user.keyboard('{Enter}');
    expect(cat()).toHaveAttribute('data-visible', 'true');
    await user.keyboard(' ');
    expect(cat()).toHaveAttribute('data-visible', 'false');
  });
});
