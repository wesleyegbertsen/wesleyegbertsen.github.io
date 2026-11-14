import { useState } from 'react';
import { audio } from '../../assets/index.ts';
import { useAudio } from '../../hooks/useAudio.ts';
import art from './pikachu.txt?raw';
import styles from './Pikachu.module.css';

/** Pikachu in braille art. Pressing it plays his cry and flashes yellow while it plays. */
export function Pikachu() {
  const [playing, setPlaying] = useState(false);
  const cry = useAudio(audio.pikachu, { onEnded: () => setPlaying(false) });

  const handleClick = () => {
    cry.play();
    setPlaying(true);
  };

  return (
    <button
      type="button"
      className={styles.pikachu}
      data-playing={playing}
      aria-label="Pikachu"
      onClick={handleClick}
    >
      <span className={styles.art} aria-hidden="true">
        {art}
      </span>
    </button>
  );
}
