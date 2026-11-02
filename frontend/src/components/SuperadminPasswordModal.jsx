import { useEffect, useState } from 'react';
import { api, setAccessToken } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Button, Field, InlineError, Input, Modal } from './ui.jsx';

export function SuperadminPasswordModal({ open, onClose }) {
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSenhaAtual('');
    setNovaSenha('');
    setConfirmar('');
    setError('');
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (novaSenha.length < 6) return setError('A nova senha deve ter pelo menos 6 caracteres.');
    if (novaSenha !== confirmar) return setError('A confirmação não confere com a nova senha.');
    if (novaSenha === senhaAtual) return setError('A nova senha deve ser diferente da atual.');
    setLoading(true);
    try {
      const data = await api.put('/superadmin/password', {
        senha_atual: senhaAtual,
        nova_senha: novaSenha,
      });
      setAccessToken(data.accessToken);
      await refreshUser();
      toast('Senha do superadmin alterada com sucesso.', { type: 'success' });
      onClose?.();
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
      title="Alterar senha do superadmin"
      subtitle="Sua sessão atual será renovada após a troca."
      icon="key"
      dismissible={!loading}
      footer={
        <Button type="submit" form="superadmin-password-form" size="lg" icon="check" loading={loading} block>
          Salvar nova senha
        </Button>
      }
    >
      <form id="superadmin-password-form" className="stack" onSubmit={submit}>
        <InlineError>{error}</InlineError>
        <Field label="Senha atual" htmlFor="superadmin-current" required>
          <Input
            id="superadmin-current"
            type="password"
            value={senhaAtual}
            onChange={(event) => setSenhaAtual(event.target.value)}
            autoComplete="current-password"
            maxLength={200}
            disabled={loading}
          />
        </Field>
        <Field label="Nova senha" htmlFor="superadmin-new" required hint="Mínimo de 6 caracteres.">
          <Input
            id="superadmin-new"
            type="password"
            value={novaSenha}
            onChange={(event) => setNovaSenha(event.target.value)}
            autoComplete="new-password"
            maxLength={72}
            disabled={loading}
          />
        </Field>
        <Field label="Confirmar nova senha" htmlFor="superadmin-confirm" required>
          <Input
            id="superadmin-confirm"
            type="password"
            value={confirmar}
            onChange={(event) => setConfirmar(event.target.value)}
            autoComplete="new-password"
            maxLength={72}
            disabled={loading}
          />
        </Field>
      </form>
    </Modal>
  );
}
