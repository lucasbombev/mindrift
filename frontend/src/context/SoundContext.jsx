import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { playSound, preloadSounds, primeAudio, SOUND_OPTIONS } from '../lib/audio.js';
import { useAuth } from './AuthContext.jsx';

const SoundContext = createContext(null);
const DEFAULT = {
  somNome: null,
  volume: 70,
  vibrar: true,
  tenant: { somFim: 'alarme', alertLeadSeconds: 60, repetir: true },
  sons: SOUND_OPTIONS.map((item) => item.value),
};

export function SoundProvider({ children }) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState(DEFAULT);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || user.mustChangePassword || user.role === 'superadmin') {
      setPrefs(DEFAULT);
      setLoaded(false);
      return DEFAULT;
    }
    try {
      const data = await api.get('/preferences/sound');
      setPrefs({ ...DEFAULT, ...data });
      setLoaded(true);
      return data;
    } catch {
      setLoaded(true);
      return DEFAULT;
    }
  }, [user?.id, user?.role, user?.mustChangePassword]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (user && !user.mustChangePassword && user.role !== 'superadmin') preloadSounds();
  }, [user?.id, user?.role, user?.mustChangePassword]);

  const save = useCallback(async (patch) => {
    const data = await api.patch('/preferences/sound', patch);
    setPrefs({ ...DEFAULT, ...data });
    return data;
  }, []);

  const test = useCallback(async (name, volume = prefs.volume) => {
    const ok = await primeAudio();
    if (!ok) return false;
    return playSound(name || prefs.somNome || prefs.tenant?.somFim || 'alarme', { volume });
  }, [prefs.volume, prefs.somNome, prefs.tenant?.somFim]);

  const value = useMemo(
    () => ({ prefs, loaded, refresh, save, test }),
    [prefs, loaded, refresh, save, test],
  );
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSoundPrefs() {
  const ctx = useContext(SoundContext);
  if (!ctx) throw new Error('useSoundPrefs deve ser usado dentro de SoundProvider');
  return ctx;
}
