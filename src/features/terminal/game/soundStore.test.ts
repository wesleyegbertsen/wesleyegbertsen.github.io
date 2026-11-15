import { createSoundStore } from './soundStore.ts';

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
});
