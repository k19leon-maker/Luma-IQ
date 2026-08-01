import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import Analytics from './components/Analytics/Analytics';
import { cleanupDemoProductStorage } from './utils/demoDataCleanup';
import './styles/global.css';
import './styles/luma.css';

cleanupDemoProductStorage();

const rootElement = document.getElementById('root')!;
rootElement.dataset.appBuild = '2026-08-01-instagram';

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <Analytics />
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
