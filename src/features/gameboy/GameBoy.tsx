import { useState } from 'react';
import { audio, images } from '../../assets/index.ts';
import { useAudio } from '../../hooks/useAudio.ts';
import styles from './GameBoy.module.css';

const VIDEO_SRC = 'https://www.youtube.com/embed/8UWb9FWZb2k';

/**
 * A Game Boy in the corner: a click plays its start-up sound, a double-click
 * slides a hidden video in or out (with a Zelda item sound when it appears).
 */
export function GameBoy() {
  const [videoVisible, setVideoVisible] = useState(false);
  const startUp = useAudio(audio.gb, { volume: 0.3 });
  const zeldaItem = useAudio(audio.zeldaItem, { volume: 0.3 });

  const handleDoubleClick = () => {
    setVideoVisible(!videoVisible);
    if (!videoVisible) zeldaItem.play();
  };

  return (
    <>
      <button
        type="button"
        className={styles.gameboy}
        aria-label="Game Boy"
        onClick={startUp.play}
        onDoubleClick={handleDoubleClick}
      >
        <img src={images.gb} alt="" draggable={false} />
      </button>
      <iframe
        className={styles.video}
        data-visible={videoVisible}
        src={VIDEO_SRC}
        title="Titan cat video"
        // A hidden video can neither be focused nor read out.
        inert={!videoVisible}
      />
    </>
  );
}
