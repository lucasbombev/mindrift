import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { formatDateTime, statusLabel } from '../lib/format.js';
import { Badge, Button, Field, InlineError, Input, Modal, Textarea } from './ui.jsx';

const MOTIVES = [
  { value: 'bateria', label: 'Bateria' },
  { value: 'motor', label: 'Motor' },
  { value: 'pneu', label: 'Pneu' },
  { value: 'estrutura', label: 'Estrutura' },
  { value: 'outro', label: 'Outro' },
];

function targetsFor(status) {
  if (status === 'disponivel') return ['carregando', 'manutencao'];
  if (status === 'carregando') return ['disponivel', 'manutencao'];
  if (status === 'manutencao') return ['disponivel', 'carregando'];
  return [];
}

export function CartStatusModal({ open, onClose, cart, onSuccess }) {
  const { toast } = useToast();
  const [target, setTarget] = useState('');
  const [motivo, setMotivo] = useState('bateria');
  const [observacao, setObservacao] = useState('');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !cart) return;
    setTarget(targetsFor(cart.status)[0] || '');
    setMotivo('bateria');
    setObservacao('');
    setError('');
    api.get(`/carts/${cart.id}/status-events`).then((data) => setEvents(data.items || [])).catch(() => {});
  }, [open, cart?.id, cart?.status]);

  if (!cart) return null;
  const blocked = cart.status === 'em_uso' || Boolean(cart.sessaoAtiva);
  const targets = targetsFor(cart.status);

  const submit = async () => {
    setError('');
    if (blocked) return setError('Encerre a sessão primeiro.');
    if (!target) return setError('Escolha o novo status.');
    if (target === 'manutencao' && !motivo) return setError('Informe o motivo da manutenção.');
    if (target === 'manutencao' && motivo === 'outro' && observacao.trim().length < 3) {
      return setError('Descreva a manutenção ao escolher “Outro”.');
    }
    setLoading(true);
    try {
      await api.post(`/carts/${cart.id}/status`, {
        status: target,
        motivo: target === 'manutencao' ? motivo : null,
        observacao: observacao.trim() || null,
      });
      toast(`Status de ${cart.codigo} atualizado para ${statusLabel(target)}.`, { type: 'success' });
      onSuccess?.(target);
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
      title={`Status · ${cart.codigo}`}
      subtitle={`${cart.category?.icone || ''} ${cart.category?.nome || ''} · agora ${statusLabel(cart.status)}`}
      icon="settings"
      dismissible={!loading}
      footer={!blocked ? (
        <Button size="lg" icon="check" loading={loading} onClick={submit} block>
          Confirmar status
        </Button>
      ) : undefined}
    >
      <div className="stack">
        <InlineError>{error}</InlineError>
        {blocked ? (
          <div className="status-blocked">
            <strong>Encerre a sessão primeiro.</strong>
            <span>Não é possível mudar o status de um carrinho em uso.</span>
          </div>
        ) : (
          <>
            <Field label="Novo status">
              <div className="status-options">
                {targets.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`status-option ${target === value ? 'is-selected' : ''}`}
                    onClick={() => setTarget(value)}
                  >
                    {statusLabel(value)}
                  </button>
                ))}
              </div>
            </Field>
            {target === 'manutencao' && (
              <>
                <Field label="Motivo" htmlFor="status-motivo" required>
                  <select id="status-motivo" className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                    {MOTIVES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </Field>
                <Field
                  label={motivo === 'outro' ? 'Descreva a manutenção' : 'Observação (opcional)'}
                  htmlFor="status-obs"
                  hint={motivo === 'outro' ? 'Obrigatório para “Outro”.' : undefined}
                >
                  <Textarea id="status-obs" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={300} />
                </Field>
              </>
            )}
          </>
        )}

        {events.length > 0 && (
          <div className="status-history">
            <span className="field__label">Histórico de status</span>
            {events.slice(0, 6).map((event) => (
              <div key={event.id} className="status-history__row">
                <Badge tone="gray">{statusLabel(event.de)} → {statusLabel(event.para)}</Badge>
                <span>{event.motivo ? `${event.motivo}${event.observacao ? ` · ${event.observacao}` : ''}` : event.usuarioNome}</span>
                <small>{formatDateTime(event.criadoEm)}</small>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
