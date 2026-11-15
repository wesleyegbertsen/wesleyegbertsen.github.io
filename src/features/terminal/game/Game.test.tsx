import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initialGame } from './engine/engine.ts';
import { play, testWorld as world } from './engine/testWorld.ts';
import type { GameState } from './engine/types.ts';
import { Game } from './Game.tsx';

/** The game on the small test world, with reduced motion: one press is one move. */
function setup(state: GameState | null, touch = false) {
  const store: { current: GameState | null } = { current: state };
  const onLeave = vi.fn();
  const onSkip = vi.fn();
  render(
    <Game
      focusRef={createRef<HTMLDivElement>()}
      world={world}
      storeRef={store}
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
  return { store, game, onLeave, onSkip, user: userEvent.setup() };
}

const started = () => play(initialGame(world, 7), 'a', 'a');

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
