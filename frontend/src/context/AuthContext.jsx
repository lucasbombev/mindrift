import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  api,
  clearAccessToken,
  getAccessToken,
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

  const signup = useCallback(async (payload) => {
    const data = await api.post('/public/signup', payload);
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data;
  }, []);

  const startImpersonation = useCallback(async (tenantId, motivo) => {
    try {
      sessionStorage.setItem(
        'drift.imp.backup',
        JSON.stringify({ token: getAccessToken(), user }),
      );
    } catch { /* sessionStorage indisponível */ }
    const data = await api.post(`/superadmin/tenants/${tenantId}/impersonate`, { motivo });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data;
  }, [user]);

  const endImpersonation = useCallback(async () => {
    const current = user;
    if (current?.impersonation?.id) {
      try {
        await api.post(`/impersonation/${current.impersonation.id}/end`);
      } catch {
        /* a auditoria pode já ter sido encerrada */
      }
    }
    let backup = null;
    try {
      backup = JSON.parse(sessionStorage.getItem('drift.imp.backup') || 'null');
      sessionStorage.removeItem('drift.imp.backup');
    } catch { /* noop */ }
    if (backup?.token) {
      setAccessToken(backup.token);
      try {
        const data = await api.get('/auth/me');
        setUser(data.user);
        return data.user;
      } catch {
        clearSession();
        return null;
      }
    }
    clearSession();
    return null;
  }, [user, clearSession]);

  const logout = useCallback(async () => {
    try {
      if (user?.impersonation?.id) {
        await api.post(`/impersonation/${user.impersonation.id}/end`);
      }
      await api.post('/auth/logout');
    } catch {
      /* mesmo sem rede, limpa a sessão local */
    }
    try { sessionStorage.removeItem('drift.imp.backup'); } catch { /* noop */ }
    clearSession();
  }, [clearSession, user]);

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
      signup,
      logout,
      startImpersonation,
      endImpersonation,
      changePassword,
      refreshUser,
      retryBoot: boot,
      isAdmin: user?.role === 'admin',
      isSuperadmin: user?.role === 'superadmin',
    }),
    [user, loading, bootError, login, signup, logout, startImpersonation, endImpersonation, changePassword, refreshUser, boot],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
