import { images } from '../../assets/index.ts';
import styles from './Logo.module.css';

type LogoProps = {
  catVisible: boolean;
  onClick: () => void;
};

/** The site logo. Pressing it summons (or dismisses) the cat. */
export function Logo({ catVisible, onClick }: LogoProps) {
  return (
    <button type="button" className={styles.logo} aria-pressed={catVisible} onClick={onClick}>
      <img src={images.logo} alt="Wesley Egbertsen logo" draggable={false} />
    </button>
  );
}
