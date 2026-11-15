import { createRef } from 'react';
import { FakeAudio } from './audio/fakeAudio.ts';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initialGame } from './engine/engine.ts';
import { play, playIn, shopWorld, testWorld as world } from './engine/testWorld.ts';
import type { GameState, World } from './engine/types.ts';
import { parseMap } from './engine/world.ts';
import { Game } from './Game.tsx';
import { createSettingsStore } from './settingsStore.ts';

/** The game on the small test world, with reduced motion: one press is one move. */
function setup(state: GameState | null, touch = false, muted = false, on: World = world) {
  const store: { current: GameState | null } = { current: state };
  const onLeave = vi.fn();
  const onSkip = vi.fn();
  const sound = createSettingsStore(muted);
  const view = render(
    <Game
      focusRef={createRef<HTMLDivElement>()}
      world={on}
      storeRef={store}
      settingsStore={sound}
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
    expect(screen.getByText('Sound: on, 50%')).toBeInTheDocument();
    expect(game).toHaveAttribute('data-sound', 'on');
    await user.keyboard('m');
    expect(screen.getByText('Sound: off, 50%')).toBeInTheDocument();
    expect(screen.queryByText('Sound: on, 50%')).toBeNull();
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
    expect(screen.getByText('Sound: off, 50%')).toBeInTheDocument();
  });

  it('has a Sound button on touch devices only, pressed while the sound is on', async () => {
    const desktop = setup(started());
    expect(screen.queryByRole('button', { name: 'Sound' })).toBeNull();
    desktop.view.unmount();

    const { game, sound, user } = setup(started(), true);
    const button = screen.getByRole('button', { name: 'Sound' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    // A press that is then dragged away or cancelled (a scroll) is not a tap: nothing changes until the click.
    fireEvent.pointerDown(button);
    expect(sound.muted()).toBe(false);
    fireEvent.pointerCancel(button);
    expect(sound.muted()).toBe(false);
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    fireEvent.click(button, { detail: 1 });
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
    expect(audio.master.gain.value).toBe(0.125);
    const before = audio.sources.length;
    await user.keyboard('p');
    expect(audio.sources.length).toBeGreaterThan(before);

    await user.keyboard('m');
    expect(audio.master.gain.value).toBe(0);
    const silent = audio.sources.length;
    await user.keyboard('xp');
    expect(audio.sources.length).toBe(silent);
    await user.keyboard('m');
    expect(audio.master.gain.value).toBe(0.125);

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

  it('shows the level, the XP and the offer of a new move through data attributes', async () => {
    const { game, user } = setup({ ...started(), level: 3, xp: 27, learn: { move: 'nap', cursor: 0 } });
    expect(game).toHaveAttribute('data-level', '3');
    expect(game).toHaveAttribute('data-xp', '27');
    expect(game).toHaveAttribute('data-learn', 'nap');
    await user.keyboard('x');
    expect(game).toHaveAttribute('data-learn', '');
    expect(screen.getByRole('status')).toHaveTextContent('You keep your moves.');
  });

  it('shows where the boulders are through a data attribute, and tells the status region every push', async () => {
    const hall = parseMap(
      {
        id: 'hall',
        name: 'Hall',
        ground: '.',
        rows: ['######', '#@1.o#', '######'],
        plates: { flag: 'open', do: [{ say: ['A gate opens.'] }] },
        objects: { '@': { solid: false, trigger: 'interact', branches: [] }, '1': { sprite: 'boulder', solid: true, trigger: 'interact', branches: [], push: 'boulder' } },
      },
      { '#': { sprite: 'cavewall', solid: true }, '.': { sprite: 'cavefloor', solid: false }, o: { sprite: 'plate', solid: false, plate: true } },
    );
    const puzzle: World = { ...world, maps: { hall }, start: { map: 'hall', at: '@', dir: 'down' } };
    const { game, user, view } = setup(playIn(puzzle, initialGame(puzzle, 7), 'a', 'a'), false, false, puzzle);
    expect(game).toHaveAttribute('data-pushed', '2,1');
    await user.keyboard('{ArrowRight}');
    expect(game).toHaveAttribute('data-pushed', '3,1');
    expect(game).toHaveAttribute('data-x', '2');
    expect(screen.getByRole('status')).toHaveTextContent('You push the boulder right.');
    await user.keyboard('{ArrowRight}');
    expect(game).toHaveAttribute('data-pushed', '4,1');
    expect(screen.getByRole('status')).toHaveTextContent('You push the boulder right. It settles on a pressure plate: 1 of 1 down. A gate opens.');
    await user.keyboard('z');
    await user.keyboard('{ArrowRight}');
    expect(game).toHaveAttribute('data-pushed', '4,1');
    // A map with nothing to push says nothing.
    view.unmount();
    expect(setup(started()).game).toHaveAttribute('data-pushed', '');
  });

  it('shows the coins and the open shop through data attributes, and tells the status region what was bought', async () => {
    const before = playIn(shopWorld, initialGame(shopWorld, 7), 'a', 'a', 'down', 'left', 'a');
    const { game, user } = setup(before, false, false, shopWorld);
    expect(game).toHaveAttribute('data-coins', '45');
    expect(game).toHaveAttribute('data-shop', '');
    expect(game).toHaveAttribute('data-shop-row', '');
    expect(game).toHaveAttribute('data-shop-amount', '');
    await user.keyboard('z');
    expect(game).toHaveAttribute('data-shop', 'kiosk');
    expect(game).toHaveAttribute('data-shop-row', 'coffee');
    expect(game).toHaveAttribute('data-shop-amount', '1');
    expect(screen.getByRole('status')).toHaveTextContent('KIOSK. You have 45 COINS. A buys, left and right change how many, B leaves. COFFEE, 10 COINS: Restores 20 energy. In your bag: 0.');
    // Right picks one more, left one fewer: the count is on the element and the total in the status region.
    await user.keyboard('{ArrowRight}');
    expect(game).toHaveAttribute('data-shop-amount', '2');
    expect(screen.getByRole('status')).toHaveTextContent('2 COFFEE for 20 COINS.');
    await user.keyboard('{ArrowLeft}');
    expect(game).toHaveAttribute('data-shop-amount', '1');
    expect(screen.getByRole('status')).toHaveTextContent('1 COFFEE for 10 COINS.');
    await user.keyboard('z');
    expect(game).toHaveAttribute('data-coins', '35');
    expect(screen.getByRole('status')).toHaveTextContent('You buy one COFFEE for 10 COINS. 35 COINS left.');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(game).toHaveAttribute('data-shop-row', 'key');
    await user.keyboard('z');
    expect(game).toHaveAttribute('data-coins', '35');
    expect(screen.getByRole('status')).toHaveTextContent('Not enough COINS: the KEY is 100, you have 35.');
    await user.keyboard('{ArrowDown}');
    expect(game).toHaveAttribute('data-shop-row', 'leave');
    await user.keyboard('x');
    expect(game).toHaveAttribute('data-shop', '');
    expect(game).toHaveAttribute('data-dialogue', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Bye now.');
  });

  it('shows the level of the enemy in a battle', async () => {
    const { game, user } = setup(started());
    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(game).toHaveAttribute('data-battle', 'rat');
    expect(game).toHaveAttribute('data-foe-level', '2');
  });

  it('has a Settings tab in the Start menu: the volume row turns the wheel and says so politely', async () => {
    const { game, sound, user } = setup(started());
    const status = screen.getByRole('status');
    expect(game).toHaveAttribute('data-volume', '50');
    expect(game.getAttribute('aria-label')).toMatch(/Settings tab/);
    await user.keyboard('p{ArrowLeft}');
    expect(game).toHaveAttribute('data-menu', 'settings');
    expect(game).toHaveAttribute('data-row', 'sound');
    expect(status).toHaveTextContent('Settings. Sound, volume and screen.');
    await user.keyboard('{ArrowDown}');
    expect(game).toHaveAttribute('data-row', 'volume');
    expect(status).toHaveTextContent('Volume. Left and right change it.');
    await user.keyboard('{ArrowRight}');
    expect(sound.volume()).toBe(6);
    expect(game).toHaveAttribute('data-volume', '60');
    expect(status).toHaveTextContent('Volume 60%');
    expect(screen.getByText('Sound: on, 60%')).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}{ArrowLeft}z');
    expect(sound.volume()).toBe(4);
    expect(status).toHaveTextContent('Volume 40%');
    expect(game).toHaveAttribute('data-menu', 'settings');
  });

  it('stops the wheel at 0% and at 100%', async () => {
    const { game, sound, user } = setup(started());
    await user.keyboard('p{ArrowLeft}{ArrowDown}');
    for (let i = 0; i < 7; i++) await user.keyboard('{ArrowRight}');
    expect(sound.volume()).toBe(10);
    expect(game).toHaveAttribute('data-volume', '100');
    expect(screen.getByRole('status')).toHaveTextContent('Volume 100%');
    for (let i = 0; i < 12; i++) await user.keyboard('{ArrowLeft}');
    expect(sound.volume()).toBe(0);
    expect(screen.getByRole('status')).toHaveTextContent('Volume 0%');
  });

  it('switches the sound from the settings with A, the same switch as the M key, apart from the wheel', async () => {
    const { game, sound, user } = setup(started());
    await user.keyboard('p{ArrowLeft}z');
    expect(sound.muted()).toBe(true);
    expect(game).toHaveAttribute('data-sound', 'off');
    expect(screen.getByRole('status')).toHaveTextContent('Sound off');
    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(sound.volume()).toBe(6);
    expect(sound.muted()).toBe(true);
    await user.keyboard('m');
    expect(sound.muted()).toBe(false);
    await user.keyboard('{ArrowUp}z');
    expect(sound.muted()).toBe(true);
    expect(sound.volume()).toBe(6);
  });

  it('turns the wheel with the D-pad on touch devices', () => {
    const { game, sound } = setup(started(), true);
    const tap = (name: string) => {
      fireEvent.pointerDown(screen.getByRole('button', { name }));
      fireEvent.pointerUp(screen.getByRole('button', { name }));
    };
    tap('Start');
    tap('Left');
    tap('Down');
    expect(game).toHaveAttribute('data-row', 'volume');
    tap('Right');
    tap('Right');
    expect(sound.volume()).toBe(7);
    expect(game).toHaveAttribute('data-volume', '70');
    tap('Left');
    expect(sound.volume()).toBe(6);
    expect(screen.getByRole('status')).toHaveTextContent('Volume 60%');
  });

  it('makes the wheel audible: the master gain follows it, up to a modest 0.25', async () => {
    const made = stubAudio();
    const { user } = setup(started());
    expect(made[0]!.master.gain.value).toBe(0.125);
    await user.keyboard('p{ArrowLeft}{ArrowDown}');
    for (let i = 0; i < 5; i++) await user.keyboard('{ArrowRight}');
    expect(made[0]!.master.gain.value).toBe(0.25);
    await user.keyboard('{ArrowLeft}');
    expect(made[0]!.master.gain.value).toBeCloseTo(0.225, 6);
  });

  it('lays an LCD look over the screen, not into it, and switches it from the settings', async () => {
    const { game, sound, user } = setup(started());
    const lcd = screen.getByTestId('lcd');
    expect(game).toHaveAttribute('data-lcd', 'on');
    expect(lcd).toHaveAttribute('aria-hidden', 'true');
    expect(lcd.tagName).toBe('DIV');
    // It lies beside the canvas in the same box, after it: over the picture, not part of it.
    expect(lcd.previousElementSibling?.tagName).toBe('CANVAS');
    await user.keyboard('p{ArrowLeft}{ArrowDown}{ArrowDown}');
    expect(game).toHaveAttribute('data-row', 'screen');
    await user.keyboard('z');
    expect(sound.lcd()).toBe(false);
    expect(game).toHaveAttribute('data-lcd', 'off');
    expect(screen.queryByTestId('lcd')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('LCD look off');
    await user.keyboard('z');
    expect(screen.getByTestId('lcd')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('LCD look on');
  });
});
