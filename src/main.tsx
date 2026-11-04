import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LangProvider } from './lib';
import { ToastProvider } from './ui';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </LangProvider>
  </StrictMode>,
);
