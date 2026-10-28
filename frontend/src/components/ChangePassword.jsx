import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Button, Field, InlineError, Input } from './ui.jsx';
import { Icon, Logo } from './Icons.jsx';

function PasswordField({ id, label, value, onChange, autoComplete = 'new-password', hint, error }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <div className="password-wrap">
        <input
          id={id}
          className="input"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required
          minLength={8}
        />
        <button
          type="button"
          className="password-wrap__toggle"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} size={20} />
        </button>
      </div>
    </Field>
  );
}

export function ChangePasswordForm({ onDone, onCancel, forced = false }) {
  const { changePassword, logout } = useAuth();
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (next.length < 8) return setError('A nova senha deve ter pelo menos 8 caracteres.');
    if (!/[a-zA-Z]/.test(next) || !/[0-9]/.test(next)) {
      return setError('Use pelo menos uma letra e um número.');
    }
    if (next !== confirm) return setError('A confirmação não confere com a nova senha.');
    if (next === current) return setError('A nova senha deve ser diferente da atual.');
    setLoading(true);
    try {
      await changePassword(current, next);
      toast('Senha alterada com sucesso.', { type: 'success' });
      onDone?.();
    } catch (err) {
      setError(err.message || 'Não foi possível alterar a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="password-form" onSubmit={submit}>
      <InlineError>{error}</InlineError>
      <PasswordField
        id="senha-atual"
        label="Senha atual"
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
      />
      <PasswordField
        id="senha-nova"
        label="Nova senha"
        value={next}
        onChange={setNext}
        hint="Mínimo de 8 caracteres, com pelo menos uma letra e um número."
      />
      <PasswordField
        id="senha-confirmar"
        label="Confirmar nova senha"
        value={confirm}
        onChange={setConfirm}
      />
      <div className="password-form__actions">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
        )}
        <Button type="submit" variant="primary" loading={loading} block={!onCancel}>
          Salvar nova senha
        </Button>
      </div>
      {forced && (
        <button type="button" className="link-button password-form__logout" onClick={logout}>
          <Icon name="logout" size={17} />
          Sair e entrar com outro usuário
        </button>
      )}
    </form>
  );
}

export function ForcedPasswordChange() {
  const { user } = useAuth();
  return (
    <div className="force-password">
      <div className="force-password__card">
        <div className="force-password__brand">
          <Logo size={52} />
          <div>
            <span className="force-password__eyebrow">Primeiro acesso</span>
            <h1>Crie sua senha</h1>
          </div>
        </div>
        <p className="force-password__intro">
          Olá, <strong>{user?.nome}</strong>. A senha inicial precisa ser trocada antes de usar o
          sistema. Escolha uma senha só sua.
        </p>
        <ChangePasswordForm forced />
      </div>
    </div>
  );
}
