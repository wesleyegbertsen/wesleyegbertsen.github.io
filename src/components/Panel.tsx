import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import styles from './Panel.module.css';

type PanelProps = {
  id: string;
  title: string;
  onClose: () => void;
  /** The button that opened the panel; focus returns here on Escape. */
  returnFocusRef: RefObject<HTMLElement | null>;
  children: ReactNode;
};

/** A dialog that closes on Escape and on a pointer press outside it. */
export function Panel({ id, title, onClose, returnFocusRef, children }: PanelProps) {
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    panelRef.current?.focus();

    const trigger = returnFocusRef.current;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onCloseRef.current();
      trigger?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      // The trigger toggles the panel itself.
      if (panelRef.current?.contains(target) || trigger?.contains(target)) return;
      onCloseRef.current();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [returnFocusRef]);

  return (
    <div
      id={id}
      ref={panelRef}
      className={styles.panel}
      role="dialog"
      aria-labelledby={headingId}
      tabIndex={-1}
    >
      <h2 id={headingId} className={styles.title}>
        {title}
      </h2>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
