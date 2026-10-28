import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { primeAudio } from './lib/audio.js';
import { registerSW } from 'virtual:pwa-register';
import './styles.css';

const root = createRoot(document.getElementById('root'));

root.render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <SocketProvider>
            <App />
          </SocketProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);

// Ativa o áudio no primeiro toque (política de autoplay dos navegadores).
// Mantém o contexto de áudio desperto a cada toque (sem remover o listener).
const unlockAudio = () => {
  primeAudio();
};
window.addEventListener('pointerdown', unlockAudio, { passive: true });
window.addEventListener('keydown', unlockAudio);

// Registro do service worker gerado pelo vite-plugin-pwa.
// Em autoUpdate o SW novo assume sozinho; usamos onNeedReload para avisar a
// pessoa e deixar ELA decidir quando recarregar (evita interromper um timer).
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  registerSW({
    immediate: true,
    onNeedReload() {
      window.dispatchEvent(new Event('drift:pwa-update'));
    },
    onOfflineReady() {
      window.dispatchEvent(new Event('drift:pwa-offline-ready'));
    },
    onRegisterError(error) {
      console.warn('Service worker não registrado:', error?.message || error);
    },
  });
}
