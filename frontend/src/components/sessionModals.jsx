import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { brl, formatDateTime, formatDuration, formatTime, paymentLabel, parseMoneyToCents } from '../lib/format.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  Badge,
  Button,
  Field,
  InlineError,
  Input,
  InfoNote,
  MoneyInput,
  Modal,
  Segmented,
  Spinner,
  Textarea,
  Toggle,
} from './ui.jsx';
import { Icon } from './Icons.jsx';

const PAYMENT_OPTIONS = [
  { value: 'dinheiro', label: 'Dinheiro', icon: 'cash' },
  { value: 'pix', label: 'Pix', icon: 'banknote' },
  { value: 'cartao', label: 'Cartão', icon: 'receipt' },
];

function usePlans(open = true) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(open);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setLoading(true);
    api
      .get('/plans')
      .then((data) => {
        if (!alive) return;
        setPlans(data.items || []);
        setError('');
      })
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open]);
  return { plans, loading, error };
}

function selectedPlan(plans, pricing) {
  return plans.find((plan) => plan.id === Number(pricing.planoId)) || null;
}

export function pricingResult(plans, pricing) {
  if (pricing.modo === 'plano') {
    const plan = selectedPlan(plans, pricing);
    return plan
      ? { minutes: plan.minutos, cents: plan.valorCentavos, name: plan.nome, valid: true }
      : { minutes: 0, cents: 0, name: 'Plano', valid: false };
  }
  const minutes = Number(pricing.minutos);
  const cents = Number(pricing.valorCentavos);
  return {
    minutes,
    cents,
    name: 'Avulso',
    valid: Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440 && Number.isFinite(cents) && cents >= 0,
  };
}

export function pricingPayload(pricing, plans) {
  if (pricing.modo === 'plano') {
    return { plano_id: Number(pricing.planoId) };
  }
  return { minutos: Number(pricing.minutos), valor_centavos: Number(pricing.valorCentavos) };
}

