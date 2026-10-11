/** Frontend entry point selects the live API workspace or the preserved visual demo. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/open-sans/latin-400.css';
import '@fontsource/open-sans/latin-500.css';
import '@fontsource/open-sans/latin-600.css';
import '@fontsource/open-sans/latin-700.css';
import { DemoProvider } from './context';
import App from './App';
import { GateEntrance } from './GateEntrance';
import LiveWorkspace from './LiveWorkspace';
import './styles.css';
import './button-motion.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      {window.location.pathname === '/live'
        ? <LiveWorkspace />
        : <DemoProvider><GateEntrance><App /></GateEntrance></DemoProvider>}
    </BrowserRouter>
  </StrictMode>,
);
