import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  addDaysKey,
  brl,
  formatDateShort,
  formatDurationMinutes,
  formatWeekday,
  monthStartKey,
  paymentLabel,
  toDateKey,
} from '../lib/format.js';
import {
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Spinner,
  StatCard,
} from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';

const PRESETS = [
  { id: 'today', label: 'Hoje' },
  { id: 'week', label: '7 dias' },
  { id: 'thisweek', label: 'Esta semana' },
  { id: 'month', label: 'Este mês' },
  { id: 'last30', label: '30 dias' },
];

function rangeForPreset(id) {
  const today = toDateKey();
  if (id === 'today') return { from: today, to: today };
  if (id === 'week') return { from: addDaysKey(today, -6), to: today };
  if (id === 'thisweek') {
    const now = new Date();
    const mondayOffset = (now.getDay() + 6) % 7;
    return { from: addDaysKey(today, -mondayOffset), to: today };
  }
  if (id === 'month') return { from: monthStartKey(), to: today };
  return { from: addDaysKey(today, -29), to: today };
}

function BarChart({ data, valueKey = 'totalCentavos', labelKey = 'data', valueFormatter = brl }) {
  const max = Math.max(1, ...data.map((item) => item[valueKey]));
  return (
    <div className="chart">
      <div className="chart__plot">
        {data.map((item, index) => {
          const height = Math.max(2, (item[valueKey] / max) * 100);
          const showLabel = data.length <= 12 || index % Math.ceil(data.length / 8) === 0 || index === data.length - 1;
          return (
            <div className="chart__col" key={item[labelKey]}>
              <div className="chart__bar-wrap">
                <div
                  className={`chart__bar ${item[valueKey] > 0 ? 'has-value' : ''}`}
                  style={{ height: `${height}%` }}
                  title={`${formatDateShort(item[labelKey])}: ${valueFormatter(item[valueKey])}`}
                />
              </div>
              <span className={`chart__label ${showLabel ? '' : 'is-hidden'}`}>
                {formatDateShort(item[labelKey])}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ReportsPage() {
  const [preset, setPreset] = useState('week');
  const [range, setRange] = useState(() => rangeForPreset('week'));
  const [formRange, setFormRange] = useState(() => rangeForPreset('week'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const load = useCallback(async (currentRange) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ from: currentRange.from, to: currentRange.to });
      const result = await api.get(`/reports/summary?${params.toString()}`);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [load, range]);

  const applyPreset = (id) => {
    const next = rangeForPreset(id);
    setPreset(id);
    setRange(next);
    setFormRange(next);
  };

  const applyCustom = (event) => {
    event.preventDefault();
    if (!formRange.from || !formRange.to) {
      toast('Informe o período completo.', { type: 'warning' });
      return;
    }
    if (formRange.from > formRange.to) {
      toast('A data inicial deve ser anterior à final.', { type: 'warning' });
      return;
    }
    setPreset('custom');
    setRange({ ...formRange });
  };

  const peakHour = data?.horarioPico;
  const paymentTotal = data
    ? Object.values(data.porForma).reduce((sum, value) => sum + value, 0)
    : 0;

  const chartHours = useMemo(() => {
    if (!data) return [];
    return data.horarios.filter((item) => item.hora >= 8 || item.sessoes > 0);
  }, [data]);

  return (
    <div className="container">
      <PageHeader
        title="Relatórios"
        subtitle="Faturamento, ticket médio, carrinhos e devedores."
        eyebrow="Administração"
      />

      <section className="filter-card reports-filter">
        <div className="period-chips">
          {PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip ${preset === item.id ? 'is-active' : ''}`}
              onClick={() => applyPreset(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <form className="filter-dates" onSubmit={applyCustom}>
          <label>
            <span>De</span>
            <input
              type="date"
              className="input"
              value={formRange.from}
              max={formRange.to}
              onChange={(event) => setFormRange({ ...formRange, from: event.target.value })}
            />
          </label>
          <label>
            <span>Até</span>
            <input
              type="date"
              className="input"
              value={formRange.to}
              min={formRange.from}
              onChange={(event) => setFormRange({ ...formRange, to: event.target.value })}
            />
          </label>
          <Button type="submit" size="sm" icon="search">
            Buscar
          </Button>
        </form>
      </section>

      {loading ? (
        <div className="center-pad">
          <Spinner size={28} />
          <p className="muted">Calculando relatórios…</p>
        </div>
      ) : error ? (
        <div className="error-panel error-panel--inline">
          <p>{error}</p>
          <Button size="sm" icon="refresh" onClick={() => load(range)}>
            Tentar novamente
          </Button>
        </div>
      ) : data ? (
        <>
          <div className="stats-grid stats-grid--reports">
            <StatCard
              label="Faturamento recebido"
              value={brl(data.faturamentoCentavos)}
              hint={`${data.recebidos} pagamento(s) no período`}
              tone="green"
              icon="cash"
            />
            <StatCard
              label="Ticket médio"
              value={brl(data.ticketMedioCentavos)}
              hint="por sessão paga"
              tone="blue"
              icon="trendUp"
            />
            <StatCard
              label="Sessões iniciadas"
              value={data.sessoesIniciadas}
              hint={`${data.sessoesEncerradas} encerradas · ${data.sessoesCanceladas} canceladas`}
              tone="neutral"
              icon="cart"
            />
            <StatCard
              label="Pendente acumulado"
              value={brl(data.pendenteCentavos)}
              hint={`${data.pendenteQtd} sessão(ões) em aberto`}
              tone={data.pendenteCentavos > 0 ? 'amber' : 'neutral'}
              icon="alert"
            />
          </div>

          <div className="report-grid">
            <section className="report-card report-card--wide">
              <header className="report-card__head">
                <div>
                  <h2>Faturamento recebido</h2>
                  <p>Por dia de pagamento · {formatDateShort(data.periodo.from)} a {formatDateShort(data.periodo.to)}</p>
                </div>
                <strong>{brl(data.faturamentoCentavos)}</strong>
              </header>
              {data.faturamentoCentavos > 0 ? (
                <BarChart data={data.porDia} />
              ) : (
                <EmptyState icon="chart" title="Sem recebimentos no período" text="Escolha outro período ou registre pagamentos no histórico." compact />
              )}
            </section>

            <section className="report-card">
              <header className="report-card__head">
                <div>
                  <h2>Formas de pagamento</h2>
                  <p>Distribuição do recebido</p>
                </div>
              </header>
              {paymentTotal === 0 ? (
                <p className="muted">Nenhum pagamento registrado.</p>
              ) : (
                <div className="payment-breakdown">
                  {Object.entries(data.porForma)
                    .filter(([, value]) => value > 0)
                    .map(([method, value]) => (
                      <div key={method} className={`payment-method payment-method--${method}`}>
                        <div className="payment-method__top">
                          <span>{paymentLabel(method)}</span>
                          <strong>{brl(value)}</strong>
                        </div>
                        <div className="payment-method__bar">
                          <span style={{ width: `${(value / paymentTotal) * 100}%` }} />
                        </div>
                        <small>{Math.round((value / paymentTotal) * 100)}% do total</small>
                      </div>
                    ))}
                </div>
              )}
            </section>

            <section className="report-card">
              <header className="report-card__head">
                <div>
                  <h2>Horário de pico</h2>
                  <p>Sessões iniciadas por hora</p>
                </div>
                {peakHour?.sessoes > 0 && (
                  <span className="report-highlight">
                    <Icon name="clock" size={16} /> {String(peakHour.hora).padStart(2, '0')}h
                  </span>
                )}
              </header>
              {data.sessoesIniciadas === 0 ? (
                <p className="muted">Nenhuma sessão iniciada no período.</p>
              ) : (
                <div className="hour-chart">
                  {chartHours.map((item) => {
                    const max = Math.max(1, ...chartHours.map((hour) => hour.sessoes));
                    return (
                      <div
                        key={item.hora}
                        className={`hour-bar ${item.hora === peakHour?.hora && item.sessoes > 0 ? 'is-peak' : ''}`}
                        title={`${item.hora}h · ${item.sessoes} sessão(ões)`}
                      >
                        <span className="hour-bar__value">{item.sessoes || ''}</span>
                        <span className="hour-bar__track">
                          <span
                            className="hour-bar__fill"
                            style={{ height: `${Math.max(3, (item.sessoes / max) * 100)}%` }}
                          />
                        </span>
                        <span className="hour-bar__label">{item.hora}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="report-card">
              <header className="report-card__head">
                <div>
                  <h2>Carrinhos</h2>
                  <p>Mais usados e receita gerada</p>
                </div>
              </header>
              {data.carrinhos.length === 0 ? (
                <p className="muted">Sem dados no período.</p>
              ) : (
                <ol className="ranking">
                  {data.carrinhos.map((cart, index) => (
                    <li key={cart.cartCodigo}>
                      <span className={`ranking__pos ${index === 0 ? 'is-first' : ''}`}>{index + 1}</span>
                      <span className="ranking__name">
                        <strong>{cart.cartCodigo}</strong>
                        <small>{cart.sessoes} sessão(ões)</small>
                      </span>
                      <span className="ranking__value">{brl(cart.receitaCentavos)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="report-card report-card--wide">
              <header className="report-card__head">
                <div>
                  <h2>Pendências por cliente</h2>
                  <p>Todo o histórico em aberto, devedores por nome</p>
                </div>
                <strong>{brl(data.pendenteCentavos)}</strong>
              </header>
              {data.devedores.length === 0 ? (
                <EmptyState icon="check" title="Nenhuma pendência" text="Todos os aluguéis encerrados estão pagos." compact />
              ) : (
                <div className="debtors">
                  {data.devedores.map((debtor) => (
                    <div key={debtor.clienteNome} className="debtor">
                      <div className="debtor__info">
                        <strong>{debtor.clienteNome}</strong>
                        <span>
                          {debtor.qtd} sessão(ões) · última em {formatDateShort(debtor.ultimaEm)}
                        </span>
                      </div>
                      <div className="debtor__value">
                        <strong>{brl(debtor.totalCentavos)}</strong>
                        <Link
                          to={`/historico?cliente=${encodeURIComponent(debtor.clienteNome)}&pago=0&from=${addDaysKey(toDateKey(), -365)}&to=${toDateKey()}`}
                          className="debtor__link"
                        >
                          Ver histórico <Icon name="chevronRight" size={15} />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <p className="dashboard-footer">
            <Icon name="info" size={14} />
            Faturamento considera pagamentos recebidos no período. Pendências consideram todas as
            sessões encerradas ainda não pagas.
          </p>
        </>
      ) : null}
    </div>
  );
}
