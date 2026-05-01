import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { useAuthStore } from './store/auth.store';
import './styles/global.css';
import './styles/luma.css';

// Restore session before first render to avoid flash redirect to /login
useAuthStore.getState().restoreSession().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
});
