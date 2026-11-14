import { FeaturedProject } from '../components/FeaturedProject.tsx';
import { Cat } from '../features/cat/Cat.tsx';
import { CatToggle } from '../features/cat/CatToggle.tsx';
import { useCat } from '../features/cat/useCat.ts';
import { Pokeballs } from '../features/pokeballs/Pokeballs.tsx';
import { projects } from '../data/projects.ts';
import '../styles/glass.css';
import styles from './HomePage.module.css';

/** The landing screen: name, intro and newest project on a glass panel, with the hidden Poké Balls inside it, and the cat. */
export function HomePage() {
  const cat = useCat();
  const featured = projects[0];

  return (
    <>
      <main className={styles.page}>
        <div className={`glass-panel ${styles.glass}`}>
          <h1 className={styles.name}>
            <CatToggle catVisible={cat.visible} onClick={cat.toggleVisible}>
              Wesley Egbertsen
            </CatToggle>
          </h1>
          {/* The no-break space keeps the dot on the first line when the text wraps. */}
          <p className={styles.subline}>Full-stack Azure .NET Developer&nbsp;· I also build open-source apps</p>
          {featured && <FeaturedProject project={featured} />}
          {/* Last, so Tab reaches the name and the project link first; the balls are absolutely positioned inside the glass. */}
          <Pokeballs />
        </div>
      </main>
      <Cat visible={cat.visible} glasses={cat.glasses} onClick={cat.toggleGlasses} />
    </>
  );
}
