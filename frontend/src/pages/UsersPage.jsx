import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { formatDateTime, initials, roleLabel } from '../lib/format.js';
import { formatPhoneDisplay, formatPhoneInput, phoneIsValid } from '../lib/phone.js';
import {
  Avatar,
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
  Toggle,
} from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';

function UserModal({ user, onClose, onSaved }) {
  const isEdit = Boolean(user?.id);
  const [nome, setNome] = useState(user?.nome || '');
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [telefone, setTelefone] = useState(user?.telefone ? formatPhoneDisplay(user.telefone) : '');
  const [role, setRole] = useState(user?.role || 'operador');
  const [ativo, setAtivo] = useState(user?.ativo ?? true);
  const [senha, setSenha] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (nome.trim().length < 2) return setError('Informe o nome completo.');
    if (username.trim().length < 3) return setError('Informe um usuário com pelo menos 3 caracteres.');
    if (telefone && !phoneIsValid(telefone)) return setError('Telefone inválido. Use (DD) 9XXXX-XXXX.');
    if (!isEdit && senha.length < 8) return setError('A senha inicial deve ter pelo menos 8 caracteres.');
    if (senha && (senha.length < 8 || !/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha))) {
      return setError('A senha deve ter pelo menos 8 caracteres, com letras e números.');
    }
    setLoading(true);
    try {
      const payload = {
        nome: nome.trim(),
        username: username.trim(),
        email: email.trim() || null,
        telefone: telefone || null,
        role,
        ativo,
      };
      if (senha) payload.senha = senha;
      if (isEdit) await api.patch(`/users/${user.id}`, payload);
      else await api.post('/users', payload);
      toast(
        isEdit
          ? 'Usuário atualizado.'
          : 'Usuário criado. No primeiro acesso ele deverá trocar a senha.',
        { type: 'success', title: isEdit ? 'Atualizado' : 'Usuário criado' },
      );
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
      title={isEdit ? `Editar ${user.nome}` : 'Novo usuário'}
      subtitle="Defina o perfil de acesso e a senha inicial."
      icon="users"
      dismissible={!loading}
      footer={
        <Button type="submit" form="user-form" size="lg" loading={loading} icon="check" block>
          {isEdit ? 'Salvar usuário' : 'Criar usuário'}
        </Button>
      }
    >
      <form id="user-form" onSubmit={submit} className="stack">
        <InlineError>{error}</InlineError>
        <Field label="Nome completo" htmlFor="user-nome" required>
          <Input
            id="user-nome"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            maxLength={80}
            disabled={loading}
          />
        </Field>
        <div className="form-grid form-grid--2">
          <Field label="Usuário" htmlFor="user-username" required hint="Usado para entrar no app.">
            <Input
              id="user-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              maxLength={40}
              disabled={loading}
            />
          </Field>
          <Field label="Perfil" htmlFor="user-role" required>
            <Select
              id="user-role"
              value={role}
              onChange={(event) => setRole(event.target.value)}
              disabled={loading || (isEdit && user.id === currentUser?.id)}
            >
              <option value="operador">Operador</option>
              <option value="admin">Administrador</option>
            </Select>
          </Field>
        </div>
        <Field label="E-mail" htmlFor="user-email" hint="Opcional, apenas para identificação.">
          <Input
            id="user-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={120}
            disabled={loading}
          />
        </Field>
        <Field label="Telefone" htmlFor="user-telefone" hint="Opcional para operador.">
          <Input
            id="user-telefone"
            type="tel"
            inputMode="tel"
            value={telefone}
            onChange={(event) => setTelefone(formatPhoneInput(event.target.value))}
            maxLength={16}
            disabled={loading}
          />
        </Field>
        <Field
          label={isEdit ? 'Nova senha (opcional)' : 'Senha inicial'}
          htmlFor="user-senha"
          hint={
            isEdit
              ? 'Preencha apenas se quiser redefinir. O usuário será obrigado a trocá-la no próximo login.'
              : 'Mínimo 8 caracteres, com letras e números. Troca obrigatória no primeiro acesso.'
          }
          required={!isEdit}
        >
          <div className="password-wrap">
            <input
              id="user-senha"
              className="input"
              type={showPassword ? 'text' : 'password'}
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              autoComplete="new-password"
              disabled={loading}
              placeholder={isEdit ? 'Manter senha atual' : 'Senha temporária'}
            />
            <button
              type="button"
              className="password-wrap__toggle"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              <Icon name={showPassword ? 'eyeOff' : 'eye'} size={20} />
            </button>
          </div>
        </Field>
        <Toggle
          checked={ativo}
          onChange={setAtivo}
          label="Usuário ativo"
          description="Usuários inativos não conseguem entrar no painel."
          disabled={loading || (isEdit && user.id === currentUser?.id)}
        />
        {isEdit && user.id === currentUser?.id && (
          <p className="muted small">Você não pode desativar ou remover o próprio acesso.</p>
        )}
      </form>
    </Modal>
  );
}

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [deactivating, setDeactivating] = useState(null);
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/users');
      setUsers(data.items || []);
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

  const reactivate = async (user) => {
    try {
      await api.patch(`/users/${user.id}`, { ativo: true });
      toast(`${user.nome} reativado.`, { type: 'success' });
      load();
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  };

  const handleDeactivate = async () => {
    setDeactivateLoading(true);
    try {
      await api.delete(`/users/${deactivating.id}`);
      toast(`${deactivating.nome} desativado.`, { type: 'success' });
      setDeactivating(null);
      load();
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setDeactivateLoading(false);
    }
  };

  return (
    <div className="container">
      <PageHeader
        title="Usuários"
        subtitle="Operadores usam o painel e o histórico. Administradores gerenciam tudo."
        eyebrow="Administração"
        actions={
          <Button icon="plus" onClick={() => setModal({ user: null })}>
            Novo usuário
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
      ) : users.length === 0 ? (
        <EmptyState icon="users" title="Nenhum usuário" text="Crie o primeiro operador da pista." />
      ) : (
        <div className="users-list">
          {users.map((user) => {
            const isSelf = user.id === currentUser?.id;
            return (
              <article key={user.id} className={`user-row ${user.ativo ? '' : 'is-inactive'}`}>
                <Avatar name={user.nome} size={46} tone={user.role === 'admin' ? 'brand' : 'neutral'} />
                <div className="user-row__main">
                  <div className="user-row__name">
                    <strong>{user.nome}</strong>
                    {isSelf && <Badge tone="brand">Você</Badge>}
                    <Badge tone={user.role === 'admin' ? 'brand' : 'blue'}>{roleLabel(user.role)}</Badge>
                    {!user.ativo && <Badge tone="gray">Inativo</Badge>}
                  </div>
                  <span className="user-row__username">@{user.username}</span>
                  <span className="user-row__meta">
                    {user.ultimoLoginEm
                      ? `Último acesso: ${formatDateTime(user.ultimoLoginEm)}`
                      : 'Ainda não acessou'}
                    {user.mustChangePassword ? ' · troca de senha pendente' : ''}
                    {user.email ? ` · ${user.email}` : ''}
                    {user.telefone ? ` · ${formatPhoneDisplay(user.telefone)}` : ''}
                  </span>
                </div>
                <div className="user-row__actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="edit"
                    onClick={() => setModal({ user })}
                  >
                    Editar
                  </Button>
                  {user.ativo ? (
                    <Button
                      size="sm"
                      variant="dangerGhost"
                      icon="logout"
                      disabled={isSelf}
                      onClick={() => setDeactivating(user)}
                    >
                      Desativar
                    </Button>
                  ) : (
                    <Button size="sm" variant="successGhost" icon="check" onClick={() => reactivate(user)}>
                      Ativar
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="admin-hint">
        <Icon name="lock" size={17} />
        <p>
          Senhas são guardadas com <strong>bcrypt</strong>. O primeiro acesso sempre exige a troca da
          senha inicial. Desativar um usuário encerra as sessões dele imediatamente.
        </p>
      </div>

      {modal && (
        <UserModal
          user={modal.user}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deactivating)}
        onClose={() => setDeactivating(null)}
        onConfirm={handleDeactivate}
        title={`Desativar ${deactivating?.nome || 'usuário'}?`}
        message="O usuário perde o acesso imediatamente. O histórico de sessões dele permanece intacto. Você pode reativar depois."
        confirmLabel="Desativar usuário"
        loading={deactivateLoading}
      />
    </div>
  );
}
