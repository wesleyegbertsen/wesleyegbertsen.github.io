import { Terminal } from '../features/terminal/Terminal.tsx';
import '../styles/glass.css';
import styles from './TerminalPage.module.css';

/** A shell you can type into, on a glass panel over the matrix rain. */
export function TerminalPage() {
  return (
    <main className={styles.page}>
      <div className="glass-panel">
        <h1 className={styles.title}>Terminal</h1>
        <Terminal />
      </div>
    </main>
  );
}
