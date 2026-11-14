import { useEffect } from 'react';
import { audio } from '../../assets/index.ts';
import { useAudio } from '../../hooks/useAudio.ts';
import { usePokeballs } from './usePokeballs.ts';
import styles from './Pokeballs.module.css';

const VICTORY_DELAY_MS = 2000;
const POSITIONS = [styles.ball1, styles.ball2, styles.ball3, styles.ball4];

/**
 * Hidden Poké Balls to find. Must be rendered inside a positioned container:
 * the balls and the counter are placed relative to it.
 */
export function Pokeballs() {
  const { found, remaining, anyFound, allFound, find } = usePokeballs();
  const catchSound = useAudio(audio.pokeball, { volume: 0.3, startAt: 0.5 });
  const victory = useAudio(audio.victory, { volume: 0.3 });
  const playVictory = victory.play;

  useEffect(() => {
    if (!allFound) return;
    const timer = setTimeout(playVictory, VICTORY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [allFound, playVictory]);

  const handleClick = (index: number) => {
    if (found[index]) return;
    find(index);
    catchSound.play();
  };

  return (
    <>
      {anyFound && (
        <div className={styles.counter} role="status">
          {allFound ? (
            'Found all Poké Balls!'
          ) : (
            <>
              <span>Poké Balls left: </span> <span>{remaining}</span>
            </>
          )}
        </div>
      )}
      {found.map((isFound, index) => (
        <button
          // The balls are a fixed list that never reorders, so the index is a stable key.
          key={index}
          type="button"
          className={`${styles.pokeball} ${POSITIONS[index] ?? ''}`}
          data-found={isFound}
          aria-label={`Poké Ball ${index + 1}`}
          aria-pressed={isFound}
          onClick={() => handleClick(index)}
        />
      ))}
    </>
  );
}
