import { useEffect, type RefObject } from 'react';
import { COLUMN_WIDTH, MATRIX_COLORS, createColumns, stepColumns } from './matrix.ts';

const FRAME_MS = 50;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * Draws the falling characters onto the canvas. Draws at most once per 50ms,
 * stops while the tab is hidden, and draws nothing but a black frame when the
 * visitor prefers reduced motion. Restarts from a black canvas when the colour changes.
 */
export function useMatrixRain(canvasRef: RefObject<HTMLCanvasElement | null>, colorIndex: number) {
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const reducedMotion = window.matchMedia(REDUCED_MOTION);
    let columns: number[] = [];
    let frameId = 0;
    let lastDraw = -Infinity;
    let running = false;

    const paintBlack = () => {
      context.fillStyle = '#000';
      context.fillRect(0, 0, canvas.width, canvas.height);
    };

    const resize = () => {
      // Resizing clears the canvas, so start over at the new width.
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      columns = createColumns(window.innerWidth);
      paintBlack();
    };

    const draw = () => {
      context.fillStyle = '#0001';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = MATRIX_COLORS[colorIndex] ?? MATRIX_COLORS[0];
      context.font = '15pt monospace';
      columns.forEach((y, index) => {
        context.fillText(String.fromCharCode(Math.random() * 128), index * COLUMN_WIDTH, y);
      });
      columns = stepColumns(columns, Math.random);
    };

    const frame = (time: number) => {
      frameId = requestAnimationFrame(frame);
      if (time - lastDraw < FRAME_MS) return;
      lastDraw = time;
      draw();
    };

    const start = () => {
      if (running || document.hidden || reducedMotion.matches) return;
      running = true;
      frameId = requestAnimationFrame(frame);
    };

    const stop = () => {
      cancelAnimationFrame(frameId);
      running = false;
    };

    const onVisibilityChange = () => (document.hidden ? stop() : start());
    const onMotionChange = () => {
      if (reducedMotion.matches) {
        stop();
        paintBlack();
      } else {
        start();
      }
    };

    resize();
    start();

    // Phones fire resize when the URL bar shows or hides; only restart if the size really changed.
    const onResize = () => {
      if (canvas.width === window.innerWidth && canvas.height === window.innerHeight) return;
      resize();
    };

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibilityChange);
    reducedMotion.addEventListener('change', onMotionChange);

    return () => {
      stop();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      reducedMotion.removeEventListener('change', onMotionChange);
    };
  }, [canvasRef, colorIndex]);
}
