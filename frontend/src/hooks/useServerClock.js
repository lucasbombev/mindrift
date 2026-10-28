import { useEffect, useRef, useState } from 'react';

/** Relógio local suavizado com o horário do servidor (fonte da verdade). */
export function useServerClock(serverNowIso) {
  const [tick, setTick] = useState(0);
  const offsetRef = useRef(0);

  useEffect(() => {
    if (!serverNowIso) return;
    const server = new Date(serverNowIso).getTime();
    if (Number.isFinite(server)) offsetRef.current = server - Date.now();
  }, [serverNowIso]);

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 250);
    return () => clearInterval(timer);
  }, []);

  const now = Date.now() + offsetRef.current;
  return { now, offset: offsetRef.current, tick };
}

export function useNow(intervalMs = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
