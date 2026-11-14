export type CatState = {
  visible: boolean;
  glasses: boolean;
};

export type CatAction = { type: 'toggleVisible' } | { type: 'toggleGlasses' } | { type: 'rapEnded' };

export const initialCatState: CatState = { visible: false, glasses: false };

export function catReducer(state: CatState, action: CatAction): CatState {
  switch (action.type) {
    // Hiding the cat also takes its glasses off.
    case 'toggleVisible':
      return { visible: !state.visible, glasses: state.visible ? false : state.glasses };
    case 'toggleGlasses':
      return { ...state, glasses: !state.glasses };
    // The rap finished: glasses come off.
    case 'rapEnded':
      return { ...state, glasses: false };
  }
}
