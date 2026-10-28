import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getAccessToken, refreshAccessToken } from '../lib/api.js';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext({ socket: null, connected: false });

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (!user || user.mustChangePassword) {
      setSocket(null);
      setConnected(false);
      return undefined;
    }

    const instance = io({
      auth: { token: getAccessToken() },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1200,
      reconnectionDelayMax: 6000,
      timeout: 10000,
    });

    setSocket(instance);
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConnectError = async () => {
      setConnected(false);
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      try {
        const data = await refreshAccessToken();
        if (data?.accessToken) {
          instance.auth = { token: data.accessToken };
          instance.connect();
        }
      } finally {
        refreshingRef.current = false;
      }
    };
    const onToken = (event) => {
      if (event.detail) instance.auth = { token: event.detail };
    };

    instance.on('connect', onConnect);
    instance.on('disconnect', onDisconnect);
    instance.on('connect_error', onConnectError);
    window.addEventListener('drift:token', onToken);

    return () => {
      window.removeEventListener('drift:token', onToken);
      instance.removeAllListeners();
      instance.close();
      setSocket(null);
      setConnected(false);
    };
  }, [user?.id, user?.mustChangePassword]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mantém a autenticação do socket atualizada quando a senha/token é renovada.
  const value = useMemo(() => ({ socket, connected }), [socket, connected]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}

export function useSocketEvent(event, handler) {
  const { socket } = useSocket();
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!socket || !event) return undefined;
    const listener = (...args) => handlerRef.current?.(...args);
    socket.on(event, listener);
    return () => socket.off(event, listener);
  }, [socket, event]);
}
