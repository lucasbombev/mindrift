import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { addDaysKey, brl, formatDate, formatDateTime, paymentLabel, toDateKey } from '../lib/format.js';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  InlineError,
  Modal,
  PageHeader,
  Spinner,
  StatCard,
  Textarea,
} from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';

const METHODS = [
  { key: 'dinheiroCentavos', forma: 'dinheiro', icon: 'cash' },
  { key: 'pixCentavos', forma: 'pix', icon: 'banknote' },
  { key: 'cartaoCentavos', forma: 'cartao', icon: 'receipt' },
];

function Receipt({ closure }) {
  if (!closure) return null;
  const payload = closure.payload || {};
  const totals = payload.totais || {};
  return (
    <div className="print-receipt">
      <div className="print-receipt__brand">
        <strong>DRIFT RENT</strong>
        <span>Fechamento de caixa</span>
      </div>
      <p className="print-receipt__date">{formatDate(closure.data)}</p>
      <table>
        <tbody>
          {METHODS.map((method) => (
            <tr key={method.forma}>
              <td>{paymentLabel(method.forma)}</td>
              <td>{brl(totals[method.key] || 0)}</td>
            </tr>
          ))}
          <tr className="print-receipt__total">
            <td>Total recebido</td>
            <td>{brl(closure.totalCentavos)}</td>
          </tr>
        </tbody>
      </table>
      {(payload.porOperador || []).length > 0 && (
        <>
          <h3>Por operador</h3>
          <table>
            <tbody>
              {payload.porOperador.map((operator) => (
                <tr key={`${operator.operadorId}-${operator.operadorNome}`}>
                  <td>{operator.operadorNome}</td>
                  <td>
                    {brl(operator.totalCentavos)} <small>({operator.qtd})</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <div className="print-receipt__pending">
        <span>Pendente do dia</span>
        <strong>{brl(closure.totalPendenteCentavos)}</strong>
      </div>
      <p className="print-receipt__meta">
        {closure.qtdSessoes} sessão(ões) encerrada(s) · Fechado por {closure.usuarioNome || payload.fechadoPor || '—'} em{' '}
        {formatDateTime(closure.criadoEm)}
      </p>
      {payload.observacao && <p className="print-receipt__meta">Obs.: {payload.observacao}</p>}
      <p className="print-receipt__sign">Assinatura: ______________________________</p>
    </div>
  );
}

export function CashPage() {
  const { toast } = useToast();
  const [date, setDate] = useState(toDateKey());
  const [summary, setSummary] = useState(null);
  const [closures, setClosures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [viewClosure, setViewClosure] = useState(null);
  const [printClosure, setPrintClosure] = useState(null);

  const load = useCallback(async (dateKey = date) => {
    setLoading(true);
    try {
      const [summaryData, closuresData] = await Promise.all([
        api.get(`/cash/summary?data=${dateKey}`),
        api.get('/cash/closures'),
      ]);
      setSummary(summaryData);
      setClosures(closuresData.items || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const closeCash = async () => {
    setClosing(true);
    setCloseError('');
    try {
      const data = await api.post('/cash/close', { data: date, observacao: observacao.trim() || null });
      setCloseOpen(false);
      setObservacao('');
      toast(`Caixa de ${formatDate(date)} fechado: ${brl(data.fechamento.totalCentavos)}.`, {
        type: 'success',
        title: 'Caixa fechado',
      });
      setViewClosure(data.fechamento);
      load(date);
    } catch (err) {
      setCloseError(err.message);
    } finally {
      setClosing(false);
    }
  };

  const changeDate = (delta) => {
    setDate(addDaysKey(date, delta));
  };

  const totals = summary?.totais;
  const isToday = date === toDateKey();

  const openReceipt = (closure) => {
    setPrintClosure(closure);
    setViewClosure(closure);
  };

  return (
    <div className="container">
      <PageHeader
        title="Fechamento de caixa"
        subtitle="Confira os recebimentos do dia por forma de pagamento e operador."
        eyebrow="Administração"
      />

      <section className="filter-card cash-filter">
        <div className="cash-date">
          <IconButton icon="chevronLeft" label="Dia anterior" onClick={() => changeDate(-1)} />
          <input
            type="date"
            className="input"
            value={date}
            max={toDateKey()}
            onChange={(event) => setDate(event.target.value)}
          />
          <IconButton
            icon="chevronRight"
            label="Próximo dia"
            onClick={() => changeDate(1)}
            disabled={date >= toDateKey()}
          />
          {!isToday && (
            <Button size="sm" variant="secondary" onClick={() => setDate(toDateKey())}>
              Hoje
            </Button>
          )}
        </div>
        <Button size="sm" variant="ghost" icon="refresh" onClick={() => load(date)}>
          Atualizar
        </Button>
      </section>

      {loading ? (
        <div className="center-pad">
          <Spinner size={28} />
        </div>
      ) : error ? (
        <div className="error-panel error-panel--inline">
          <p>{error}</p>
          <Button size="sm" icon="refresh" onClick={() => load(date)}>
            Tentar novamente
          </Button>
        </div>
      ) : summary ? (
        <>
          {summary.fechado && (
            <div className="closed-banner">
              <span className="closed-banner__icon">
                <Icon name="lock" size={20} />
              </span>
              <div>
                <strong>Caixa fechado</strong>
                <span>
                  {formatDateTime(summary.fechamento.criadoEm)} por {summary.fechamento.usuarioNome || '—'}
                </span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                icon="receipt"
                onClick={() => openReceipt(summary.fechamento)}
              >
                Ver comprovante
              </Button>
            </div>
          )}

          <div className="stats-grid">
            <StatCard
              label="Total recebido"
              value={brl(totals.totalCentavos)}
              hint={`${summary.pagamentos.length} pagamento(s)`}
              tone="green"
              icon="cash"
            />
            <StatCard
              label="Dinheiro"
              value={brl(totals.dinheiroCentavos)}
              hint="em espécie"
              tone="neutral"
              icon="banknote"
            />
            <StatCard
              label="Pix"
              value={brl(totals.pixCentavos)}
              hint="transferência"
              tone="blue"
              icon="cash"
            />
            <StatCard
              label="Cartão"
              value={brl(totals.cartaoCentavos)}
              hint={`pendente: ${brl(summary.pendentes.totalCentavos)}`}
              tone={summary.pendentes.totalCentavos > 0 ? 'amber' : 'neutral'}
              icon="receipt"
            />
          </div>

          <div className="report-grid">
            <section className="report-card">
              <header className="report-card__head">
                <div>
                  <h2>Por operador</h2>
                  <p>{formatDate(date)}</p>
                </div>
              </header>
              {summary.porOperador.length === 0 ? (
                <p className="muted">Nenhum pagamento recebido nesta data.</p>
              ) : (
                <div className="operator-totals">
                  {summary.porOperador.map((operator) => (
                    <div key={operator.operadorId || operator.operadorNome} className="operator-total">
                      <div className="operator-total__head">
                        <strong>{operator.operadorNome}</strong>
                        <span>{brl(operator.totalCentavos)}</span>
                      </div>
                      <div className="operator-total__methods">
                        {Object.entries(operator.porForma)
                          .filter(([, value]) => value > 0)
                          .map(([method, value]) => (
                            <span key={method}>
                              {paymentLabel(method)} {brl(value)}
                            </span>
                          ))}
                      </div>
                      <small>{operator.qtd} recebimento(s)</small>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="report-card">
              <header className="report-card__head">
                <div>
                  <h2>Sessões do dia</h2>
                  <p>Encerramentos e cancelamentos</p>
                </div>
              </header>
              <div className="cash-session-stats">
                <div>
                  <span>Encerradas</span>
                  <strong>{summary.sessoes.encerradas}</strong>
                </div>
                <div>
                  <span>Ticket contratado</span>
                  <strong>{brl(summary.sessoes.valorContratadoCentavos)}</strong>
                </div>
                <div>
                  <span>Canceladas</span>
                  <strong>{summary.sessoes.canceladas}</strong>
                </div>
              </div>
              <div className="cash-close-action">
                <Button
                  size="lg"
                  variant="primary"
                  icon={summary.fechado ? 'lock' : 'check'}
                  disabled={summary.fechado}
                  onClick={() => {
                    setCloseError('');
                    setCloseOpen(true);
                  }}
                  block
                >
                  {summary.fechado ? 'Caixa já fechado' : 'Fechar caixa do dia'}
                </Button>
                {!summary.fechado && summary.pendentes.totalCentavos > 0 && (
                  <p className="muted small">
                    Há {brl(summary.pendentes.totalCentavos)} pendente(s). Você pode fechar mesmo assim;
                    os valores continuam no histórico.
                  </p>
                )}
              </div>
            </section>

            <section className="report-card report-card--wide">
              <header className="report-card__head">
                <div>
                  <h2>Pagamentos recebidos</h2>
                  <p>{summary.pagamentos.length} lançamento(s) em {formatDate(date)}</p>
                </div>
              </header>
              {summary.pagamentos.length === 0 ? (
                <EmptyState icon="cash" title="Nenhum recebimento" text="Os pagamentos marcados neste dia aparecem aqui." compact />
              ) : (
                <div className="cash-payment-list">
                  {summary.pagamentos.map((payment) => (
                    <div key={payment.id} className="cash-payment">
                      <div>
                        <strong>{payment.clienteNome}</strong>
                        <span>
                          {payment.tipo === 'adiantado' ? 'Adiantado' : 'Parcela final'} ·{' '}
                          {paymentLabel(payment.formaPagamento)} · {payment.operadorNome}
                        </span>
                      </div>
                      <span className="cash-payment__time">{formatDateTime(payment.pagoEm)}</span>
                      <strong>{brl(payment.valorCentavos)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="report-card report-card--wide">
              <header className="report-card__head">
                <div>
                  <h2>Pendentes do dia</h2>
                  <p>{summary.pendentes.qtd} sessão(ões) encerradas sem pagamento</p>
                </div>
                <strong>{brl(summary.pendentes.totalCentavos)}</strong>
              </header>
              {summary.pendentes.itens.length === 0 ? (
                <EmptyState icon="check" title="Tudo quitado" text="Nenhuma sessão pendente neste dia." compact />
              ) : (
                <div className="cash-payment-list">
                  {summary.pendentes.itens.map((pending) => (
                    <div key={pending.id} className="cash-payment">
                      <div>
                        <strong>{pending.clienteNome}</strong>
                        <span>
                          {pending.cartCodigo} · {pending.operadorNome} · {formatDateTime(pending.encerradoEm)}
                          {pending.valorAdiantadoCentavos > 0
                            ? ` · adiantado ${brl(pending.valorAdiantadoCentavos)}`
                            : ''}
                        </span>
                      </div>
                      <Badge tone="amber">Pendente</Badge>
                      <strong>{brl(pending.valorCentavos)}</strong>
                    </div>
                  ))}
                  <Link className="cash-link" to={`/historico?pago=0&from=${date}&to=${date}`}>
                    Ir para o histórico e receber <Icon name="chevronRight" size={15} />
                  </Link>
                </div>
              )}
            </section>
          </div>

          <section className="closures-section">
            <div className="section-head">
              <div>
                <h2>Caixas fechados</h2>
                <p>Resumos arquivados, disponíveis para consulta e impressão.</p>
              </div>
            </div>
            {closures.length === 0 ? (
              <p className="muted">Nenhum fechamento registrado ainda.</p>
            ) : (
              <div className="closures-list">
                {closures.map((closure) => (
                  <button
                    key={closure.id}
                    type="button"
                    className="closure-row"
                    onClick={() => openReceipt(closure)}
                  >
                    <span className="closure-row__icon">
                      <Icon name="lock" size={18} />
                    </span>
                    <span className="closure-row__date">
                      <strong>{formatDate(closure.data)}</strong>
                      <small>
                        {closure.qtdSessoes} sessão(ões) · {formatDateTime(closure.criadoEm)}
                      </small>
                    </span>
                    <span className="closure-row__value">{brl(closure.totalCentavos)}</span>
                    <Icon name="chevronRight" size={18} />
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      <Modal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title={`Fechar caixa de ${formatDate(date)}?`}
        subtitle="O resumo será arquivado com os totais deste momento."
        icon="lock"
        dismissible={!closing}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCloseOpen(false)} disabled={closing}>
              Cancelar
            </Button>
            <Button variant="primary" loading={closing} icon="check" onClick={closeCash}>
              Confirmar fechamento
            </Button>
          </>
        }
      >
        <div className="stack">
          <InlineError>{closeError}</InlineError>
          <div className="close-summary">
            <div>
              <span>Total recebido</span>
              <strong>{brl(totals?.totalCentavos || 0)}</strong>
            </div>
            <div>
              <span>Pendente</span>
              <strong>{brl(summary?.pendentes.totalCentavos || 0)}</strong>
            </div>
            <div>
              <span>Sessões</span>
              <strong>{summary?.sessoes.encerradas || 0}</strong>
            </div>
          </div>
          <Field label="Observação" htmlFor="cash-obs" hint="Opcional. Ex.: sangria, troco inicial.">
            <Textarea
              id="cash-obs"
              rows={2}
              value={observacao}
              onChange={(event) => setObservacao(event.target.value)}
              maxLength={300}
              disabled={closing}
            />
          </Field>
          <p className="muted small">
            Após fechar, novos pagamentos desta data não alteram o resumo arquivado. O fechamento
            pode ser reimpresso depois.
          </p>
        </div>
      </Modal>

      <Modal
        open={Boolean(viewClosure)}
        onClose={() => setViewClosure(null)}
        title="Comprovante de fechamento"
        subtitle={viewClosure ? formatDate(viewClosure.data) : ''}
        icon="receipt"
        footer={
          <>
            <Button variant="ghost" onClick={() => setViewClosure(null)}>
              Fechar
            </Button>
            <Button
              icon="print"
              onClick={() => {
                setPrintClosure(viewClosure);
                setTimeout(() => window.print(), 60);
              }}
            >
              Imprimir
            </Button>
          </>
        }
      >
        {viewClosure && <Receipt closure={viewClosure} />}
      </Modal>

      {printClosure &&
        createPortal(
          <div className="print-only-container" aria-hidden="true">
            <Receipt closure={printClosure} />
          </div>,
          document.body,
        )}
    </div>
  );
}
