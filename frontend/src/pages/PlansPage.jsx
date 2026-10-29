import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { brl, formatDurationMinutes } from '../lib/format.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  InlineError,
  Input,
  Modal,
  MoneyInput,
  PageHeader,
  Spinner,
  Toggle,
} from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';

function PlanModal({ plan, categories, onClose, onSaved }) {
  const isEdit = Boolean(plan?.id);
  const [nome, setNome] = useState(plan?.nome || '');
  const [minutos, setMinutos] = useState(plan?.minutos || 10);
  const [valor, setValor] = useState(plan?.valorCentavos ?? 800);
  const [categoryId, setCategoryId] = useState(plan?.categoryId || '');
  const [ativo, setAtivo] = useState(plan?.ativo ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!nome.trim()) return setError('Informe o nome do plano.');
    if (!Number.isInteger(Number(minutos)) || Number(minutos) < 1) {
      return setError('Informe os minutos do plano.');
    }
    if (valor === null || valor < 0) return setError('Informe um valor válido.');
    setLoading(true);
    try {
      const payload = {
        nome: nome.trim(),
        minutos: Number(minutos),
        valor_centavos: valor,
        category_id: categoryId ? Number(categoryId) : null,
        ativo,
      };
      if (isEdit) await api.patch(`/plans/${plan.id}`, payload);
      else await api.post('/plans', payload);
      toast(isEdit ? 'Plano atualizado.' : 'Plano criado.', { type: 'success' });
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Editar plano' : 'Novo plano'}
      subtitle="Tempo e valor cobrado no início do aluguel."
      icon="timer"
      dismissible={!loading}
      footer={
        <Button type="submit" form="plan-form" size="lg" loading={loading} icon="check" block>
          {isEdit ? 'Salvar plano' : 'Criar plano'}
        </Button>
      }
    >
      <form id="plan-form" onSubmit={submit} className="stack">
        <InlineError>{error}</InlineError>
        <Field label="Nome" htmlFor="plan-nome" required hint="Ex.: 5 min, 10 min, Promoção.">
          <Input
            id="plan-nome"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            maxLength={40}
            disabled={loading}
            autoFocus
          />
        </Field>
        <div className="form-grid form-grid--2">
          <Field label="Minutos" htmlFor="plan-minutos" required>
            <Input
              id="plan-minutos"
              type="number"
              min="1"
              max="1440"
              inputMode="numeric"
              value={minutos}
              onChange={(event) => setMinutos(event.target.value)}
              disabled={loading}
            />
          </Field>
          <Field label="Valor" htmlFor="plan-valor" required>
            <MoneyInput id="plan-valor" valueCents={valor} onChangeCents={setValor} disabled={loading} />
          </Field>
        </div>
        <Field label="Categoria" htmlFor="plan-category" hint="Sem categoria = vale para todas as categorias do negócio.">
          <select
            id="plan-category"
            className="input"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            disabled={loading}
          >
            <option value="">Todas as categorias</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.icone} {category.nome}{category.ativo ? '' : ' (inativa)'}
              </option>
            ))}
          </select>
        </Field>
        <Toggle
          checked={ativo}
          onChange={setAtivo}
          label="Plano ativo"
          description="Planos inativos não aparecem para iniciar aluguéis."
          disabled={loading}
        />
        {Number(minutos) > 0 && valor !== null && (
          <p className="muted small">
            Equivale a {brl(Math.round(valor / Number(minutos)))} por minuto.
          </p>
        )}
      </form>
    </Modal>
  );
}

export function PlansPage() {
  const [plans, setPlans] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, categoryData] = await Promise.all([
        api.get('/plans?todos=1'),
        api.get('/categories?todos=1'),
      ]);
      setPlans(data.items || []);
      setCategories(categoryData.items || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleActive = async (plan) => {
    try {
      await api.patch(`/plans/${plan.id}`, { ativo: !plan.ativo });
      toast(plan.ativo ? 'Plano desativado.' : 'Plano ativado.', { type: 'success' });
      load();
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      const result = await api.delete(`/plans/${deleting.id}`);
      toast(result.mensagem || 'Plano excluído.', { type: result.desativado ? 'info' : 'success' });
      setDeleting(null);
      load();
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="container">
      <PageHeader
        title="Planos"
        subtitle="Combos de tempo e valor exibidos no início do aluguel."
        eyebrow="Administração"
        actions={
          <Button icon="plus" onClick={() => setModal({ plan: null })}>
            Novo plano
          </Button>
        }
      />

      {loading ? (
        <div className="center-pad">
          <Spinner size={28} />
        </div>
      ) : error ? (
        <div className="error-panel error-panel--inline">
          <p>{error}</p>
          <Button size="sm" icon="refresh" onClick={load}>
            Tentar novamente
          </Button>
        </div>
      ) : plans.length === 0 ? (
        <EmptyState
          icon="timer"
          title="Nenhum plano cadastrado"
          text="Crie planos rápidos de 5, 10 e 15 minutos para agilizar o atendimento."
          action={
            <Button icon="plus" onClick={() => setModal({ plan: null })}>
              Criar plano
            </Button>
          }
        />
      ) : (
        <div className="plans-grid">
          {plans.map((plan) => (
            <article key={plan.id} className={`plan-admin ${plan.ativo ? '' : 'is-inactive'}`}>
              <div className="plan-admin__head">
                <div>
                  <span className="plan-admin__minutes">Duração</span>
                  <h2>{plan.nome}</h2>
                </div>
                <Badge tone={plan.ativo ? 'green' : 'gray'}>{plan.ativo ? 'Ativo' : 'Inativo'}</Badge>
              </div>
              <strong className="plan-admin__price">{brl(plan.valorCentavos)}</strong>
              <span className="plan-admin__per">
                {formatDurationMinutes(plan.minutos)} de pista
                {plan.minutos > 0 && ` · ${brl(Math.round(plan.valorCentavos / plan.minutos))}/min`}
                <br />
                <span className="plan-admin__category">
                  {plan.categoryId ? `${plan.categoryIcone || '🏁'} ${plan.categoryNome}` : 'Todas as categorias'}
                </span>
              </span>
              <div className="plan-admin__actions">
                <Button
                  size="sm"
                  variant="secondary"
                  icon="edit"
                  onClick={() => setModal({ plan })}
                >
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant={plan.ativo ? 'ghost' : 'successGhost'}
                  onClick={() => toggleActive(plan)}
                >
                  {plan.ativo ? 'Desativar' : 'Ativar'}
                </Button>
                <IconButton
                  icon="trash"
                  label={`Excluir plano ${plan.nome}`}
                  variant="dangerGhost"
                  onClick={() => setDeleting(plan)}
                />
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="admin-hint">
        <Icon name="info" size={17} />
        <p>
          Planos com sessões no histórico não são apagados: eles ficam <strong>inativos</strong> para
          preservar relatórios antigos.
        </p>
      </div>

      {modal && (
        <PlanModal
          plan={modal.plan}
          categories={categories}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={`Excluir plano ${deleting?.nome || ''}?`}
        message="Se o plano já tiver sido usado, ele será apenas desativado para preservar o histórico."
        confirmLabel="Excluir plano"
        loading={deleteLoading}
      />
    </div>
  );
}
