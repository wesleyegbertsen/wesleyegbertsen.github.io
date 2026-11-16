import { VOLUME_MAX, VOLUME_START, createSettingsStore } from './settingsStore.ts';

describe('the settings store', () => {
  it('starts with the sound on, unless told otherwise', () => {
    expect(createSettingsStore().muted()).toBe(false);
    expect(createSettingsStore(true).muted()).toBe(true);
  });

  it('tells its listeners about a change, and only about a change', () => {
    const store = createSettingsStore();
    const first = vi.fn();
    const second = vi.fn();
    const stop = store.subscribe(first);
    store.subscribe(second);
    store.setMuted(false);
    expect(first).not.toHaveBeenCalled();
    store.setMuted(true);
    expect(store.muted()).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    stop();
    store.setMuted(false);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('keeps nothing in the browser storage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    createSettingsStore().setMuted(true);
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('starts the volume wheel in the middle, keeps it within 0 and 10, and tells its listeners', () => {
    const store = createSettingsStore();
    expect(VOLUME_START).toBe(5);
    expect(VOLUME_MAX).toBe(10);
    expect(store.volume()).toBe(5);
    const heard = vi.fn();
    store.subscribe(heard);
    store.setVolume(6);
    expect(store.volume()).toBe(6);
    expect(heard).toHaveBeenCalledTimes(1);
    store.setVolume(6);
    expect(heard).toHaveBeenCalledTimes(1);
    store.setVolume(99);
    expect(store.volume()).toBe(10);
    store.setVolume(-3);
    expect(store.volume()).toBe(0);
    expect(createSettingsStore(false, 8).volume()).toBe(8);
  });

  it('keeps the wheel where it is while the sound is off, and keeps it out of the browser storage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const store = createSettingsStore();
    store.setVolume(8);
    store.setMuted(true);
    expect(store.volume()).toBe(8);
    store.setVolume(3);
    store.setMuted(false);
    expect(store.volume()).toBe(3);
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('has the LCD look on at the start, and tells its listeners when it is switched', () => {
    const store = createSettingsStore();
    expect(store.lcd()).toBe(true);
    const heard = vi.fn();
    store.subscribe(heard);
    store.setLcd(true);
    expect(heard).not.toHaveBeenCalled();
    store.setLcd(false);
    expect(store.lcd()).toBe(false);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('starts as a Game Boy, switches to a Game Boy Color, tells its listeners, and writes nothing to storage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const store = createSettingsStore();
    expect(store.colour()).toBe(false);
    const heard = vi.fn();
    store.subscribe(heard);
    store.setColour(false);
    expect(heard).not.toHaveBeenCalled();
    store.setColour(true);
    expect(store.colour()).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
