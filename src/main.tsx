import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import App from './App.tsx';
import { applyTheme, readStoredThemeIndex } from './features/theme/applyTheme.ts';
import './styles/global.css';
import './features/theme/theme.css';

// Before React renders, so the first themed pixel already has the stored colour.
applyTheme(readStoredThemeIndex());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
