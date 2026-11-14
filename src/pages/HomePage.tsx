import { FeaturedProject } from '../components/FeaturedProject.tsx';
import { Cat } from '../features/cat/Cat.tsx';
import { Logo } from '../features/cat/Logo.tsx';
import { useCat } from '../features/cat/useCat.ts';
import { Pikachu } from '../features/pikachu/Pikachu.tsx';
import { Pokeballs } from '../features/pokeballs/Pokeballs.tsx';
import { projects } from '../data/projects.ts';
import styles from './HomePage.module.css';

/** The landing screen: logo, intro, Pikachu, the newest project, Poké Balls and the cat. */
export function HomePage() {
  const cat = useCat();
  const featured = projects[0];

  return (
    <>
      <main className={styles.container}>
        <Pokeballs />
        <Logo catVisible={cat.visible} onClick={cat.toggleVisible} />
        <h1 className={styles.name}>Wesley Egbertsen</h1>
        <p className={styles.subline}>Full-stack .NET &amp; Azure developer · I also build open-source apps</p>
        <Pikachu />
        {featured && <FeaturedProject project={featured} />}
      </main>
      <Cat visible={cat.visible} glasses={cat.glasses} onClick={cat.toggleGlasses} />
    </>
  );
}
