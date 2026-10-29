import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { alertFeedback, audioReady, primeAudio, subscribeAudio } from '../lib/audio.js';
import { brl, formatTime, greeting, todayLong } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocketEvent } from '../context/SocketContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useNow } from '../hooks/useServerClock.js';
import { useTimerAlerts } from '../hooks/useTimerAlerts.js';
import { CartCard } from '../components/CartCard.jsx';
import { ExpiredAlertsOverlay, LeadAlertBanner } from '../components/Alerts.jsx';
import { EndSessionModal, RenewSessionModal, StartSessionModal } from '../components/sessionModals.jsx';
import {
  Button,
  EmptyState,
  IconButton,
  InfoNote,
  PageHeader,
  Spinner,
  StatCard,
} from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';

function DashboardSkeleton() {
  return (
    <div className="container">
      <div className="dashboard-hero">
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--line" />
      </div>
      <div className="stats-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="skeleton skeleton--stat" />
        ))}
      </div>
      <div className="cart-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="skeleton skeleton--card" />
        ))}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(audioReady());
  const [serverOffset, setServerOffset] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const localNow = useNow(500);
  const serverNow = localNow + serverOffset;

  const applyDashboard = useCallback((next) => {
    setData(next);
    if (next.serverNow) setServerOffset(new Date(next.serverNow).getTime() - Date.now());
    setError('');
  }, []);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const next = await api.get('/dashboard');
        applyDashboard(next);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [applyDashboard],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => subscribeAudio(setSoundEnabled), []);

  useSocketEvent('dashboard', applyDashboard);
  useSocketEvent('tick', (payload) => {
    if (payload?.now) setServerOffset(payload.now - Date.now());
  });
  useSocketEvent('connect', () => load(true));

  const {
    endAlerts,
    leadAlerts,
    acknowledge,
    acknowledgeAll,
    enableSound,
  } = useTimerAlerts({
    sessions: data?.sessoesAtivas || [],
    alertLeadSeconds: data?.alertLeadSeconds ?? 60,
    soundEnabled,
    onSoundEnabled: setSoundEnabled,
    serverOffset,
  });

  const handleSound = async () => {
    if (audioReady()) {
      alertFeedback('lead');
      toast('Alerta sonoro ativo. O alarme toca no fim do tempo.', {
        type: 'success',
        title: 'Som ativado',
      });
      return;
    }
    const ok = await enableSound();
    toast(
      ok
        ? 'Som e notificações ativados neste dispositivo.'
        : 'Seu navegador bloqueou o áudio. Toque novamente ou verifique as permissões.',
      { type: ok ? 'success' : 'warning', title: ok ? 'Alertas ativados' : 'Áudio bloqueado' },
    );
  };

  const refreshAfterAction = () => {
    setModal(null);
    load(true);
  };

  if (loading && !data) return <DashboardSkeleton />;

  if (error && !data) {
    return (
      <div className="container">
        <div className="error-panel">
          <span className="error-panel__icon">
            <Icon name="wifiOff" size={28} />
          </span>
          <h1>Não foi possível carregar o painel</h1>
          <p>{error}</p>
          <Button icon="refresh" onClick={() => load()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const availableCarts = data.carts.filter((cart) => cart.status === 'disponivel');
  const summary = data.summary;
  const filteredCarts = data.carts.filter(
    (cart) =>
      (categoryFilter === 'all' || cart.categoryId === Number(categoryFilter)) &&
      (statusFilter === 'all' || cart.status === statusFilter),
  );
  const statusFilters = [
    { value: 'all', label: 'Todos' },
    { value: 'disponivel', label: 'Disponível' },
    { value: 'em_uso', label: 'Em uso' },
    { value: 'carregando', label: 'Carregando' },
    { value: 'manutencao', label: 'Manutenção' },
  ];

  return (
    <div className="container dashboard">
      <div className="dashboard-hero">
        <div>
          <span className="dashboard-hero__eyebrow">
            {greeting()}, {String(user?.nome || '').split(' ')[0]}
          </span>
          <h1>{data.nomeEstabelecimento || 'Painel da pista'}</h1>
          <p className="dashboard-hero__date">{todayLong()} · timer ao vivo</p>
        </div>
        <div className="dashboard-hero__actions">
          <button
            type="button"
            className={`sound-toggle ${soundEnabled ? 'is-on' : ''}`}
            onClick={handleSound}
            title="Ativar alerta sonoro e notificações"
          >
            <Icon name={soundEnabled ? 'sound' : 'soundOff'} size={20} />
            <span>{soundEnabled ? 'Som ativo' : 'Ativar som'}</span>
          </button>
          <IconButton
            icon="refresh"
            label="Atualizar painel"
            onClick={() => load(true)}
            className={refreshing ? 'is-spinning' : ''}
            disabled={refreshing}
          />
          <Button
            icon="play"
            size="sm"
            className="dashboard-hero__start"
            onClick={() => availableCarts[0] && setModal({ type: 'start', cart: availableCarts[0] })}
            disabled={!availableCarts.length}
          >
            Novo aluguel
          </Button>
        </div>
      </div>

      {!soundEnabled && (
        <button type="button" className="sound-hint" onClick={handleSound}>
          <Icon name="soundOff" size={18} />
          <span>
            <strong>Ative o som</strong> para ser avisado quando o tempo acabar, mesmo em outra aba.
          </span>
          <Icon name="chevronRight" size={16} />
        </button>
      )}

      <LeadAlertBanner
        alerts={leadAlerts}
        now={serverNow}
        onAcknowledge={() => leadAlerts.forEach(acknowledge)}
      />

      <div className="stats-grid">
        <StatCard
          label="Carrinhos"
          value={summary.totalCarrinhos}
          hint={`${summary.disponiveis} disponíveis · ${summary.carregando} na carga`}
          tone="neutral"
          icon="cart"
        />
        <StatCard
          label="Em uso agora"
          value={summary.emUso}
          hint={`${summary.manutencao} em manutenção`}
          tone="blue"
          icon="timer"
        />
        <StatCard
          label="Faturamento hoje"
          value={brl(summary.faturamentoHojeCentavos)}
          hint={`${summary.pagamentosHoje} pagamento(s)`}
          tone="green"
          icon="cash"
        />
        <StatCard
          label="Pendente hoje"
          value={brl(summary.pendenteHojeCentavos)}
          hint={`${summary.pendentesHoje} sessão(ões)`}
          tone={summary.pendentesHoje > 0 ? 'amber' : 'neutral'}
          icon="alert"
        />
      </div>

      <div className="category-filter" aria-label="Filtrar por categoria">
        <button
          type="button"
          className={`filter-chip ${categoryFilter === 'all' ? 'is-active' : ''}`}
          onClick={() => setCategoryFilter('all')}
        >
          <Icon name="filter" size={15} /> Todas
        </button>
        {data.categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`filter-chip ${categoryFilter === String(category.id) ? 'is-active' : ''} ${category.ativo ? '' : 'is-inactive'}`}
            style={{ '--category-color': category.cor }}
            onClick={() => setCategoryFilter(String(category.id))}
          >
            <span aria-hidden="true">{category.icone}</span> {category.nome}
          </button>
        ))}
      </div>

      <div className="status-filter" aria-label="Filtrar por status">
        {statusFilters.map((status) => (
          <button
            key={status.value}
            type="button"
            className={`filter-chip filter-chip--status ${statusFilter === status.value ? 'is-active' : ''}`}
            onClick={() => setStatusFilter(status.value)}
          >
            {status.label}
          </button>
        ))}
      </div>

      <div className="section-head">
        <div>
          <h2>Pista ao vivo</h2>
          <p>
            {summary.emUso > 0
              ? `${summary.emUso} aluguel(is) em andamento`
              : 'Nenhum aluguel em andamento agora'}
            {' · '}
            {data.sessoesAtivas.length > 0
              ? `próximo término às ${formatTime(
                  [...data.sessoesAtivas].sort(
                    (a, b) => new Date(a.fimPrevistoEm) - new Date(b.fimPrevistoEm),
                  )[0]?.fimPrevistoEm,
                )}`
              : 'todos os carrinhos livres'}
          </p>
        </div>
        <div className="legend" aria-label="Legenda de status">
          <span className="legend__item"><i className="legend__dot legend__dot--available" />Disponível</span>
          <span className="legend__item"><i className="legend__dot legend__dot--in-use" />Em uso</span>
          <span className="legend__item"><i className="legend__dot legend__dot--charging" />Carregando</span>
          <span className="legend__item"><i className="legend__dot legend__dot--maintenance" />Manutenção</span>
        </div>
      </div>

      {error && (
        <InfoNote tone="warning" icon="wifiOff">
          {error}
        </InfoNote>
      )}

      {data.carts.length === 0 ? (
        <EmptyState
          icon="cart"
          title="Nenhum carrinho cadastrado"
          text="Cadastre os carrinhos para começar a controlar os aluguéis."
          action={
            isAdmin ? (
              <Link className="btn btn--primary" to="/carrinhos">
                <Icon name="plus" size={19} /> Cadastrar carrinho
              </Link>
            ) : (
              <span className="muted">Peça ao administrador para cadastrar os carrinhos.</span>
            )
          }
        />
      ) : filteredCarts.length === 0 ? (
        <EmptyState
          icon="filter"
          title="Nenhum carrinho neste filtro"
          text="Troque a categoria ou o status para ver outros carrinhos."
          action={
            <Button variant="secondary" onClick={() => { setCategoryFilter('all'); setStatusFilter('all'); }}>
              Limpar filtros
            </Button>
          }
        />
      ) : (
        <div className="cart-grid">
          {filteredCarts.map((cart) => (
            <CartCard
              key={cart.id}
              cart={cart}
              now={serverNow}
              alertLeadSeconds={data.alertLeadSeconds}
              isAdmin={isAdmin}
              onStart={(selected) => setModal({ type: 'start', cart: selected })}
              onRenew={(session) => setModal({ type: 'renew', session })}
              onEnd={(session) => setModal({ type: 'end', session })}
            />
          ))}
        </div>
      )}

      <p className="dashboard-footer">
        <Icon name="info" size={14} />
        O tempo é controlado pelo servidor do notebook. Fechar o app não interrompe o aluguel.
      </p>

      {modal?.type === 'start' && (
        <StartSessionModal
          open
          onClose={() => setModal(null)}
          carts={availableCarts}
          preselectedCart={modal.cart}
          onSuccess={refreshAfterAction}
        />
      )}
      {modal?.type === 'renew' && (
        <RenewSessionModal
          open
          onClose={() => setModal(null)}
          session={modal.session}
          offset={serverOffset}
          onSuccess={refreshAfterAction}
        />
      )}
      {modal?.type === 'end' && (
        <EndSessionModal
          open
          onClose={() => setModal(null)}
          session={modal.session}
          offset={serverOffset}
          onSuccess={refreshAfterAction}
        />
      )}

      <ExpiredAlertsOverlay
        alerts={endAlerts}
        now={serverNow}
        onAcknowledge={acknowledge}
        onAcknowledgeAll={acknowledgeAll}
        onEnd={(session) => setModal({ type: 'end', session })}
        onEnableSound={soundEnabled ? null : handleSound}
      />
    </div>
  );
}
