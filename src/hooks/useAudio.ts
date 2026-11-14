import { useCallback, useEffect, useRef } from 'react';

type Options = {
  volume?: number;
  /** Start offset in seconds. */
  startAt?: number;
  onEnded?: () => void;
};

/**
 * Plays one clip at a time. Each `play()` stops and rewinds the previous
 * instance and starts a fresh `Audio`, the way the original site did.
 */
export function useAudio(src: string, { volume = 1, startAt = 0, onEnded }: Options = {}) {
  const current = useRef<HTMLAudioElement | null>(null);
  const onEndedRef = useRef(onEnded);

  useEffect(() => {
    onEndedRef.current = onEnded;
  });

  const stop = useCallback(() => {
    const audio = current.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  const play = useCallback(() => {
    stop();
    const audio = new Audio(src);
    audio.volume = volume;
    audio.currentTime = startAt;
    audio.onended = () => onEndedRef.current?.();
    current.current = audio;
    // Autoplay can be refused by the browser; that is not an error for the page.
    audio.play().catch(() => {});
  }, [src, volume, startAt, stop]);

  useEffect(
    () => () => {
      current.current?.pause();
    },
    [],
  );

  return { play, stop };
}
