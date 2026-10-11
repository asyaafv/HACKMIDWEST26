/** The main dashboard uses authenticated backend data on every application route. */
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
import './styles.css';
import './button-motion.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><DemoProvider><GateEntrance><App /></GateEntrance></DemoProvider></BrowserRouter></StrictMode>,
);
