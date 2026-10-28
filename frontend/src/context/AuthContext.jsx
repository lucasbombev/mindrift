import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  api,
  clearAccessToken,
  hasAccessToken,
  refreshAccessToken,
  setAccessToken,
} from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState(null);

  const clearSession = useCallback(() => {
    clearAccessToken();
    setUser(null);
  }, []);

  const boot = useCallback(async () => {
    setLoading(true);
    setBootError(null);
    try {
      if (hasAccessToken()) {
        const data = await api.get('/auth/me');
        setUser(data.user);
      } else if (document.cookie.split(';').some((item) => item.trim().startsWith('drift_has_session='))) {
        const refreshed = await refreshAccessToken();
        if (refreshed?.user) setUser(refreshed.user);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        setBootError(err.message);
      } else {
        clearSession();
      }
    } finally {
      setLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    boot();
    const onExpired = () => {
      setUser(null);
      setAccessToken(null);
    };
    window.addEventListener('drift:sessao-expirada', onExpired);
    return () => window.removeEventListener('drift:sessao-expirada', onExpired);
  }, [boot]);

  const login = useCallback(async (username, password) => {
    const data = await api.post('/auth/login', { username, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* mesmo sem rede, limpa a sessão local */
    }
    clearSession();
  }, [clearSession]);

  const changePassword = useCallback(async (senhaAtual, senhaNova) => {
    const data = await api.post('/auth/change-password', {
      senha_atual: senhaAtual,
      senha_nova: senhaNova,
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data;
  }, []);

  const refreshUser = useCallback(async () => {
    const data = await api.get('/auth/me');
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      bootError,
      login,
      logout,
      changePassword,
      refreshUser,
      retryBoot: boot,
      isAdmin: user?.role === 'admin',
    }),
    [user, loading, bootError, login, logout, changePassword, refreshUser, boot],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
