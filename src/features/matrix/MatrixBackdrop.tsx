import { useRef } from 'react';
import { useLocalStorage } from '../../hooks/useLocalStorage.ts';
import { STORAGE_KEY, nextColorIndex, parseColorIndex } from './matrix.ts';
import { useMatrixRain } from './useMatrixRain.ts';
import styles from './MatrixBackdrop.module.css';

/** Falling-characters background. Pressing the exposed background cycles its colour. */
export function MatrixBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [colorIndex, setColorIndex] = useLocalStorage(STORAGE_KEY, 0, { parse: parseColorIndex });

  useMatrixRain(canvasRef, colorIndex);

  const cycle = () => setColorIndex(nextColorIndex(colorIndex));

  return (
    <>
      {/* Decorative canvas; keyboard users get the button below instead. */}
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" onClick={cycle} />
      <button type="button" className={styles.keyboardOnly} onClick={cycle}>
        Change background colour
      </button>
    </>
  );
}
