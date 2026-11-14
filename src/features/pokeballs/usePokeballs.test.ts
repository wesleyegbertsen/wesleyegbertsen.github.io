import { createPokeballsState, pokeballsReducer } from './usePokeballs.ts';

describe('pokeballsReducer', () => {
  it('starts with four unfound balls', () => {
    expect(createPokeballsState().found).toEqual([false, false, false, false]);
  });

  it('marks a ball as found', () => {
    const next = pokeballsReducer(createPokeballsState(), { type: 'find', index: 2 });
    expect(next.found).toEqual([false, false, true, false]);
  });

  it('ignores a ball that was already found', () => {
    const once = pokeballsReducer(createPokeballsState(), { type: 'find', index: 1 });
    expect(pokeballsReducer(once, { type: 'find', index: 1 })).toBe(once);
  });

  it('ignores an unknown ball', () => {
    const state = createPokeballsState();
    expect(pokeballsReducer(state, { type: 'find', index: 9 })).toBe(state);
  });
});
