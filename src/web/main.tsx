import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles/tokens.css';
import './styles/global.css';
import './styles/shell.css';
import './styles/tree.css';
import './styles/landing.css';
import './styles/model.css';
import './styles/modal.css';
import './styles/commands.css';
import './styles/tailwind.css';
import { App } from './App.js';
import { installErrorCapture } from './tasks/errorCapture.js';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing #root element');
}

installErrorCapture();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
