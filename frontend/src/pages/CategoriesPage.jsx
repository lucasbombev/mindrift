import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
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
  PageHeader,
  Spinner,
} from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';

const ICON_SUGGESTIONS = ['🏎️', '🏁', '🛴', '🏍️', '🚲', '🛺', '🚗', '🛞'];
const COLOR_SUGGESTIONS = ['#f97316', '#2563eb', '#16a34a', '#7c3aed', '#dc2626', '#0891b2'];

function CategoryModal({ category, onClose, onSaved }) {
  const isEdit = Boolean(category?.id);
  const [nome, setNome] = useState(category?.nome || '');
  const [icone, setIcone] = useState(category?.icone || '🏁');
  const [cor, setCor] = useState(category?.cor || '#f97316');
  const [ativo, setAtivo] = useState(category?.ativo ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (nome.trim().length < 2) return setError('Informe o nome da categoria.');
    if (!/^#[0-9a-fA-F]{6}$/.test(cor)) return setError('Escolha uma cor válida.');
    setLoading(true);
    try {
      const payload = { nome: nome.trim(), icone: icone.trim() || '🏁', cor, ativo };
      if (isEdit) await api.patch(`/categories/${category.id}`, payload);
      else await api.post('/categories', payload);
      toast(isEdit ? 'Categoria atualizada.' : 'Categoria criada.', { type: 'success' });
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
      title={isEdit ? `Editar ${category.nome}` : 'Nova categoria'}
      subtitle="Categorias organizam a frota e os planos."
      icon="tag"
      dismissible={!loading}
      footer={
        <Button type="submit" form="category-form" size="lg" loading={loading} icon="check" block>
          {isEdit ? 'Salvar categoria' : 'Criar categoria'}
        </Button>
      }
    >
      <form id="category-form" onSubmit={submit} className="stack">
        <InlineError>{error}</InlineError>
        <div className="category-preview" style={{ '--category-color': cor }}>
          <span className="category-preview__icon">{icone || '🏁'}</span>
          <div>
            <strong>{nome || 'Nome da categoria'}</strong>
            <span>{ativo ? 'Aparece no cadastro de carrinhos' : 'Categoria inativa'}</span>
          </div>
        </div>
        <Field label="Nome" htmlFor="category-name" required>
          <Input id="category-name" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={50} autoFocus disabled={loading} />
        </Field>
        <Field label="Ícone" htmlFor="category-icon" hint="Use um emoji ou nome curto.">
          <Input id="category-icon" value={icone} onChange={(e) => setIcone(e.target.value)} maxLength={16} disabled={loading} />
        </Field>
        <div className="emoji-picker" aria-label="Sugestões de ícone">
          {ICON_SUGGESTIONS.map((emoji) => (
            <button key={emoji} type="button" className={icone === emoji ? 'is-selected' : ''} onClick={() => setIcone(emoji)} disabled={loading}>{emoji}</button>
          ))}
        </div>
        <Field label="Cor" htmlFor="category-color" hint="Usada no card do carrinho e nas abas.">
          <div className="color-field">
            <input id="category-color" type="color" value={cor} onChange={(e) => setCor(e.target.value)} disabled={loading} />
            <Input value={cor} onChange={(e) => setCor(e.target.value)} maxLength={7} disabled={loading} />
            {COLOR_SUGGESTIONS.map((color) => (
              <button key={color} type="button" style={{ background: color }} aria-label={`Usar cor ${color}`} className={cor === color ? 'is-selected' : ''} onClick={() => setCor(color)} disabled={loading} />
            ))}
          </div>
        </Field>
        <label className="switch-row">
          <span>
            <strong>Categoria ativa</strong>
            <small>Inativas não aparecem para novos carrinhos.</small>
          </span>
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} disabled={loading} />
        </label>
      </form>
    </Modal>
  );
}

export function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [carts, setCarts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [categoryData, cartData] = await Promise.all([
        api.get('/categories?todos=1'),
        api.get('/carts'),
      ]);
      setCategories(categoryData.items || []);
      setCarts(cartData.items || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      const result = await api.delete(`/categories/${deleting.id}`);
      toast(result.mensagem || 'Categoria excluída.', { type: result.desativado ? 'info' : 'success' });
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
        title="Categorias"
        subtitle="Cada carrinho pertence a uma categoria; a cor e o ícone aparecem no painel."
        eyebrow="Administração"
        actions={<Button icon="plus" onClick={() => setModal({ category: null })}>Nova categoria</Button>}
      />

      {loading ? (
        <div className="center-pad"><Spinner size={28} /></div>
      ) : error ? (
        <div className="error-panel error-panel--inline"><p>{error}</p><Button size="sm" icon="refresh" onClick={load}>Tentar novamente</Button></div>
      ) : categories.length === 0 ? (
        <EmptyState icon="tag" title="Nenhuma categoria" text="Crie a primeira categoria da sua frota." action={<Button icon="plus" onClick={() => setModal({ category: null })}>Nova categoria</Button>} />
      ) : (
        <div className="category-grid">
          {categories.map((category) => {
            const count = carts.filter((cart) => cart.categoryId === category.id).length;
            return (
              <article key={category.id} className={`category-admin ${category.ativo ? '' : 'is-inactive'}`} style={{ '--category-color': category.cor }}>
                <div className="category-admin__icon">{category.icone || '🏁'}</div>
                <div className="category-admin__body">
                  <div className="category-admin__head">
                    <h2>{category.nome}</h2>
                    <Badge tone={category.ativo ? 'green' : 'gray'}>{category.ativo ? 'Ativa' : 'Inativa'}</Badge>
                  </div>
                  <p>{count} carrinho(s) · slug {category.slug}</p>
                  <div className="category-admin__actions">
                    <Button size="sm" variant="secondary" icon="edit" onClick={() => setModal({ category })}>Editar</Button>
                    <IconButton icon="trash" label={`Excluir ${category.nome}`} variant="dangerGhost" onClick={() => setDeleting(category)} />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="admin-hint">
        <Icon name="info" size={17} />
        <p>Categorias com carrinhos não são apagadas: são desativadas para preservar o histórico.</p>
      </div>

      {modal && <CategoryModal category={modal.category} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={`Excluir categoria ${deleting?.nome || ''}?`}
        message="Se houver carrinhos ou planos nesta categoria, ela será apenas desativada."
        confirmLabel="Excluir categoria"
        loading={deleteLoading}
      />
    </div>
  );
}
