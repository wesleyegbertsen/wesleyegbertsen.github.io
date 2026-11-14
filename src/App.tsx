import { Cat } from './features/cat/Cat.tsx';
import { Logo } from './features/cat/Logo.tsx';
import { useCat } from './features/cat/useCat.ts';
import { GameBoy } from './features/gameboy/GameBoy.tsx';
import { MailLink } from './features/gameboy/MailLink.tsx';
import { MatrixBackdrop } from './features/matrix/MatrixBackdrop.tsx';
import { Pikachu } from './features/pikachu/Pikachu.tsx';
import { Pokeballs } from './features/pokeballs/Pokeballs.tsx';
import { SocialBar } from './components/SocialBar.tsx';
import styles from './App.module.css';

export default function App() {
  const cat = useCat();

  return (
    <>
      <MatrixBackdrop />
      <main className={styles.container}>
        <h1 className={styles.visuallyHidden}>Wesley Egbertsen</h1>
        <Pokeballs />
        <Logo catVisible={cat.visible} onClick={cat.toggleVisible} />
        <Pikachu />
      </main>
      <MailLink />
      <GameBoy />
      <SocialBar />
      <Cat visible={cat.visible} glasses={cat.glasses} onClick={cat.toggleGlasses} />
    </>
  );
}
