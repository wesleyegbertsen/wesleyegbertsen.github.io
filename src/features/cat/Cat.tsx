import styles from './Cat.module.css';

type CatProps = {
  visible: boolean;
  glasses: boolean;
  onClick: () => void;
};

/** A cat that slides up from the bottom. Pressing it toggles its glasses (and a rap). */
export function Cat({ visible, glasses, onClick }: CatProps) {
  return (
    <button
      type="button"
      className={styles.cat}
      data-visible={visible}
      data-glasses={glasses}
      aria-label="Cat"
      aria-pressed={glasses}
      // A hidden cat can neither be focused nor read out.
      inert={!visible}
      onClick={onClick}
    />
  );
}
