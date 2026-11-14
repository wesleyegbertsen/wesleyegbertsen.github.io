import type { ReactNode } from 'react';
import styles from './CatToggle.module.css';

type CatToggleProps = {
  catVisible: boolean;
  onClick: () => void;
  children: ReactNode;
};

/** A button that looks like its surroundings. Pressing it summons (or dismisses) the cat. */
export function CatToggle({ catVisible, onClick, children }: CatToggleProps) {
  return (
    <button type="button" className={styles.toggle} aria-pressed={catVisible} onClick={onClick}>
      {children}
    </button>
  );
}
