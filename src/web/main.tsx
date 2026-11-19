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
import { App } from './App.js';
import { migrateDashboardProperties } from './layout/instanceSettings.js';
import { migrateLegacyTheme } from './settings/settings.js';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing #root element');
}

migrateLegacyTheme();
migrateDashboardProperties();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
