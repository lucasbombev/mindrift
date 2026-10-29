import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Button, EmptyState, Field, IconButton, InlineError, InfoNote, Input, Modal, Spinner } from '../components/ui.jsx';
import { Icon, Logo } from '../components/Icons.jsx';

export function SuperadminPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ nome: '', adminNome: '', email: '', senha: '' });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/superadmin/tenants');
      setTenants(data.items || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (tenant) => {
    const next = !tenant.ativo;
    if (!next && !window.confirm(`Desativar o negócio "${tenant.nome}"? Os acessos serão bloqueados imediatamente.`)) return;
    setBusyId(tenant.id);
    try {
      await api.patch(`/superadmin/tenants/${tenant.id}`, { ativo: next });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const createTenant = async (event) => {
    event.preventDefault();
    setCreateError('');
    if (form.nome.trim().length < 2) return setCreateError('Informe o nome do negócio.');
    if (form.adminNome.trim().length < 2) return setCreateError('Informe o nome do administrador.');
    if (!form.email.includes('@')) return setCreateError('Informe um e-mail válido.');
    if (form.senha.length < 8) return setCreateError('A senha deve ter pelo menos 8 caracteres.');
    setCreateLoading(true);
    try {
      await api.post('/superadmin/tenants', {
        nome: form.nome.trim(),
        adminNome: form.adminNome.trim(),
        email: form.email.trim(),
        senha: form.senha,
      });
      setSuccess(`Negócio ${form.nome.trim()} criado com admin ${form.email.trim()}.`);
      setCreateOpen(false);
      setForm({ nome: '', adminNome: '', email: '', senha: '' });
      await load();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="superadmin-page">
      <header className="superadmin-topbar">
        <div className="superadmin-topbar__brand">
          <Logo size={40} withWordmark />
          <Badge tone="amber">Superadmin</Badge>
        </div>
        <div className="superadmin-topbar__right">
          <span className="muted small">{user?.nome}</span>
          <IconButton icon="refresh" label="Atualizar negócios" onClick={load} />
          <IconButton icon="logout" label="Sair" onClick={handleLogout} />
        </div>
      </header>

      <main className="container">
        <div className="section-head section-head--stack">
          <div>
            <span className="eyebrow">Gestão da plataforma</span>
            <h1>Negócios</h1>
            <p>Gerencie a ativação dos tenants. Você não acessa frotas, sessões ou caixa.</p>
          </div>
          <div className="section-head__actions">
            <Button icon="plus" onClick={() => { setCreateError(''); setCreateOpen(true); }}>
              Novo negócio
            </Button>
            <Button icon="refresh" variant="secondary" onClick={load} loading={loading}>
              Atualizar
            </Button>
          </div>
        </div>

        <InfoNote icon="lock">
          Como superadmin, seu acesso é restrito a esta área. Dados operacionais de cada negócio
          ficam isolados e não aparecem aqui.
        </InfoNote>

        {error && <InfoNote tone="warning" icon="alert">{error}</InfoNote>}
        {success && <InfoNote tone="success" icon="check">{success}</InfoNote>}

        {loading ? (
          <div className="center-pad"><Spinner size={28} /></div>
        ) : tenants.length === 0 ? (
          <EmptyState icon="users" title="Nenhum negócio cadastrado" text="Os cadastros públicos aparecerão aqui." />
        ) : (
          <div className="tenant-grid">
            {tenants.map((tenant) => (
              <article key={tenant.id} className={`tenant-card ${tenant.ativo ? '' : 'is-inactive'}`}>
                <div className="tenant-card__head">
                  <div>
                    <h2>{tenant.nome}</h2>
                    <span className="tenant-card__slug">{tenant.slug}</span>
                  </div>
                  <Badge tone={tenant.ativo ? 'green' : 'gray'}>
                    {tenant.ativo ? 'Ativo' : 'Desativado'}
                  </Badge>
                </div>
                <div className="tenant-card__stats">
                  <span><strong>{tenant.usuarios}</strong> usuários ativos</span>
                </div>
                <p className="muted small">
                  Admin: {tenant.adminsEmail || 'sem e-mail cadastrado'} · criado em{' '}
                  {new Date(tenant.criadoEm).toLocaleDateString('pt-BR')}
                </p>
                <div className="tenant-card__actions">
                  <Button
                    size="sm"
                    variant={tenant.ativo ? 'dangerGhost' : 'successGhost'}
                    loading={busyId === tenant.id}
                    onClick={() => toggle(tenant)}
                  >
                    {tenant.ativo ? 'Desativar negócio' : 'Reativar negócio'}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Novo negócio"
        subtitle="Cria o tenant, o admin inicial, categorias e planos padrão."
        icon="users"
        dismissible={!createLoading}
        footer={
          <Button type="submit" form="superadmin-create-tenant" size="lg" icon="check" loading={createLoading} block>
            Criar negócio
          </Button>
        }
      >
        <form id="superadmin-create-tenant" className="stack" onSubmit={createTenant}>
          <InlineError>{createError}</InlineError>
          <Field label="Nome do negócio" htmlFor="super-nome" required>
            <Input id="super-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} maxLength={80} disabled={createLoading} />
          </Field>
          <Field label="Nome do administrador" htmlFor="super-admin" required>
            <Input id="super-admin" value={form.adminNome} onChange={(e) => setForm({ ...form, adminNome: e.target.value })} maxLength={80} disabled={createLoading} />
          </Field>
          <Field label="E-mail do admin" htmlFor="super-email" required>
            <Input id="super-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={120} autoCapitalize="none" disabled={createLoading} />
          </Field>
          <Field label="Senha inicial do admin" htmlFor="super-senha" required hint="Mínimo 8 caracteres; o admin poderá trocar depois.">
            <Input id="super-senha" type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} maxLength={72} autoComplete="new-password" disabled={createLoading} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
