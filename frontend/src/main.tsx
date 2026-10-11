/** The main dashboard uses authenticated backend data on every application route. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import { DemoProvider } from './context';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><DemoProvider><App /></DemoProvider></BrowserRouter></StrictMode>);
