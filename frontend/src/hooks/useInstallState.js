import { useEffect, useState } from 'react';
import { canInstall, isStandalone } from '../lib/pwa.js';

export function useInstallState() {
  const [canPrompt, setCanPrompt] = useState(canInstall());
  const [standalone, setStandalone] = useState(isStandalone());

  useEffect(() => {
    const refresh = () => setCanPrompt(canInstall());
    const installed = () => {
      setCanPrompt(false);
      setStandalone(true);
    };
    window.addEventListener('drift:install-ready', refresh);
    window.addEventListener('drift:installed', installed);
    return () => {
      window.removeEventListener('drift:install-ready', refresh);
      window.removeEventListener('drift:installed', installed);
    };
  }, []);

  return { canPrompt, standalone };
}
