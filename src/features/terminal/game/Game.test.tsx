import { createRef } from 'react';
import { FakeAudio } from './audio/fakeAudio.ts';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initialGame } from './engine/engine.ts';
import { play, testWorld as world } from './engine/testWorld.ts';
import type { GameState } from './engine/types.ts';
import { Game } from './Game.tsx';
import { createSoundStore } from './soundStore.ts';

/** The game on the small test world, with reduced motion: one press is one move. */
function setup(state: GameState | null, touch = false, muted = false) {
  const store: { current: GameState | null } = { current: state };
  const onLeave = vi.fn();
  const onSkip = vi.fn();
  const sound = createSoundStore(muted);
  const view = render(
    <Game
      focusRef={createRef<HTMLDivElement>()}
      world={world}
      storeRef={store}
      soundStore={sound}
      reducedMotion
      touch={touch}
      contact={['Email: someone@example.com']}
      prompt="guest$"
      onLeave={onLeave}
      onSkip={onSkip}
    />,
  );
  const game = screen.getByRole('application');
  game.focus();
  return { store, sound, game, onLeave, onSkip, view, user: userEvent.setup() };
}

const started = () => play(initialGame(world, 7), 'a', 'a');

/** Puts a recording AudioContext where the browser's would be, and returns the ones the game makes. */
function stubAudio(): FakeAudio[] {
  const made: FakeAudio[] = [];
  class Stub extends FakeAudio {
    constructor() {
      super();
      made.push(this);
    }
  }
  vi.stubGlobal('AudioContext', Stub);
  return made;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Game', () => {
  it('shows where the game is through data attributes, for tests and nothing else', async () => {
    const { game, user } = setup(null);
    expect(game).toHaveAttribute('data-scene', 'title');
    await user.keyboard('z');
    expect(game).toHaveAttribute('data-scene', 'world');
    expect(game).toHaveAttribute('data-dialogue', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Welcome.');
    await user.keyboard('{Enter}');
    expect(game).toHaveAttribute('data-dialogue', 'false');
    expect(game).toHaveAttribute('data-map', 'main');
  });

  it('maps the keyboard: WASD and arrows walk, X goes back, P opens the bag, H gives a hint', async () => {
    const { game, user } = setup(started());
    await user.keyboard('s');
    expect(game).toHaveAttribute('data-y', '3');
    await user.keyboard('{ArrowUp}');
    expect(game).toHaveAttribute('data-y', '2');
    await user.keyboard('d');
    expect(game).toHaveAttribute('data-x', '3');
    await user.keyboard('a');
    expect(game).toHaveAttribute('data-x', '2');
    await user.keyboard('p');
    expect(game).toHaveAttribute('data-menu', 'items');
    await user.keyboard('{ArrowRight}');
    expect(game).toHaveAttribute('data-menu', 'badges');
    await user.keyboard('x');
    expect(game).toHaveAttribute('data-menu', '');
    await user.keyboard('h');
    expect(screen.getByRole('status')).toHaveTextContent('Beat the rat.');
    await user.keyboard('{Backspace}');
    expect(game).toHaveAttribute('data-dialogue', 'false');
  });

  it('announces a battle step by step and ends it', async () => {
    const { game, user } = setup(started());
    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(game).toHaveAttribute('data-battle', 'rat');
    expect(screen.getByRole('status')).toHaveTextContent('A wild RAT appeared!');
    await user.keyboard('zzz');
    expect(screen.getByRole('status')).toHaveTextContent(/You use HIT! RAT loses \d HP\./);
    for (let i = 0; i < 20 && game.dataset.battle; i++) await user.keyboard('z');
    expect(game).toHaveAttribute('data-battle', '');
    expect(Number(game.dataset.hp)).toBeGreaterThan(0);
  });

  it('shows the contact lines when the game is finished, in place of the keys', async () => {
    const { game, user } = setup(play(started(), 'right', 'right', 'right'));
    expect(screen.getByText('Walk')).toBeInTheDocument();
    expect(screen.queryByText('Email: someone@example.com')).toBeNull();
    await user.keyboard('zz');
    expect(game).toHaveAttribute('data-finished', 'true');
    expect(screen.getByText('Email: someone@example.com')).toBeInTheDocument();
    expect(screen.queryByText('Walk')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('THE END');
  });

  it('changes the live region when the same line is said twice, so it is announced again', async () => {
    const { user } = setup(started());
    const status = screen.getByRole('status');
    await user.keyboard('h');
    const first = status.textContent;
    expect(first).toBe('Beat the rat.');
    await user.keyboard('zh');
    expect(status).toHaveTextContent('Beat the rat.');
    expect(status.textContent).not.toBe(first);
  });

  it('leaves the keys of its own buttons alone', async () => {
    const { game, onSkip, onLeave, user } = setup(started());
    screen.getByRole('button', { name: 'Skip to text' }).focus();
    await user.keyboard('{Enter}');
    expect(onSkip).toHaveBeenCalledTimes(1);
    await user.keyboard('q');
    expect(onLeave).not.toHaveBeenCalled();
    expect(game).toHaveAttribute('data-dialogue', 'false');
    await user.keyboard('{Escape}');
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('ignores keys pressed with Ctrl, so browser shortcuts keep working', () => {
    const { game } = setup(started());
    const event = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
    fireEvent(game, event);
    expect(event.defaultPrevented).toBe(false);
    expect(game).toHaveAttribute('data-x', '2');
  });

  it('has a D-pad, A, B, Start and Select on touch devices, and they drive the game', () => {
    const { game } = setup(started(), true);
    expect(screen.queryByText('Walk')).toBeNull();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Down' }));
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Down' }));
    expect(game).toHaveAttribute('data-y', '3');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Up' }));
    expect(game).toHaveAttribute('data-y', '2');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Right' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Left' }));
    expect(game).toHaveAttribute('data-x', '2');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Start' }));
    expect(game).toHaveAttribute('data-menu', 'items');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'B' }));
    expect(game).toHaveAttribute('data-menu', '');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Select' }));
    expect(game).toHaveAttribute('data-dialogue', 'true');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'A' }));
    expect(game).toHaveAttribute('data-dialogue', 'false');
  });

  it('names the M key in its label and lists it with the state of the sound', async () => {
    const { game, user } = setup(started());
    expect(game.getAttribute('aria-label')).toMatch(/M to switch the sound off or on/);
    expect(screen.getByText('Sound: on')).toBeInTheDocument();
    expect(game).toHaveAttribute('data-sound', 'on');
    await user.keyboard('m');
    expect(screen.getByText('Sound: off')).toBeInTheDocument();
    expect(screen.queryByText('Sound: on')).toBeNull();
  });

  it('switches the sound off and on with M, says so politely, and remembers it in the session store', async () => {
    const { game, sound, user } = setup(started());
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    await user.keyboard('m');
    expect(sound.muted()).toBe(true);
    expect(game).toHaveAttribute('data-sound', 'off');
    expect(status).toHaveTextContent('Sound off');
    await user.keyboard('M');
    expect(sound.muted()).toBe(false);
    expect(game).toHaveAttribute('data-sound', 'on');
    expect(status).toHaveTextContent('Sound on');
    // The game itself did not move.
    expect(game).toHaveAttribute('data-x', '2');
    expect(game).toHaveAttribute('data-dialogue', 'false');
  });

  it('leaves M alone when it is pressed with Ctrl, held down, or on one of its buttons', async () => {
    const { game, sound, user } = setup(started());
    fireEvent.keyDown(game, { key: 'm', ctrlKey: true });
    fireEvent.keyDown(game, { key: 'm', repeat: true });
    expect(sound.muted()).toBe(false);
    screen.getByRole('button', { name: 'Leave' }).focus();
    await user.keyboard('m');
    expect(sound.muted()).toBe(false);
  });

  it('opens with the sound off when the session says so', () => {
    const { game } = setup(started(), false, true);
    expect(game).toHaveAttribute('data-sound', 'off');
    expect(screen.getByText('Sound: off')).toBeInTheDocument();
  });

  it('has a Sound button on touch devices only, pressed while the sound is on', async () => {
    const desktop = setup(started());
    expect(screen.queryByRole('button', { name: 'Sound' })).toBeNull();
    desktop.view.unmount();

    const { game, sound, user } = setup(started(), true);
    const button = screen.getByRole('button', { name: 'Sound' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.pointerDown(button);
    expect(sound.muted()).toBe(true);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(game).toHaveAttribute('data-sound', 'off');
    expect(screen.getByRole('status')).toHaveTextContent('Sound off');
    // With a keyboard: a click without a pointer.
    button.focus();
    await user.keyboard('{Enter}');
    expect(sound.muted()).toBe(false);
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('names the tune of the moment and the last sound, for the browser tests', async () => {
    const { game, user } = setup(null);
    expect(game).toHaveAttribute('data-music', '');
    await user.keyboard('z');
    expect(game).toHaveAttribute('data-cue', 'confirm');
    expect(game).toHaveAttribute('data-cues', '1');
    await user.keyboard('zaa');
    expect(game).toHaveAttribute('data-cue', 'bump');
  });

  it('plays through an AudioContext: music on opening, an effect for a press, silence on M, closed on leaving', async () => {
    const made = stubAudio();
    const { user, view } = setup(started());
    expect(made).toHaveLength(1);
    const audio = made[0]!;
    expect(audio.master.gain.value).toBe(0.25);
    const before = audio.sources.length;
    await user.keyboard('p');
    expect(audio.sources.length).toBeGreaterThan(before);

    await user.keyboard('m');
    expect(audio.master.gain.value).toBe(0);
    const silent = audio.sources.length;
    await user.keyboard('xp');
    expect(audio.sources.length).toBe(silent);
    await user.keyboard('m');
    expect(audio.master.gain.value).toBe(0.25);

    view.unmount();
    expect(audio.calls.close).toBe(1);
    expect(made).toHaveLength(1);
  });

  it('asks the browser for sound again on a key and on a touch', async () => {
    const made = stubAudio();
    const { game, user } = setup(started());
    const audio = made[0]!;
    audio.state = 'suspended';
    await user.keyboard('s');
    expect(audio.calls.resume).toBe(1);
    audio.state = 'suspended';
    fireEvent.pointerDown(game);
    expect(audio.calls.resume).toBe(2);
  });

  it('lets a keyboard press the on-screen buttons too', async () => {
    const { game, user } = setup(started(), true);
    screen.getByRole('button', { name: 'Down' }).focus();
    await user.keyboard('{Enter}');
    expect(game).toHaveAttribute('data-y', '3');
    screen.getByRole('button', { name: 'Start' }).focus();
    await user.keyboard(' ');
    expect(game).toHaveAttribute('data-menu', 'items');
  });
});
