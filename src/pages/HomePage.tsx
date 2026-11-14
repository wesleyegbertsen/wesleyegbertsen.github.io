import { Cat } from '../features/cat/Cat.tsx';
import { Logo } from '../features/cat/Logo.tsx';
import { useCat } from '../features/cat/useCat.ts';
import { Pikachu } from '../features/pikachu/Pikachu.tsx';
import { Pokeballs } from '../features/pokeballs/Pokeballs.tsx';
import styles from './HomePage.module.css';

/** The landing screen: logo, Pikachu, Poké Balls and the cat. */
export function HomePage() {
  const cat = useCat();

  return (
    <>
      <main className={styles.container}>
        <h1 className={styles.visuallyHidden}>Wesley Egbertsen</h1>
        <Pokeballs />
        <Logo catVisible={cat.visible} onClick={cat.toggleVisible} />
        <Pikachu />
      </main>
      <Cat visible={cat.visible} glasses={cat.glasses} onClick={cat.toggleGlasses} />
    </>
  );
}
