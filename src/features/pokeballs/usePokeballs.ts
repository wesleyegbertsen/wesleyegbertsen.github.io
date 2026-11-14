import { useReducer } from 'react';

export const POKEBALL_COUNT = 4;

export type PokeballsState = {
  found: boolean[];
};

type Action = { type: 'find'; index: number };

export function createPokeballsState(count = POKEBALL_COUNT): PokeballsState {
  return { found: new Array<boolean>(count).fill(false) };
}

export function pokeballsReducer(state: PokeballsState, action: Action): PokeballsState {
  // A ball that was already found does nothing.
  if (state.found[action.index] !== false) return state;
  return { found: state.found.map((isFound, i) => (i === action.index ? true : isFound)) };
}

export function usePokeballs() {
  const [state, dispatch] = useReducer(pokeballsReducer, undefined, createPokeballsState);
  const foundCount = state.found.filter(Boolean).length;

  return {
    found: state.found,
    remaining: state.found.length - foundCount,
    anyFound: foundCount > 0,
    allFound: foundCount === state.found.length,
    find: (index: number) => dispatch({ type: 'find', index }),
  };
}