function PricingSelector({ plans, pricing, setPricing, disabled, loading }) {
  const isCustom = pricing.modo === 'avulso';
  return (
    <div className="pricing-selector">
      {loading ? (
        <div className="pricing-loading">
          <Spinner size={18} /> Carregando planos…
        </div>
      ) : null}
      <div className="plan-grid">
        {plans.map((plan) => {
          const active = pricing.modo === 'plano' && Number(pricing.planoId) === plan.id;
          return (
            <button
              key={plan.id}
              type="button"
              className={`plan-card ${active ? 'is-selected' : ''}`}
              onClick={() => setPricing({ ...pricing, modo: 'plano', planoId: plan.id })}
              disabled={disabled}
              aria-pressed={active}
            >
              <span className="plan-card__radio">{active ? <Icon name="check" size={13} /> : null}</span>
              <strong>{plan.nome}</strong>
              <span className="plan-card__minutes">{plan.minutos} minutos</span>
              <span className="plan-card__price">{brl(plan.valorCentavos)}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`plan-card plan-card--custom ${isCustom ? 'is-selected' : ''}`}
          onClick={() => setPricing({ ...pricing, modo: 'avulso' })}
          disabled={disabled}
          aria-pressed={isCustom}
        >
          <span className="plan-card__radio">{isCustom ? <Icon name="check" size={13} /> : null}</span>
          <strong>Outro valor</strong>
          <span className="plan-card__minutes">Tempo e valor livres</span>
          <span className="plan-card__price">Personalizar</span>
        </button>
      </div>
      {isCustom && (
        <div className="form-grid form-grid--2">
          <Field label="Minutos" htmlFor="avulso-minutos">
            <Input
              id="avulso-minutos"
              type="number"
              min="1"
              max="1440"
              inputMode="numeric"
              value={pricing.minutos}
              onChange={(event) => setPricing({ ...pricing, minutos: event.target.value })}
              disabled={disabled}
            />
          </Field>
          <Field label="Valor" htmlFor="avulso-valor">
            <MoneyInput
              id="avulso-valor"
              valueCents={pricing.valorCentavos}
              onChangeCents={(cents) =>
                setPricing({ ...pricing, valorCentavos: cents === null ? 0 : cents })
              }
              disabled={disabled}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

function initialPricing() {
  return { modo: 'plano', planoId: null, minutos: 10, valorCentavos: 1000 };
}

export function StartSessionModal({ open, onClose, carts, preselectedCart, onSuccess }) {
  const { plans, loading: plansLoading, error: plansError } = usePlans(open);
  const [cartId, setCartId] = useState(preselectedCart?.id || carts[0]?.id || '');
  const [cliente, setCliente] = useState('');
  const [observacao, setObservacao] = useState('');
  const [pagamentoAdiantado, setPagamentoAdiantado] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState('pix');
  const [pricing, setPricing] = useState(initialPricing);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const touched = useRef(false);

  useEffect(() => {
    if (plans.length && !pricing.planoId && !touched.current) {
      setPricing((current) => ({ ...current, modo: 'plano', planoId: plans[0].id }));
    }
  }, [plans, pricing.planoId]);

  const result = pricingResult(plans, pricing);
  const predictedEnd = new Date(Date.now() + result.minutes * 60_000);

  const handlePricing = (value) => {
    touched.current = true;
    setPricing(value);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!cartId) return setError('Escolha um carrinho.');
    if (cliente.trim().length < 2) return setError('Informe o nome do cliente.');
    if (!result.valid) return setError('Escolha um plano válido ou informe minutos e valor.');
    setLoading(true);
    try {
      const payload = {
        cart_id: Number(cartId),
        cliente_nome: cliente.trim(),
        observacao: observacao.trim() || undefined,
        pagamento_adiantado: pagamentoAdiantado,
        forma_pagamento: pagamentoAdiantado ? formaPagamento : null,
        ...pricingPayload(pricing, plans),
      };
      const data = await api.post('/sessions', payload);
      toast(
        `Aluguel de ${data.sessao.clienteNome} iniciado no ${data.sessao.cartCodigo}.${
          pagamentoAdiantado ? ` Recebido adiantado: ${brl(data.sessao.valorAdiantadoCentavos)}.` : ' Pagamento no final.'
        }`,
        { type: 'success', title: 'Timer rodando' },
      );
      onSuccess?.(data.sessao);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Iniciar aluguel"
      subtitle="O timer começa no servidor assim que você confirmar."
      icon="play"
      dismissible={!loading}
      footer={
        <Button type="submit" form="form-start-session" size="lg" loading={loading} icon="play" block>
          {result.valid
            ? pagamentoAdiantado
              ? `Iniciar e receber · ${brl(result.cents)}`
              : `Iniciar · ${brl(result.cents)}`
            : 'Iniciar aluguel'}
        </Button>
      }
    >
      <form id="form-start-session" onSubmit={submit} className="stack">
        <InlineError>{error || plansError}</InlineError>

        <Field label="Carrinho" required>
          <div className="cart-picker">
            {carts.length === 0 && <p className="muted">Nenhum carrinho disponível.</p>}
            {carts.map((cart) => (
              <button
                key={cart.id}
                type="button"
                className={`cart-chip ${Number(cartId) === cart.id ? 'is-selected' : ''}`}
                onClick={() => setCartId(cart.id)}
                disabled={loading}
              >
                <span className="cart-chip__dot" />
                <strong>{cart.codigo}</strong>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Nome do cliente" htmlFor="cliente" required>
          <Input
            id="cliente"
            value={cliente}
            onChange={(event) => setCliente(event.target.value)}
            placeholder="Ex.: João"
            maxLength={80}
            autoComplete="off"
            disabled={loading}
          />
        </Field>

        <div>
          <span className="field__label">Plano</span>
          <PricingSelector
            plans={plans}
            pricing={pricing}
            setPricing={handlePricing}
            disabled={loading}
            loading={plansLoading}
          />
        </div>

        <Field label="Pagamento">
          <Segmented
            options={[
              { value: 'final', label: 'No final', icon: 'clock' },
              { value: 'adiantado', label: 'Pago adiantado', icon: 'cash' },
            ]}
            value={pagamentoAdiantado ? 'adiantado' : 'final'}
            onChange={(value) => setPagamentoAdiantado(value === 'adiantado')}
            ariaLabel="Momento do pagamento"
          />
        </Field>

        {pagamentoAdiantado && (
          <>
            <Field label="Forma do pagamento adiantado">
              <Segmented
                options={PAYMENT_OPTIONS}
                value={formaPagamento}
                onChange={setFormaPagamento}
                ariaLabel="Forma de pagamento adiantado"
              />
            </Field>
            <InfoNote tone="success" icon="cash">
              O valor de <strong>{brl(result.cents)}</strong> será registrado agora como recebido. O
              aluguel já começa quitado; se houver renovação, o adicional fica para o encerramento.
            </InfoNote>
          </>
        )}
        {!pagamentoAdiantado && (
          <InfoNote icon="clock">
            O valor será cobrado no <strong>encerramento</strong>. Você também pode deixar pendente no
            histórico.
          </InfoNote>
        )}

        <Field label="Observação" htmlFor="observacao" hint="Opcional. Ex.: cliente pediu recibo.">
          <Input
            id="observacao"
            value={observacao}
            onChange={(event) => setObservacao(event.target.value)}
            maxLength={200}
            disabled={loading}
          />
        </Field>

        {result.valid && (
          <div className="session-preview">
            <div>
              <span>Tempo contratado</span>
              <strong>{result.minutes} min</strong>
            </div>
            <div>
              <span>Valor</span>
              <strong>{brl(result.cents)}</strong>
            </div>
            <div>
              <span>Término previsto</span>
              <strong>~{formatTime(predictedEnd)}</strong>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

export function RenewSessionModal({ open, onClose, session, offset = 0, onSuccess }) {
  const { plans, loading: plansLoading, error: plansError } = usePlans(open);
  const [pricing, setPricing] = useState(initialPricing);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const touched = useRef(false);

  useEffect(() => {
    if (plans.length && !pricing.planoId && !touched.current) {
      setPricing((current) => ({ ...current, modo: 'plano', planoId: plans[0].id }));
    }
  }, [plans, pricing.planoId]);

  const result = pricingResult(plans, pricing);
  const base = Math.max(Date.now() + offset, new Date(session.fimPrevistoEm).getTime());
  const predictedEnd = new Date(base + result.minutes * 60_000);

  const submit = async (event) => {
    event.preventDefault();
    if (!result.valid) return setError('Escolha um plano válido ou informe minutos e valor.');
    setLoading(true);
    setError('');
    try {
      const data = await api.post(`/sessions/${session.id}/renew`, pricingPayload(pricing, plans));
      toast(`+${result.minutes} min para ${session.clienteNome}. Novo total: ${brl(data.sessao.valorCentavos)}.`, {
        type: 'success',
        title: 'Tempo adicionado',
      });
      onSuccess?.(data.sessao);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adicionar tempo"
      subtitle={`${session.cartCodigo} · ${session.clienteNome}`}
      icon="timer"
      dismissible={!loading}
      footer={
        <Button type="submit" form="form-renew-session" size="lg" loading={loading} icon="plus" block>
          {result.valid ? `Adicionar ${result.minutes} min · ${brl(result.cents)}` : 'Adicionar tempo'}
        </Button>
      }
    >
      <form id="form-renew-session" onSubmit={submit} className="stack">
        <InlineError>{error || plansError}</InlineError>
        <div className="session-preview session-preview--compact">
          <div>
            <span>Valor atual</span>
            <strong>{brl(session.valorCentavos)}</strong>
          </div>
          <div>
            <span>Termina às</span>
            <strong>{formatTime(session.fimPrevistoEm)}</strong>
          </div>
          <div>
            <span>Tempo total</span>
            <strong>{session.minutosContratados} min</strong>
          </div>
        </div>
        <div>
          <span className="field__label">Adicionar</span>
          <PricingSelector
            plans={plans}
            pricing={pricing}
            setPricing={(value) => {
              touched.current = true;
              setPricing(value);
            }}
            disabled={loading}
            loading={plansLoading}
          />
        </div>
        {result.valid && (
          <InfoNote icon="clock">
            Novo término previsto: <strong>{formatDateTime(predictedEnd)}</strong> · valor total{' '}
            <strong>{brl(session.valorCentavos + result.cents)}</strong>
          </InfoNote>
        )}
        {result.valid && session.pago && result.cents > 0 && (
          <InfoNote tone="warning" icon="cash">
            Este aluguel estava pago adiantado. O adicional de <strong>{brl(result.cents)}</strong>{' '}
            ficará pendente para receber no encerramento.
          </InfoNote>
        )}
      </form>
    </Modal>
  );
}

export function EndSessionModal({ open, onClose, session, offset = 0, onSuccess }) {
  const adiantado = Math.max(0, Number(session.valorAdiantadoCentavos) || 0);
  const restante = Math.max(
    0,
    Number(session.valorPendenteCentavos ??
      Math.max(0, Number(session.valorCentavos) - adiantado)),
  );
  const jaPago = restante === 0;
  const [pago, setPago] = useState(!jaPago);
  const [forma, setForma] = useState(
    session.formaPagamento || session.formaAdiantado || 'pix',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const now = Date.now() + offset;
  const elapsed = Math.max(0, Math.round((now - new Date(session.iniciadoEm).getTime()) / 1000));
  const remaining = new Date(session.fimPrevistoEm).getTime() - now;

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      const formaFinal = session.formaPagamento || session.formaAdiantado || 'pix';
      const receber = jaPago ? true : pago;
      const data = await api.post(`/sessions/${session.id}/end`, {
        pago: receber,
        forma_pagamento: receber ? (jaPago ? formaFinal : forma) : null,
      });
      let message;
      if (jaPago) {
        message = `Sessão encerrada. O pagamento de ${brl(session.valorPagoCentavos)} já havia sido recebido adiantado.`;
      } else if (pago) {
        message = `Restante de ${brl(restante)} recebido (${paymentLabel(forma)}). Total: ${brl(session.valorCentavos)}.`;
      } else {
        message = `Sessão encerrada com ${brl(restante)} pendente.`;
      }
      toast(message, { type: 'success', title: 'Aluguel encerrado' });
      onSuccess?.(data.sessao);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Encerrar aluguel"
      subtitle={`${session.cartCodigo} · ${session.clienteNome}`}
      icon="stop"
      dismissible={!loading}
      footer={
        <Button variant="success" size="lg" loading={loading} icon="check" onClick={submit} block>
          {jaPago
            ? `Encerrar · já pago`
            : pago
              ? `Encerrar e receber · ${brl(restante)}`
              : `Encerrar · deixar ${brl(restante)} pendente`}
        </Button>
      }
    >
      <div className="stack">
        <InlineError>{error}</InlineError>
        <div className="end-summary">
          <div>
            <span>Tempo real</span>
            <strong>{formatDuration(elapsed)}</strong>
          </div>
          <div>
            <span>Tempo contratado</span>
            <strong>{session.minutosContratados} min</strong>
          </div>
          <div>
            <span>Valor total</span>
            <strong className="end-summary__value">{brl(session.valorCentavos)}</strong>
          </div>
        </div>
        {remaining < 0 && (
          <InfoNote tone="warning" icon="alert">
            O tempo terminou há {formatDuration(Math.abs(remaining) / 1000)}. O valor cobrado é o
            contratado; ajuste manualmente no histórico, se necessário.
          </InfoNote>
        )}

        {jaPago ? (
          <InfoNote tone="success" icon="check">
            Já recebido adiantado: <strong>{brl(session.valorPagoCentavos)}</strong>
            {session.formaAdiantado ? ` em ${paymentLabel(session.formaAdiantado)}` : ''}. Não há
            nada a cobrar no encerramento.
          </InfoNote>
        ) : (
          <>
            {adiantado > 0 && (
              <InfoNote tone="success" icon="cash">
                Já recebido adiantado: <strong>{brl(adiantado)}</strong>. Restante a receber agora:{' '}
                <strong>{brl(restante)}</strong>.
              </InfoNote>
            )}
            <Toggle
              checked={pago}
              onChange={setPago}
              label={adiantado > 0 ? 'Receber o restante agora' : 'Pagamento recebido agora'}
              description={
                pago
                  ? adiantado > 0
                    ? `Será registrado o restante de ${brl(restante)}; o adiantado continua contando.`
                    : 'A sessão será encerrada como paga.'
                  : `O restante de ${brl(restante)} ficará pendente no caixa.`
              }
            />

            {pago && (
              <Field label="Forma de pagamento">
                <Segmented
                  options={PAYMENT_OPTIONS}
                  value={forma}
                  onChange={setForma}
                  ariaLabel="Forma de pagamento"
                />
              </Field>
            )}
            {!pago && (
              <InfoNote tone="warning" icon="alert">
                A sessão ficará com <strong>{brl(restante)} pendente</strong>. Você poderá marcar o
                pagamento no histórico depois.
              </InfoNote>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export function PaymentModal({ open, onClose, session, canUnpay, onSuccess }) {
  const total = Math.max(0, Number(session.valorCentavos) || 0);
  const adiantado = Math.max(0, Number(session.valorAdiantadoCentavos) || 0);
  const restante = Math.max(0, total - adiantado);
  const semParcelaFinal = adiantado > 0 && adiantado >= total;
  const [pago, setPago] = useState(true);
  const [forma, setForma] = useState(session.formaPagamento || session.formaAdiantado || 'pix');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const submit = async () => {
    setError('');
    if (!pago && !canUnpay) return setError('Apenas administradores podem desmarcar pagamentos.');
    setLoading(true);
    try {
      const data = await api.post(`/sessions/${session.id}/payment`, {
        pago,
        forma_pagamento: pago ? forma : null,
      });
      let message = 'Pagamento atualizado.';
      if (!pago) {
        message = adiantado > 0
          ? `Parcela final desmarcada. O adiantado de ${brl(adiantado)} continua registrado.`
          : 'Pagamento desmarcado.';
      } else if (!session.pago && restante > 0) {
        message = `Restante de ${brl(restante)} registrado (${paymentLabel(forma)}).`;
      }
      toast(message, { type: 'success' });
      onSuccess?.(data.sessao);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pagamento"
      subtitle={`${session.cartCodigo} · ${session.clienteNome}`}
      icon="cash"
      dismissible={!loading}
      footer={
        semParcelaFinal ? (
          <Button variant="ghost" onClick={onClose} block>
            Fechar
          </Button>
        ) : (
          <Button size="lg" loading={loading} icon="check" onClick={submit} block>
            Confirmar
          </Button>
        )
      }
    >
      <div className="stack">
        <InlineError>{error}</InlineError>
        <div className="end-summary">
          <div>
            <span>Total</span>
            <strong>{brl(total)}</strong>
          </div>
          <div>
            <span>Adiantado</span>
            <strong>{brl(adiantado)}</strong>
          </div>
          <div>
            <span>{session.pago ? 'Situação' : 'Restante'}</span>
            <strong>{session.pago ? 'Quitado' : brl(restante)}</strong>
          </div>
        </div>
        {semParcelaFinal ? (
          <InfoNote tone="success" icon="check">
            Tudo foi pago adiantado
            {session.formaAdiantado ? ` em ${paymentLabel(session.formaAdiantado)}` : ''}. Não há
            parcela final para alterar.
          </InfoNote>
        ) : (
          <>
            <Toggle
              checked={pago}
              onChange={setPago}
              label="Pagamento quitado"
              description={
                !session.pago && adiantado > 0
                  ? `Registre o restante de ${brl(restante)}. O adiantado já está no caixa.`
                  : session.pago
                    ? 'Atualmente quitado. Desmarque para corrigir a parcela final.'
                    : 'Atualmente pendente.'
              }
              disabled={!canUnpay}
            />
            {pago && (
              <Field label="Forma de pagamento">
                <Segmented
                  options={PAYMENT_OPTIONS}
                  value={forma}
                  onChange={setForma}
                  ariaLabel="Forma de pagamento"
                />
              </Field>
            )}
          </>
        )}
        {session.pagoEm && !semParcelaFinal && (
          <p className="muted small">Parcela final registrada em {formatDateTime(session.pagoEm)}</p>
        )}
      </div>
    </Modal>
  );
}

export function ValueModal({ open, onClose, session, onSuccess }) {
  const [cents, setCents] = useState(session.valorCentavos);
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const submit = async () => {
    if (cents === null || cents < 0) return setError('Informe um valor válido.');
    setLoading(true);
    setError('');
    try {
      const data = await api.patch(`/sessions/${session.id}/value`, {
        valor_centavos: cents,
        motivo: motivo.trim() || undefined,
      });
      toast(`Valor atualizado para ${brl(data.sessao.valorCentavos)}.`, { type: 'success' });
      onSuccess?.(data.sessao);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Editar valor"
      subtitle={`${session.cartCodigo} · ${session.clienteNome}`}
      icon="edit"
      dismissible={!loading}
      footer={
        <Button loading={loading} icon="check" onClick={submit} block>
          Salvar valor
        </Button>
      }
    >
      <div className="stack">
        <InlineError>{error}</InlineError>
        <div className="value-edit">
          <span className="muted">Valor atual</span>
          <strong>{brl(session.valorCentavos)}</strong>
        </div>
        <Field label="Novo valor" htmlFor="novo-valor" required>
          <MoneyInput id="novo-valor" valueCents={cents} onChangeCents={setCents} />
        </Field>
        <Field label="Motivo da alteração" htmlFor="motivo-valor" hint="Fica registrado na auditoria.">
          <Input
            id="motivo-valor"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            maxLength={200}
            placeholder="Ex.: desconto combinado"
          />
        </Field>
      </div>
    </Modal>
  );
}

export function CancelSessionModal({ open, onClose, session, onSuccess }) {
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const submit = async () => {
    if (motivo.trim().length < 3) return setError('Informe o motivo do cancelamento.');
    setLoading(true);
    setError('');
    try {
      await api.post(`/sessions/${session.id}/cancel`, { motivo: motivo.trim() });
      toast('Sessão cancelada e mantida no histórico.', { type: 'success' });
      onSuccess?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancelar sessão"
      subtitle={`${session.cartCodigo} · ${session.clienteNome}`}
      icon="alert"
      dismissible={!loading}
      footer={
        <Button variant="danger" loading={loading} icon="close" onClick={submit} block>
          Cancelar sessão
        </Button>
      }
    >
      <div className="stack">
        <InlineError>{error}</InlineError>
        <InfoNote tone="warning" icon="alert">
          O cancelamento não apaga a sessão: ela fica no histórico com o motivo e não entra no
          faturamento. Se houver pagamento, ele deixa de contar no caixa.
        </InfoNote>
        <Field label="Motivo" htmlFor="motivo-cancel" required>
          <Textarea
            id="motivo-cancel"
            value={motivo}
            onChange={(event) => setMotivo(event.target.value)}
            placeholder="Ex.: cliente desistiu antes de começar"
            maxLength={300}
          />
        </Field>
      </div>
    </Modal>
  );
}

function eventDescription(event) {
  const payload = event.payload || {};
  switch (event.tipo) {
    case 'inicio':
      return `${payload.plano || 'Plano'} · ${payload.minutos || '—'} min · ${brl(payload.valorCentavos || 0)}`;
    case 'renovacao':
      return `+${payload.minutosAdicionados} min · +${brl(payload.valorAdicionadoCentavos || 0)}`;
    case 'encerramento':
      return `${formatDuration(payload.duracaoSegundos || 0)} · ${payload.pago ? 'pago' : 'pendente'}`;
    case 'pagamento':
      return `${payload.pago === false ? 'Desmarcado' : `${brl(payload.valorCentavos || 0)} · ${paymentLabel(payload.formaPagamento)}`}`;
    case 'cancelamento':
      return payload.motivo || 'Sessão cancelada';
    case 'edicao_valor':
      return `${brl(payload.valorAnteriorCentavos || 0)} → ${brl(payload.valorNovoCentavos || 0)}`;
    case 'exclusao':
      return payload.motivo || 'Excluída do histórico';
    default:
      return '';
  }
}

const EVENT_LABEL = {
  inicio: 'Início',
  renovacao: 'Renovação',
  encerramento: 'Encerramento',
  pagamento: 'Pagamento',
  cancelamento: 'Cancelamento',
  edicao_valor: 'Valor editado',
  exclusao: 'Exclusão',
};

function valorPendenteCentavos(session) {
  return Math.max(
    0,
    Number(session.valorPendenteCentavos ?? 0) ||
      Math.max(
        0,
        Number(session.valorCentavos || 0) - Number(session.valorAdiantadoCentavos || 0),
      ),
  );
}

export function SessionDetailsModal({ open, onClose, sessionId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !sessionId) return undefined;
    let alive = true;
    setLoading(true);
    api
      .get(`/sessions/${sessionId}`)
      .then((res) => {
        if (alive) {
          setData(res);
          setError('');
        }
      })
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, sessionId]);

  const session = data?.item;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Detalhes da sessão"
      subtitle={session ? `${session.cartCodigo} · ${session.clienteNome}` : 'Carregando…'}
      icon="receipt"
      size="md"
    >
      {loading ? (
        <div className="center-pad">
          <Spinner />
        </div>
      ) : error ? (
        <InlineError>{error}</InlineError>
      ) : session ? (
        <div className="stack">
          <div className="details-grid">
            <div>
              <span>Status</span>
              <strong>{session.status === 'em_andamento' ? 'Em andamento' : session.status === 'encerrada' ? 'Encerrada' : 'Cancelada'}</strong>
            </div>
            <div>
              <span>Plano inicial</span>
              <strong>{session.planoNome}</strong>
            </div>
            <div>
              <span>Tempo contratado</span>
              <strong>{session.minutosContratados} min</strong>
            </div>
            <div>
              <span>Início</span>
              <strong>{formatDateTime(session.iniciadoEm)}</strong>
            </div>
            <div>
              <span>Término previsto</span>
              <strong>{formatDateTime(session.fimPrevistoEm)}</strong>
            </div>
            <div>
              <span>Encerrada em</span>
              <strong>{formatDateTime(session.encerradoEm)}</strong>
            </div>
            <div>
              <span>Duração real</span>
              <strong>{session.duracaoSegundos ? formatDuration(session.duracaoSegundos) : '—'}</strong>
            </div>
            <div>
              <span>Valor</span>
              <strong>{brl(session.valorCentavos)}</strong>
            </div>
            <div>
              <span>Pagamento</span>
              <strong>
                {session.status === 'cancelada'
                  ? 'Cancelado'
                  : session.pago
                    ? session.valorAdiantadoCentavos >= session.valorCentavos
                      ? 'Quitado · adiantado'
                      : 'Quitado'
                    : session.valorAdiantadoCentavos > 0
                      ? `Parcial · falta ${brl(valorPendenteCentavos(session))}`
                      : 'Pendente'}
              </strong>
            </div>
            {session.valorAdiantadoCentavos > 0 && (
              <>
                <div>
                  <span>Adiantado</span>
                  <strong>
                    {brl(session.valorAdiantadoCentavos)}
                    {session.formaAdiantado ? ` · ${paymentLabel(session.formaAdiantado)}` : ''}
                  </strong>
                </div>
                <div>
                  <span>Adiantado em</span>
                  <strong>{formatDateTime(session.adiantadoEm)}</strong>
                </div>
                {!session.pago && (
                  <div>
                    <span>Restante</span>
                    <strong>{brl(valorPendenteCentavos(session))}</strong>
                  </div>
                )}
              </>
            )}
            <div>
              <span>Operador</span>
              <strong>{session.operadorNome || '—'}</strong>
            </div>
            <div>
              <span>Observação</span>
              <strong>{session.observacao || '—'}</strong>
            </div>
          </div>
          {session.motivoCancelamento && (
            <InfoNote tone="danger" icon="alert">
              Motivo do cancelamento: <strong>{session.motivoCancelamento}</strong>
            </InfoNote>
          )}
          <div>
            <h3 className="section-title">Auditoria</h3>
            <ol className="timeline">
              {(data.eventos || []).map((event) => (
                <li key={event.id} className="timeline__item">
                  <span className="timeline__dot" />
                  <div className="timeline__content">
                    <div className="timeline__head">
                      <strong>{EVENT_LABEL[event.tipo] || event.tipo}</strong>
                      <span>{formatDateTime(event.criadoEm)}</span>
                    </div>
                    <p>
                      {eventDescription(event)}
                      {event.usuarioNome ? ` · por ${event.usuarioNome}` : ''}
                    </p>
                  </div>
                </li>
              ))}
              {!data.eventos?.length && <p className="muted">Nenhum evento registrado.</p>}
            </ol>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

export { PAYMENT_OPTIONS };
