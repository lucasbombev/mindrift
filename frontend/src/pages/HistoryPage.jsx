import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  addDaysKey,
  brl,
  clientName,
  formatDateTime,
  formatDuration,
  humanRelativeDate,
  paymentLabel,
  toDateKey,
} from '../lib/format.js';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  StatusBadge,
} from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';
import {
  CancelSessionModal,
  EditClientModal,
  PaymentModal,
  SessionDetailsModal,
  ValueModal,
} from '../components/sessionModals.jsx';

const PERIODS = [
  { label: 'Hoje', days: 1 },
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
];

function initialFilters(searchParams) {
  const today = toDateKey();
  return {
    from: searchParams.get('from') || addDaysKey(today, -6),
    to: searchParams.get('to') || today,
    cartId: searchParams.get('cartId') || '',
    cliente: searchParams.get('cliente') || '',
    pago: searchParams.get('pago') || '',
    status: searchParams.get('status') || '',
  };
}

export function HistoryPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => initialFilters(searchParams));
  const [form, setForm] = useState(() => initialFilters(searchParams));
  const [page, setPage] = useState(1);
  const [limit] = useState(30);
  const [data, setData] = useState(null);
  const [carts, setCarts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moreFilters, setMoreFilters] = useState(
    Boolean(searchParams.get('cliente') || searchParams.get('cartId') || searchParams.get('status')),
  );
  const [actionSession, setActionSession] = useState(null);
  const [modal, setModal] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    api
      .get('/carts')
      .then((res) => setCarts(res.items || []))
      .catch(() => {});
  }, []);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      from: filters.from,
      to: filters.to,
      page: String(page),
      limit: String(limit),
    });
    if (filters.cartId) params.set('cartId', filters.cartId);
    if (filters.cliente) params.set('cliente', filters.cliente);
    if (filters.pago) params.set('pago', filters.pago);
    if (filters.status) params.set('status', filters.status);
    return params.toString();
  }, [filters, page, limit]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/sessions?${queryString}`);
      setData(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);

  const applyFilters = (event) => {
    event?.preventDefault();
    setPage(1);
    setFilters({ ...form });
  };

  const applyPeriod = (days) => {
    const today = toDateKey();
    const next = { ...form, from: addDaysKey(today, -(days - 1)), to: today };
    setForm(next);
    setPage(1);
    setFilters(next);
  };

  const clearFilters = () => {
    const next = {
      from: addDaysKey(toDateKey(), -6),
      to: toDateKey(),
      cartId: '',
      cliente: '',
      pago: '',
      status: '',
    };
    setForm(next);
    setFilters(next);
    setPage(1);
  };

  const refreshAfter = (message) => {
    setActionSession(null);
    setModal(null);
    if (message) toast(message, { type: 'success' });
    load();
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await api.delete(`/sessions/${modal.session.id}`);
      setDeleteLoading(false);
      refreshAfter('Sessão excluída do histórico.');
    } catch (err) {
      setDeleteLoading(false);
      toast(err.message, { type: 'error' });
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;

  return (
    <div className="container">
      <PageHeader
        title="Histórico de sessões"
        subtitle="Filtre por período, carrinho, cliente e pagamento."
        eyebrow={isAdmin ? 'Administração' : 'Operação'}
      />

      <section className="filter-card">
        <div className="filter-quick">
          <div className="period-chips" role="group" aria-label="Períodos rápidos">
            {PERIODS.map((period) => {
              const expectedFrom = addDaysKey(toDateKey(), -(period.days - 1));
              const active = form.from === expectedFrom && form.to === toDateKey();
              return (
                <button
                  key={period.days}
                  type="button"
                  className={`chip ${active ? 'is-active' : ''}`}
                  onClick={() => applyPeriod(period.days)}
                >
                  {period.label}
                </button>
              );
            })}
            <button
              type="button"
              className={`chip ${moreFilters ? 'is-active' : ''}`}
              onClick={() => setMoreFilters((value) => !value)}
            >
              <Icon name="filter" size={15} />
              Filtros
              {(filters.cliente || filters.cartId || filters.pago || filters.status) && (
                <span className="chip__dot" />
              )}
            </button>
          </div>
          <div className="filter-dates">
            <label>
              <span>De</span>
              <input
                type="date"
                className="input"
                value={form.from}
                max={form.to}
                onChange={(event) => setForm({ ...form, from: event.target.value })}
              />
            </label>
            <label>
              <span>Até</span>
              <input
                type="date"
                className="input"
                value={form.to}
                min={form.from}
                onChange={(event) => setForm({ ...form, to: event.target.value })}
              />
            </label>
            <Button size="sm" icon="search" onClick={applyFilters}>
              Buscar
            </Button>
          </div>
          <Button size="sm" variant="ghost" icon="refresh" onClick={load} className="filter-refresh">
            Atualizar
          </Button>
        </div>

        {moreFilters && (
          <form className="filter-advanced" onSubmit={applyFilters}>
            <Field label="Cliente" htmlFor="filtro-cliente">
              <Input
                id="filtro-cliente"
                value={form.cliente}
                placeholder="Parte do nome"
                onChange={(event) => setForm({ ...form, cliente: event.target.value })}
              />
            </Field>
            <Field label="Carrinho" htmlFor="filtro-carrinho">
              <Select
                id="filtro-carrinho"
                value={form.cartId}
                onChange={(event) => setForm({ ...form, cartId: event.target.value })}
              >
                <option value="">Todos</option>
                {carts.map((cart) => (
                  <option key={cart.id} value={cart.id}>
                    {cart.codigo}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Pagamento" htmlFor="filtro-pago">
              <Select
                id="filtro-pago"
                value={form.pago}
                onChange={(event) => setForm({ ...form, pago: event.target.value })}
              >
                <option value="">Todos</option>
                <option value="1">Pago</option>
                <option value="0">Pendente</option>
              </Select>
            </Field>
            <Field label="Status" htmlFor="filtro-status">
              <Select
                id="filtro-status"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                <option value="">Todos</option>
                <option value="em_andamento">Em andamento</option>
                <option value="encerrada">Encerrada</option>
                <option value="cancelada">Cancelada</option>
              </Select>
            </Field>
            <div className="filter-advanced__actions">
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Limpar
              </Button>
              <Button type="submit" size="sm" icon="filter">
                Aplicar filtros
              </Button>
            </div>
          </form>
        )}
      </section>

      {data && (
        <div className="history-summary">
          <span>
            <strong>{data.total}</strong> sessão(ões) no período
          </span>
          <span className="history-summary__paid">
            Recebido <strong>{brl(data.resumo.pagoCentavos)}</strong>
          </span>
          <span className="history-summary__pending">
            Pendente <strong>{brl(data.resumo.pendenteCentavos)}</strong>
          </span>
          {data.resumo.emAndamento > 0 && <Badge tone="blue">{data.resumo.emAndamento} em andamento</Badge>}
        </div>
      )}

      {loading ? (
        <div className="center-pad">
          <Spinner size={28} />
          <p className="muted">Carregando sessões…</p>
        </div>
      ) : error ? (
        <div className="error-panel error-panel--inline">
          <p>{error}</p>
          <Button size="sm" icon="refresh" onClick={load}>
            Tentar novamente
          </Button>
        </div>
      ) : data?.items.length === 0 ? (
        <EmptyState
          icon="history"
          title="Nenhuma sessão encontrada"
          text="Ajuste os filtros ou selecione outro período."
          action={
            <Button variant="secondary" size="sm" onClick={clearFilters}>
              Limpar filtros
            </Button>
          }
        />
      ) : (
        <>
          <div className="session-list">
            {data.items.map((session) => (
              <article key={session.id} className={`session-row session-row--${session.status}`}>
                <div className="session-row__top">
                  <div className="session-row__when">
                    <strong>{humanRelativeDate(session.iniciadoEm)}</strong>
                    <span>
                      {formatDateTime(session.iniciadoEm)}
                      {session.encerradoEm ? ` → ${formatDateTime(session.encerradoEm)}` : ''}
                    </span>
                  </div>
                  <div className="session-row__badges">
                    <StatusBadge status={session.status} />
                    {session.status === 'encerrada' && (
                      <Badge
                        tone={
                          session.pago
                            ? 'green'
                            : session.valorAdiantadoCentavos > 0
                              ? 'blue'
                              : 'amber'
                        }
                      >
                        {session.pago
                          ? 'Pago'
                          : session.valorAdiantadoCentavos > 0
                            ? 'Parcial'
                            : 'Pendente'}
                      </Badge>
                    )}
                    {session.status === 'em_andamento' && session.valorAdiantadoCentavos > 0 && (
                      <Badge tone="green">
                        {session.pago ? 'Adiantado' : 'Adicional pendente'}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="session-row__main">
                  <div className="session-row__cart">
                    <span className="session-row__cart-code">{session.cartCodigo}</span>
                    <span className="session-row__cart-label">carrinho</span>
                  </div>
                  <div className="session-row__client">
                    <strong>{clientName(session.clienteNome)}</strong>
                    <span>
                      {session.minutosContratados} min contratados
                      {session.duracaoSegundos ? ` · real ${formatDuration(session.duracaoSegundos)}` : ''}
                    </span>
                    {session.valorAdiantadoCentavos > 0 && (
                      <span className="session-row__advance">
                        Adiantado {brl(session.valorAdiantadoCentavos)}
                        {session.formaAdiantado ? ` · ${paymentLabel(session.formaAdiantado)}` : ''}
                      </span>
                    )}
                    <span className="session-row__operator">Operador: {session.operadorNome || '—'}</span>
                  </div>
                  <div className="session-row__value">
                    <strong>{brl(session.valorCentavos)}</strong>
                    <span>
                      {session.status === 'cancelada'
                        ? 'cancelada'
                        : session.pago
                          ? session.valorAdiantadoCentavos >= session.valorCentavos
                            ? paymentLabel(session.formaAdiantado || session.formaPagamento)
                            : `Quitado${session.formaPagamento ? ` · ${paymentLabel(session.formaPagamento)}` : ''}`
                          : session.valorAdiantadoCentavos > 0
                            ? `Falta ${brl(session.valorPendenteCentavos)}`
                            : 'não pago'}
                    </span>
                  </div>
                  <IconButton
                    icon="more"
                    label={`Ações da sessão de ${clientName(session.clienteNome)}`}
                    onClick={() => setActionSession(session)}
                  />
                </div>

                {session.motivoCancelamento && (
                  <p className="session-row__cancel">
                    <Icon name="alert" size={14} /> Motivo: {session.motivoCancelamento}
                  </p>
                )}
              </article>
            ))}
          </div>

          <div className="pagination">
            <Button
              variant="secondary"
              size="sm"
              icon="chevronLeft"
              disabled={page <= 1 || loading}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Anterior
            </Button>
            <span>
              Página {page} de {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((value) => value + 1)}
            >
              Próxima
              <Icon name="chevronRight" size={17} />
            </Button>
          </div>
        </>
      )}

      <Modal
        open={Boolean(actionSession)}
        onClose={() => setActionSession(null)}
        title={actionSession ? `${actionSession.cartCodigo} · ${clientName(actionSession.clienteNome)}` : ''}
        subtitle={actionSession ? `${formatDateTime(actionSession.iniciadoEm)} · ${brl(actionSession.valorCentavos)}` : ''}
        icon="more"
        size="sm"
      >
        {actionSession && (
          <div className="action-list">
            <button
              type="button"
              className="action-list__item"
              onClick={() => {
                const current = actionSession;
                setActionSession(null);
                setModal({ type: 'details', session: current });
              }}
            >
              <span className="action-list__icon"><Icon name="receipt" size={20} /></span>
              <span>
                <strong>Ver detalhes</strong>
                <small>Tempos, pagamento e auditoria</small>
              </span>
              <Icon name="chevronRight" size={18} />
            </button>

            <button
              type="button"
              className="action-list__item"
              onClick={() => {
                const current = actionSession;
                setActionSession(null);
                setModal({ type: 'client', session: current });
              }}
            >
              <span className="action-list__icon"><Icon name="user" size={20} /></span>
              <span>
                <strong>Editar nome do cliente</strong>
                <small>Útil quando o cliente se identifica depois</small>
              </span>
              <Icon name="chevronRight" size={18} />
            </button>

            {actionSession.status === 'encerrada' &&
              !(
                actionSession.pago &&
                actionSession.valorAdiantadoCentavos > 0 &&
                actionSession.valorAdiantadoCentavos >= actionSession.valorCentavos
              ) && (
              <button
                type="button"
                className="action-list__item"
                onClick={() => {
                  const current = actionSession;
                  setActionSession(null);
                  setModal({ type: 'payment', session: current });
                }}
              >
                <span className="action-list__icon"><Icon name="cash" size={20} /></span>
                <span>
                  <strong>{actionSession.pago ? 'Alterar pagamento' : 'Registrar pagamento'}</strong>
                  <small>{actionSession.pago ? `Pago em ${paymentLabel(actionSession.formaPagamento)}` : 'Marcar como pago'}</small>
                </span>
                <Icon name="chevronRight" size={18} />
              </button>
            )}

            {isAdmin && actionSession.status === 'encerrada' && (
              <button
                type="button"
                className="action-list__item"
                onClick={() => {
                  const current = actionSession;
                  setActionSession(null);
                  setModal({ type: 'value', session: current });
                }}
              >
                <span className="action-list__icon"><Icon name="edit" size={20} /></span>
                <span>
                  <strong>Editar valor</strong>
                  <small>Com registro na auditoria</small>
                </span>
                <Icon name="chevronRight" size={18} />
              </button>
            )}

            {isAdmin && actionSession.status !== 'cancelada' && (
              <button
                type="button"
                className="action-list__item action-list__item--danger"
                onClick={() => {
                  const current = actionSession;
                  setActionSession(null);
                  setModal({ type: 'cancel', session: current });
                }}
              >
                <span className="action-list__icon"><Icon name="close" size={20} /></span>
                <span>
                  <strong>Cancelar sessão</strong>
                  <small>Mantém no histórico com motivo</small>
                </span>
                <Icon name="chevronRight" size={18} />
              </button>
            )}

            {isAdmin && ['encerrada', 'cancelada'].includes(actionSession.status) && (
              <button
                type="button"
                className="action-list__item action-list__item--danger"
                onClick={() => {
                  const current = actionSession;
                  setActionSession(null);
                  setModal({ type: 'delete', session: current });
                }}
              >
                <span className="action-list__icon"><Icon name="trash" size={20} /></span>
                <span>
                  <strong>Excluir do histórico</strong>
                  <small>Some das listas e relatórios</small>
                </span>
                <Icon name="chevronRight" size={18} />
              </button>
            )}
          </div>
        )}
      </Modal>

      {modal?.type === 'details' && (
        <SessionDetailsModal open sessionId={modal.session.id} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'client' && (
        <EditClientModal
          open
          session={modal.session}
          onClose={() => setModal(null)}
          onSuccess={() => refreshAfter('Nome do cliente atualizado.')}
        />
      )}
      {modal?.type === 'payment' && (
        <PaymentModal
          open
          session={modal.session}
          canUnpay={isAdmin}
          onClose={() => setModal(null)}
          onSuccess={(updated) => {
            refreshAfter('Pagamento atualizado.');
          }}
        />
      )}
      {modal?.type === 'value' && (
        <ValueModal
          open
          session={modal.session}
          onClose={() => setModal(null)}
          onSuccess={() => refreshAfter('Valor atualizado.')}
        />
      )}
      {modal?.type === 'cancel' && (
        <CancelSessionModal
          open
          session={modal.session}
          onClose={() => setModal(null)}
          onSuccess={() => refreshAfter('Sessão cancelada.')}
        />
      )}
      <ConfirmDialog
        open={modal?.type === 'delete'}
        onClose={() => setModal(null)}
        onConfirm={handleDelete}
        title="Excluir do histórico?"
        message={
          modal?.session
            ? `A sessão de ${clientName(modal.session.clienteNome)} (${brl(modal.session.valorCentavos)}) será removida das listas e relatórios. A auditoria fica preservada no banco, mas não aparece mais no app.`
            : ''
        }
        confirmLabel="Excluir sessão"
        loading={deleteLoading}
      />
    </div>
  );
}
