import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { brl, formatTime, statusLabel } from '../lib/format.js';
import { useToast } from '../context/ToastContext.jsx';
import { CartArt } from '../components/CartCard.jsx';
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
  Select,
  Spinner,
  StatusBadge,
  Textarea,
} from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';
import { preparePhoto } from '../lib/photo.js';

const STATUS_OPTIONS = [
  { value: 'disponivel', label: 'Disponível' },
  { value: 'carregando', label: 'Carregando' },
  { value: 'manutencao', label: 'Manutenção' },
];

function CartFormModal({ cart, onClose, onSaved }) {
  const isEdit = Boolean(cart?.id);
  const [codigo, setCodigo] = useState(cart?.codigo || '');
  const active = Boolean(cart?.sessaoAtiva);
  const [status, setStatus] = useState(
    cart?.status === 'em_uso' ? 'disponivel' : cart?.status || 'disponivel',
  );
  const [observacao, setObservacao] = useState(cart?.observacao || '');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(cart?.fotoUrl || '');
  const [objectUrl, setObjectUrl] = useState('');
  const [removePhoto, setRemovePhoto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const chooseFile = async (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setError('');
    try {
      const prepared = await preparePhoto(selected);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      const url = URL.createObjectURL(prepared);
      setObjectUrl(url);
      setPreview(url);
      setFile(prepared);
      setRemovePhoto(false);
    } catch (err) {
      setError(err.message);
    } finally {
      event.target.value = '';
    }
  };

  const clearPhoto = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    setObjectUrl('');
    setPreview('');
    setFile(null);
    setRemovePhoto(true);
    if (inputRef.current) inputRef.current.value = '';
  };

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!codigo.trim()) return setError('Informe o código do carrinho.');
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('codigo', codigo.trim().toUpperCase());
      if (!active) formData.append('status', status);
      formData.append('observacao', observacao.trim());
      if (file) formData.append('foto', file);
      if (removePhoto) formData.append('remove_foto', '1');
      const data = isEdit
        ? await api.patch(`/carts/${cart.id}`, formData)
        : await api.post('/carts', formData);
      toast(isEdit ? 'Carrinho atualizado.' : 'Carrinho cadastrado.', { type: 'success' });
      onSaved?.(data.item);
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
      title={isEdit ? `Editar ${cart.codigo}` : 'Novo carrinho'}
      subtitle="Código único, status e foto."
      icon="cart"
      dismissible={!loading}
      footer={
        <Button type="submit" form="cart-form" size="lg" loading={loading} icon="check" block>
          {isEdit ? 'Salvar alterações' : 'Cadastrar carrinho'}
        </Button>
      }
    >
      <form id="cart-form" onSubmit={submit} className="stack">
        <InlineError>{error}</InlineError>

        <div className="photo-field">
          <div className="photo-field__preview">
            {preview ? (
              <img src={preview} alt="Prévia do carrinho" />
            ) : (
              <div className="photo-field__empty">
                <Icon name="camera" size={30} />
                <span>Sem foto</span>
              </div>
            )}
          </div>
          <div className="photo-field__actions">
            <input
              ref={inputRef}
              id="foto"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={chooseFile}
              hidden
            />
            <Button
              type="button"
              variant="secondary"
              icon="camera"
              onClick={() => inputRef.current?.click()}
              disabled={loading}
              block
            >
              {preview ? 'Trocar foto' : 'Tirar ou escolher foto'}
            </Button>
            {preview && (
              <Button
                type="button"
                variant="dangerGhost"
                icon="trash"
                onClick={clearPhoto}
                disabled={loading}
                block
                size="sm"
              >
                Remover foto
              </Button>
            )}
            <p className="field__hint">JPG, PNG ou WebP. A imagem é otimizada automaticamente.</p>
          </div>
        </div>

        <div className="form-grid form-grid--2">
          <Field label="Código" htmlFor="cart-codigo" required hint="Ex.: C01, C02…">
            <Input
              id="cart-codigo"
              value={codigo}
              onChange={(event) => setCodigo(event.target.value.toUpperCase())}
              maxLength={12}
              autoCapitalize="characters"
              disabled={loading}
            />
          </Field>
          <Field
            label="Status"
            htmlFor="cart-status"
            hint={active ? 'Em uso até a sessão terminar.' : 'O início do aluguel muda para em uso.'}
          >
            <Select
              id="cart-status"
              value={active ? 'em_uso' : status}
              onChange={(event) => setStatus(event.target.value)}
              disabled={loading || active}
            >
              {active && <option value="em_uso">Em uso</option>}
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Observação" htmlFor="cart-obs" hint="Opcional. Ex.: bateria nova, pneu traseiro.">
          <Textarea
            id="cart-obs"
            rows={2}
            value={observacao}
            onChange={(event) => setObservacao(event.target.value)}
            maxLength={200}
            disabled={loading}
          />
        </Field>
      </form>
    </Modal>
  );
}

