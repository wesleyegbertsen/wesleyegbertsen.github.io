import { catReducer, initialCatState } from './catState.ts';

describe('catReducer', () => {
  it('starts hidden without glasses', () => {
    expect(initialCatState).toEqual({ visible: false, glasses: false });
  });

  it('shows the cat', () => {
    expect(catReducer(initialCatState, { type: 'toggleVisible' })).toEqual({ visible: true, glasses: false });
  });

  it('puts glasses on and off', () => {
    const shown = { visible: true, glasses: false };
    const on = catReducer(shown, { type: 'toggleGlasses' });
    expect(on.glasses).toBe(true);
    expect(catReducer(on, { type: 'toggleGlasses' }).glasses).toBe(false);
  });

  it('takes the glasses off when the cat is hidden', () => {
    expect(catReducer({ visible: true, glasses: true }, { type: 'toggleVisible' })).toEqual({
      visible: false,
      glasses: false,
    });
  });

  it('takes the glasses off when the rap ends', () => {
    expect(catReducer({ visible: true, glasses: true }, { type: 'rapEnded' })).toEqual({
      visible: true,
      glasses: false,
    });
  });
});
