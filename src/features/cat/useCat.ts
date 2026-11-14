import { useReducer } from 'react';
import { audio } from '../../assets/index.ts';
import { useAudio } from '../../hooks/useAudio.ts';
import { catReducer, initialCatState } from './catState.ts';

/**
 * The logo summons a cat; the cat can put on glasses and rap.
 * Sounds: `cat.mp3` when the cat appears, `cat_rap.mp3` while it wears glasses.
 */
export function useCat() {
  const [state, dispatch] = useReducer(catReducer, initialCatState);
  const meow = useAudio(audio.cat);
  const rap = useAudio(audio.catRap, { volume: 0.3, onEnded: () => dispatch({ type: 'rapEnded' }) });

  const toggleVisible = () => {
    meow.stop();
    dispatch({ type: 'toggleVisible' });
    if (state.visible) {
      // Hiding: no meow, and a rapping cat stops rapping.
      if (state.glasses) rap.stop();
      return;
    }
    meow.play();
  };

  const toggleGlasses = () => {
    dispatch({ type: 'toggleGlasses' });
    rap.stop();
    if (!state.glasses) rap.play();
  };

  return { ...state, toggleVisible, toggleGlasses };
}
