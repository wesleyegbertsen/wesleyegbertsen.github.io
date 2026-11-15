import { VOLUME_MAX, VOLUME_START, createSoundStore } from './soundStore.ts';

describe('the sound store', () => {
  it('starts with the sound on, unless told otherwise', () => {
    expect(createSoundStore().muted()).toBe(false);
    expect(createSoundStore(true).muted()).toBe(true);
  });

  it('tells its listeners about a change, and only about a change', () => {
    const store = createSoundStore();
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
    createSoundStore().setMuted(true);
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('starts the volume wheel in the middle, keeps it within 0 and 10, and tells its listeners', () => {
    const store = createSoundStore();
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
    expect(createSoundStore(false, 8).volume()).toBe(8);
  });

  it('keeps the wheel where it is while the sound is off, and keeps it out of the browser storage', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const store = createSoundStore();
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
    const store = createSoundStore();
    expect(store.lcd()).toBe(true);
    const heard = vi.fn();
    store.subscribe(heard);
    store.setLcd(true);
    expect(heard).not.toHaveBeenCalled();
    store.setLcd(false);
    expect(store.lcd()).toBe(false);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
