import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocketEvent } from '../context/SocketContext.jsx';
import { useNow } from '../hooks/useServerClock.js';
import { brl, clientName, formatCountdown, formatElapsed, formatTime } from '../lib/format.js';
import { Button, EmptyState, PageHeader, Spinner } from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';
import { CartArt } from '../components/CartCard.jsx';
import { EndSessionModal, RenewSessionModal } from '../components/sessionModals.jsx';

export function ActiveSessionsPage() {
  const { isAdmin } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [serverOffset, setServerOffset] = useState(0);
  const [endSession, setEndSession] = useState(null);
  const [renewSession, setRenewSession] = useState(null);
  const [searchParams] = useSearchParams();
  const [highlight, setHighlight] = useState(null);
  const targetSessionId = Number(searchParams.get('session')) || null;
  const now = useNow(500) + serverOffset;
  const occupancySummary = useMemo(() => {
    const groups = new Map();
    for (const session of sessions) {
      const capacity = Number(session.cartCapacidadeMaxima) || 1;
      if (capacity <= 1) continue;
      const key = session.cartId;
      if (!groups.has(key)) {
        groups.set(key, {
          cartId: key,
          nome: session.cartCategoryNome || session.cartCodigo,
          codigo: session.cartCodigo,
          capacidade: capacity,
        });
      }
    }
    return [...groups.values()].map((group) => ({
      ...group,
      ocupados: sessions.filter((session) => session.cartId === group.cartId).length,
    }));
  }, [sessions]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.get('/sessions/active');
      setSessions(data.items || []);
      if (data.serverNow) setServerOffset(new Date(data.serverNow).getTime() - Date.now());
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const applySocketSessions = useCallback((payload) => {
    if (!Array.isArray(payload?.sessoesAtivas)) return;
    setSessions(payload.sessoesAtivas);
    if (payload.serverNow) setServerOffset(new Date(payload.serverNow).getTime() - Date.now());
    setError('');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!targetSessionId || !sessions.some((session) => session.id === targetSessionId)) return undefined;
    const node = document.getElementById(`session-${targetSessionId}`);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlight(targetSessionId);
    const timer = setTimeout(() => setHighlight(null), 5000);
    return () => clearTimeout(timer);
  }, [targetSessionId, sessions]);

  useSocketEvent('session_started', applySocketSessions);
  useSocketEvent('session_ended', applySocketSessions);
  useSocketEvent('session_updated', applySocketSessions);
  useSocketEvent('connect', () => load(true));

  return (
    <div className="container active-sessions-page">
      <PageHeader
        title="Em uso"
        subtitle="Veículos com sessão ativa agora. Use Encerrar para fazer o check-in."
        eyebrow="Operação"
      />

      {occupancySummary.length > 0 && (
        <div className="active-occupancy-summary" aria-label="Ocupação dos equipamentos coletivos">
          {occupancySummary.map((group) => (
            <div key={group.cartId} className={`active-occupancy ${group.ocupados >= group.capacidade ? 'is-full' : ''}`}>
              <span>{group.nome}</span>
              <strong>{group.ocupados}/{group.capacidade} ocupados</strong>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="center-pad"><Spinner size={28} /></div>
      ) : error ? (
        <div className="error-panel error-panel--inline"><p>{error}</p><Button size="sm" onClick={() => load()}>Tentar novamente</Button></div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon="timer"
          title="Nenhum veículo em uso"
          text="Quando um aluguel começar, ele aparece aqui com o timer ao vivo."
          action={<Link className="btn btn--primary" to="/">Voltar ao painel</Link>}
        />
      ) : (
        <div className="active-session-list">
          {sessions.map((session) => {
            const open = !session.fimPrevistoEm;
            const remaining = open ? null : new Date(session.fimPrevistoEm).getTime() - now;
            const elapsed = now - new Date(session.iniciadoEm).getTime();
            const countdown = open ? { text: formatElapsed(elapsed), expired: false } : formatCountdown(remaining);
            return (
              <article id={`session-${session.id}`} key={session.id} className={`active-session-card ${open ? 'is-open' : ''} ${countdown.expired ? 'is-expired' : ''} ${highlight === session.id ? 'is-highlighted' : ''}`}>
                <div className="active-session-card__media">
                  {session.cartFotoUrl ? (
                    <img src={session.cartFotoUrl} alt={`Veículo ${session.cartCodigo}`} loading="lazy" />
                  ) : (
                    <CartArt code={session.cartCodigo} />
                  )}
                  <span className="active-session-card__category">
                    {session.cartCategoryIcone || '🏁'} {session.cartCategoryNome || 'Sem categoria'}
                  </span>
                </div>
                <div className="active-session-card__body">
                  <div className="active-session-card__head">
                    <div>
                      <span className="eyebrow">{open ? 'Timer livre' : 'Timer com fim previsto'}</span>
                      <h2>{session.cartCodigo}</h2>
                      <p>{clientName(session.clienteNome)} · {session.planoNome}</p>
                    </div>
                    <div className={`active-session-timer ${open ? 'is-open' : ''} ${countdown.expired ? 'is-expired' : ''}`}>
                      <strong>{countdown.text}</strong>
                      <span>{open ? 'decorrido' : countdown.expired ? 'excedido' : 'restantes'}</span>
                    </div>
                  </div>
                  <div className="active-session-card__meta">
                    <span><Icon name="clock" size={15} /> Início {formatTime(session.iniciadoEm)}</span>
                    <span><Icon name="cash" size={15} /> {session.pago ? 'Pago' : `Valor ${brl(session.valorCentavos)}`}</span>
                    <span><Icon name="user" size={15} /> {session.operadorNome || '—'}</span>
                  </div>
                  <div className="active-session-card__actions">
                    {!open && (
                      <Button variant="secondary" icon="plus" onClick={() => setRenewSession(session)}>Renovar</Button>
                    )}
                    <Button variant="success" icon="stop" onClick={() => setEndSession(session)}>Encerrar aluguel</Button>
                    {isAdmin && <Link className="btn btn--ghost" to="/historico">Ver histórico</Link>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {endSession && (
        <EndSessionModal
          open
          session={endSession}
          offset={serverOffset}
          onClose={() => setEndSession(null)}
          onSuccess={() => { setEndSession(null); load(true); }}
        />
      )}

      {renewSession && (
        <RenewSessionModal
          open
          session={renewSession}
          offset={serverOffset}
          onClose={() => setRenewSession(null)}
          onSuccess={() => { setRenewSession(null); load(true); }}
        />
      )}
    </div>
  );
}