export function CartsPage() {
  const [carts, setCarts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formCart, setFormCart] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [statusBusy, setStatusBusy] = useState(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/carts');
      setCarts(data.items || []);
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

  const quickStatus = async (cart, nextStatus) => {
    setStatusBusy(cart.id);
    try {
      const formData = new FormData();
      formData.append('status', nextStatus);
      await api.patch(`/carts/${cart.id}`, formData);
      toast(`${cart.codigo} agora está ${statusLabel(nextStatus).toLowerCase()}.`, {
        type: 'success',
      });
      load();
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setStatusBusy(null);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await api.delete(`/carts/${deleting.id}`);
      toast(`${deleting.codigo} excluído.`, { type: 'success' });
      setDeleting(null);
      load();
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setDeleteLoading(false);
    }
  };

  const summary = useMemo(
    () => ({
      total: carts.length,
      available: carts.filter((cart) => cart.status === 'disponivel').length,
      inUse: carts.filter((cart) => cart.status === 'em_uso').length,
    }),
    [carts],
  );

  return (
    <div className="container">
      <PageHeader
        title="Carrinhos"
        subtitle={`${summary.total} cadastrado(s) · ${summary.available} disponível(is) · ${summary.inUse} em uso`}
        eyebrow="Administração"
        actions={
          <Button icon="plus" onClick={() => setCreateOpen(true)}>
            Novo carrinho
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
      ) : carts.length === 0 ? (
        <EmptyState
          icon="cart"
          title="Cadastre o primeiro carrinho"
          text="Adicione código, foto e status para começar a alugar."
          action={
            <Button icon="plus" onClick={() => setCreateOpen(true)}>
              Novo carrinho
            </Button>
          }
        />
      ) : (
        <div className="admin-cart-grid">
          {carts.map((cart) => {
            const active = Boolean(cart.sessaoAtiva);
            return (
              <article key={cart.id} className={`admin-cart admin-cart--${cart.status}`}>
                <div className="admin-cart__media">
                  {cart.fotoUrl ? (
                    <img src={cart.fotoUrl} alt={`Carrinho ${cart.codigo}`} loading="lazy" />
                  ) : (
                    <CartArt code={cart.codigo} />
                  )}
                  <span className="admin-cart__status">
                    <StatusBadge status={cart.status} />
                  </span>
                </div>
                <div className="admin-cart__body">
                  <div className="admin-cart__head">
                    <div>
                      <h2>{cart.codigo}</h2>
                      <span>{STATUS_OPTIONS.find((item) => item.value === cart.status)?.label || statusLabel(cart.status)}</span>
                    </div>
                    <div className="admin-cart__utils">
                      <IconButton
                        icon="edit"
                        label={`Editar ${cart.codigo}`}
                        onClick={() => setFormCart(cart)}
                      />
                      <IconButton
                        icon="trash"
                        label={`Excluir ${cart.codigo}`}
                        variant="dangerGhost"
                        onClick={() => setDeleting(cart)}
                      />
                    </div>
                  </div>

                  {active ? (
                    <div className="admin-cart__active">
                      <Badge tone="blue">Em uso por {cart.sessaoAtiva.clienteNome}</Badge>
                      <span>Termina às {formatTime(cart.sessaoAtiva.fimPrevistoEm)}</span>
                    </div>
                  ) : (
                    <div className="admin-cart__quick">
                      <span className="admin-cart__quick-label">Definir status:</span>
                      <div className="quick-status">
                        {STATUS_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={`quick-status__btn quick-status__btn--${option.value} ${cart.status === option.value ? 'is-active' : ''}`}
                            onClick={() => quickStatus(cart, option.value)}
                            disabled={statusBusy === cart.id}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {cart.observacao && <p className="admin-cart__obs">{cart.observacao}</p>}
                  {cart.fotoUrl ? (
                    <span className="admin-cart__photo-info">
                      <Icon name="camera" size={14} /> Foto cadastrada
                    </span>
                  ) : (
                    <span className="admin-cart__photo-info is-empty">
                      <Icon name="camera" size={14} /> Sem foto
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {(createOpen || formCart) && (
        <CartFormModal
          cart={formCart}
          onClose={() => {
            setCreateOpen(false);
            setFormCart(null);
          }}
          onSaved={() => {
            setCreateOpen(false);
            setFormCart(null);
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={`Excluir ${deleting?.codigo || 'carrinho'}?`}
        message={
          deleting?.sessaoAtiva
            ? 'Este carrinho tem uma sessão ativa. Encerre ou cancele antes de excluir.'
            : 'O carrinho sai do painel, mas o histórico de sessões continua preservado. O código poderá ser reutilizado.'
        }
        confirmLabel="Excluir carrinho"
        loading={deleteLoading}
      />

      <div className="admin-hint">
        <Icon name="info" size={17} />
        <p>
          O status <strong>em uso</strong> é automático. Enquanto uma sessão estiver ativa, o status
          não pode ser alterado. Fotos ficam salvas no notebook, na pasta <code>backend/uploads</code>.
        </p>
      </div>
    </div>
  );
}
