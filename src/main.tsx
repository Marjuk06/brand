import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import './styles/components.css';
import { App } from './App.tsx';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root mount container #root is missing in index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration is non-critical; ignore offline/dev failures.
    });
  });
}
