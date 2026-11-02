import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { playSound, primeAudio, vibrate } from '../lib/audio.js';
import { useSoundPrefs } from '../context/SoundContext.jsx';

/**
 * Quando a notificação push é tocada, o service worker abre /em-uso?push_sound=1.
 * Este handler toca o alarme local com a preferência do usuário em Ajustes.
 */
export function PushSoundHandler() {
  const { prefs, loaded } = useSoundPrefs();
  const location = useLocation();
  const navigate = useNavigate();
  const pendingRef = useRef(false);
  const lastPlayRef = useRef(0);

  const playAlarm = useCallback(async () => {
    const now = Date.now();
    if (now - lastPlayRef.current < 1500) return;
    lastPlayRef.current = now;
    const sound = prefs.somNome || prefs.tenant?.somFim || 'alarme';
    const volume = prefs.volume ?? 70;
    const ok = await primeAudio();
    if (ok) {
      await playSound(sound, { volume });
      if (prefs.vibrar !== false) vibrate([500, 160, 500, 160, 500]);
    } else {
      const retry = async () => {
        if (await primeAudio()) {
          await playSound(sound, { volume });
          if (prefs.vibrar !== false) vibrate([500, 160, 500, 160, 500]);
        }
      };
      window.addEventListener('pointerdown', retry, { once: true, passive: true });
      window.addEventListener('keydown', retry, { once: true });
    }
  }, [prefs.somNome, prefs.tenant?.somFim, prefs.volume, prefs.vibrar]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('push_sound') !== '1') return;
    params.delete('push_sound');
    params.delete('som');
    pendingRef.current = true;
    navigate(
      {
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : '',
        hash: location.hash,
      },
      { replace: true },
    );
  }, [location.pathname, location.search, location.hash, navigate]);

  useEffect(() => {
    if (!pendingRef.current || !loaded) return;
    pendingRef.current = false;
    playAlarm();
  }, [loaded, playAlarm]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (event) => {
      if (event.data?.type !== 'mindrift-push-sound' || !loaded) return;
      playAlarm();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [loaded, playAlarm]);

  return null;
}
