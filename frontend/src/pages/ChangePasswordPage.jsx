import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { formatPhoneDisplay } from '../lib/phone.js';
import { ChangePasswordForm } from '../components/ChangePassword.jsx';
import { Button, PageHeader } from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  return (
    <div className="container container--narrow">
      <PageHeader
        title="Alterar senha"
        subtitle="Use uma senha só sua, com pelo menos 8 caracteres, letras e números."
        eyebrow="Conta"
        actions={
          <Button variant="ghost" icon="arrowLeft" onClick={() => navigate(-1)}>
            Voltar
          </Button>
        }
      />
      <div className="card profile-card">
        <div>
          <span className="eyebrow">Perfil</span>
          <strong>{user?.nome}</strong>
          <span>{user?.email || user?.username}</span>
        </div>
        <div>
          <span className="eyebrow">Telefone</span>
          <strong>{formatPhoneDisplay(user?.telefone)}</strong>
        </div>
      </div>

      <div className="card password-card">
        <div className="password-card__head">
          <span className="password-card__icon">
            <Icon name="key" size={22} />
          </span>
          <div>
            <h2>Segurança da conta</h2>
            <p>Ao trocar a senha, outras sessões abertas em outros aparelhos serão encerradas.</p>
          </div>
        </div>
        <ChangePasswordForm onDone={() => navigate('/')} onCancel={() => navigate(-1)} />
      </div>
    </div>
  );
}
