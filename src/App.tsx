import { Navigate, Route, Routes } from 'react-router';
import { GameBoy } from './features/gameboy/GameBoy.tsx';
import { MailLink } from './components/MailLink.tsx';
import { MatrixBackdrop } from './features/matrix/MatrixBackdrop.tsx';
import { SiteMenu } from './components/SiteMenu.tsx';
import { SocialBar } from './components/SocialBar.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { ProjectsPage } from './pages/ProjectsPage.tsx';

/** What every page shares: the backdrop, the menu and the bottom icons. */
export default function App() {
  return (
    <>
      <MatrixBackdrop />
      <SiteMenu />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <MailLink />
      <GameBoy />
      <SocialBar />
    </>
  );
}
