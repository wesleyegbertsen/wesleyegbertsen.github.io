import { useRef } from 'react';
import { useTheme } from '../theme/ThemeContext.ts';
import { useMatrixRain } from './useMatrixRain.ts';
import styles from './MatrixBackdrop.module.css';

/** Falling-characters background. Pressing the exposed background moves to the next colour, and the theme with it. */
export function MatrixBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { index, cycle } = useTheme();

  useMatrixRain(canvasRef, index);

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
