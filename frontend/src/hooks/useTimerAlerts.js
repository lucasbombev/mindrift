import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocketEvent } from '../context/SocketContext.jsx';
import { audioReady, playSound, primeAudio, subscribeAudio, vibrate } from '../lib/audio.js';
import { useSoundPrefs } from '../context/SoundContext.jsx';
import { requestNotifications, showTimerNotification } from '../lib/pwa.js';

const ACK_PREFIX = 'drift.ack.';

function ackKey(stage, session) {
  return `${ACK_PREFIX}${stage}:${session.id}:${session.fimPrevistoEm || session.fim_previsto_em}`;
}

function isAcknowledged(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function setAcknowledged(key) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* noop */
  }
}

export function useTimerAlerts({ sessions, alertLeadSeconds, soundEnabled, onSoundEnabled, serverOffset = 0 }) {
  const { prefs } = useSoundPrefs();
  const [alerts, setAlerts] = useState([]);
  const prefsRef = useRef(prefs);
  const seenRef = useRef(new Set());
  const soundRef = useRef(soundEnabled);
  const sessionsRef = useRef(sessions);
  const offsetRef = useRef(serverOffset);

  useEffect(() => {
    offsetRef.current = serverOffset;
  }, [serverOffset]);

  useEffect(() => {
    soundRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    return subscribeAudio(() => {
      // Mantém o estado externo sincronizado após o navegador suspender/retomar o áudio.
      if (audioReady() && !soundRef.current) onSoundEnabled?.(true);
    });
  }, [onSoundEnabled]);

  const addAlert = useCallback((session, stage, options = {}) => {
    const key = ackKey(stage, session);
    if (isAcknowledged(key)) return;
    if (seenRef.current.has(key)) return;
    seenRef.current.add(key);

    const pref = prefsRef.current || {};
    const soundName = pref.somNome || pref.tenant?.somFim || 'alarme';
    const volume = pref.volume ?? 70;
    const shouldVibrate = pref.vibrar !== false;
    if (stage === 'end') {
      if (soundRef.current) playSound(soundName, { volume });
      if (shouldVibrate) vibrate([500, 160, 500, 160, 500]);
      if (document.hidden) {
        showTimerNotification({
          title: '⏰ Tempo esgotado!',
          body: `${session.cartCodigo || 'Carrinho'} · ${session.clienteNome || 'Cliente'} — encerre ou renove a sessão.`,
          tag: `drift-expired-${session.id}`,
        });
      }
    } else {
      if (soundRef.current) playSound('beep', { volume });
      if (shouldVibrate) vibrate([160, 90, 160]);
    }

    setAlerts((current) => {
      if (current.some((item) => item.key === key)) return current;
      const cleaned = current.filter(
        (item) => !(item.session.id === session.id && item.stage === stage),
      );
      return [...cleaned, { key, stage, session, at: Date.now(), ...options }];
    });
  }, []);

  const check = useCallback(() => {
    const now = Date.now() + offsetRef.current;
    for (const session of sessionsRef.current || []) {
      if (!session?.fimPrevistoEm) continue;
      const remaining = new Date(session.fimPrevistoEm).getTime() - now;
      if (remaining <= 0) addAlert(session, 'end');
      else if (remaining <= Math.max(0, alertLeadSeconds) * 1000) addAlert(session, 'lead');
    }
  }, [alertLeadSeconds, addAlert]);

  useEffect(() => {
    check();
    const timer = setInterval(check, 500);
    return () => clearInterval(timer);
  }, [check, sessions]);

  useSocketEvent('session:expired', (payload) => {
    const known = sessionsRef.current?.find((item) => item.id === payload.id);
    addAlert(
      known || {
        id: payload.id,
        cartCodigo: payload.cartCodigo,
        clienteNome: payload.clienteNome,
        fimPrevistoEm: payload.fimPrevistoEm,
      },
      'end',
    );
  });

  useSocketEvent('session:expiring', (payload) => {
    const known = sessionsRef.current?.find((item) => item.id === payload.id);
    addAlert(
      known || {
        id: payload.id,
        cartCodigo: payload.cartCodigo,
        clienteNome: payload.clienteNome,
        fimPrevistoEm: payload.fimPrevistoEm,
      },
      'lead',
    );
  });

  // Se a sessão for renovada/encerrada, o alerta antigo deixa de fazer sentido.
  useEffect(() => {
    const activeIds = new Set((sessions || []).map((session) => session.id));
    const endsById = new Map((sessions || []).map((session) => [session.id, session.fimPrevistoEm]));
    setAlerts((current) =>
      current.filter((item) => {
        if (!activeIds.has(item.session.id)) return false;
        return endsById.get(item.session.id) === item.session.fimPrevistoEm;
      }),
    );
  }, [sessions]);

  // Repetição do alarme até alguém confirmar.
  const hasEndAlert = alerts.some((item) => item.stage === 'end');
  useEffect(() => {
    if (!hasEndAlert) return undefined;
    const pref = prefs || {};
    if (pref.tenant?.repetir === false) return undefined;
    const timer = setInterval(() => {
      const current = prefsRef.current || {};
      if (soundRef.current) {
        playSound(current.somNome || current.tenant?.somFim || 'alarme', {
          volume: current.volume ?? 70,
        });
      }
      if (current.vibrar !== false) vibrate([500, 160, 500]);
    }, 12000);
    return () => clearInterval(timer);
  }, [hasEndAlert, prefs?.tenant?.repetir]);

  // Título piscando quando há tempo esgotado.
  useEffect(() => {
    if (!hasEndAlert) return undefined;
    const base = document.title;
    let flip = false;
    const timer = setInterval(() => {
      flip = !flip;
      document.title = flip ? '⏰ TEMPO ESGOTADO — Drift Rent' : 'Drift Rent · Painel da pista';
    }, 1200);
    return () => {
      clearInterval(timer);
      document.title = base;
    };
  }, [hasEndAlert]);

  const acknowledge = useCallback((alert) => {
    setAcknowledged(alert.key);
    setAlerts((current) => current.filter((item) => item.key !== alert.key));
  }, []);

  const acknowledgeAll = useCallback(() => {
    setAlerts((current) => {
      current.forEach((item) => setAcknowledged(item.key));
      return [];
    });
  }, []);

  const enableSound = useCallback(async () => {
    const ok = await primeAudio();
    if (ok) {
      await requestNotifications();
      onSoundEnabled?.(true);
    }
    return ok;
  }, [onSoundEnabled]);

  return {
    alerts,
    endAlerts: alerts.filter((item) => item.stage === 'end'),
    leadAlerts: alerts.filter((item) => item.stage === 'lead'),
    acknowledge,
    acknowledgeAll,
    enableSound,
  };
}
