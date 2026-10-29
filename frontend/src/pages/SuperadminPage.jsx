import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Badge, Button, EmptyState, Field, IconButton, InlineError, InfoNote, Input, Modal, Spinner,
} from '../components/ui.jsx';
import { Icon, Logo } from '../components/Icons.jsx';
import { formatPhoneDisplay, formatPhoneInput, phoneIsValid } from '../lib/phone.js';
import { SuperadminSystemPage } from './SuperadminSystemPage.jsx';

const EMPTY_CREATE = { nome: '', adminNome: '', email: '', telefone: '', senha: '' };

export function SuperadminPage() {
  const { user, logout, startImpersonation } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isSystem = location.pathname.startsWith('/superadmin/sistema');
  const [tenants, setTenants] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [announcement, setAnnouncement] = useState({ mensagem: '', tipo: 'info', ativo: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_CREATE);
  const [modalForm, setModalForm] = useState({});
  const [modalError, setModalError] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [resetResult, setResetResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tenantData, metricsData, announcementData] = await Promise.all([
        api.get('/superadmin/tenants'),
        api.get('/superadmin/metrics'),
        api.get('/superadmin/announcement'),
      ]);
      setTenants(tenantData.items || []);
      setMetrics(metricsData);
      setAnnouncement(announcementData.item || { mensagem: '', tipo: 'info', ativo: false });
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (!isSystem) load(); }, [load, isSystem]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const openModal = (type, tenant = null) => {
    setModal({ type, tenant });
    setModalError('');
    if (type === 'transfer') setModalForm({ email: tenant?.adminsEmail?.split(',')[0]?.trim() || '' });
    else if (type === 'impersonate') setModalForm({ motivo: '' });
    else if (type === 'hardDelete') setModalForm({ confirmacao: '' });
    else if (type === 'announcement') setModalForm({ mensagem: announcement.mensagem, tipo: announcement.tipo, ativo: announcement.ativo });
  };

  const patchTenant = async (tenant, body, message) => {
    setBusyId(tenant.id);
    try {
      await api.patch(`/superadmin/tenants/${tenant.id}`, body);
      setSuccess(message);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const suspend = (tenant) => patchTenant(tenant, { ativo: false }, 'Negócio suspenso. Acessos bloqueados.');
  const reactivate = (tenant) => patchTenant(tenant, { ativo: true }, 'Negócio reativado. Usuários devem entrar novamente.');
  const softDelete = (tenant) => {
    if (!window.confirm(`Excluir "${tenant.nome}"? Os dados serão preservados para restauração.`)) return;
    patchTenant(tenant, { excluido: true }, 'Negócio excluído com soft delete.');
  };
  const restore = (tenant) => patchTenant(tenant, { excluido: false }, 'Negócio restaurado e reativado.');

  const resetPassword = async (tenant) => {
    setBusyId(tenant.id);
    try {
      const data = await api.post(`/superadmin/tenants/${tenant.id}/reset-admin`);
      setResetResult({ ...data, tenant });
      setSuccess('Senha temporária gerada.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const createTenant = async (event) => {
    event.preventDefault();
    setModalError('');
    if (form.nome.trim().length < 2) return setModalError('Informe o nome do negócio.');
    if (form.adminNome.trim().length < 2) return setModalError('Informe o nome do administrador.');
    if (!form.email.includes('@')) return setModalError('Informe um e-mail válido.');
    if (!phoneIsValid(form.telefone)) return setModalError('Informe o telefone no formato (DD) 9XXXX-XXXX.');
    if (form.senha.length < 8) return setModalError('A senha deve ter pelo menos 8 caracteres.');
    setModalLoading(true);
    try {
      await api.post('/superadmin/tenants', {
        nome: form.nome.trim(),
        adminNome: form.adminNome.trim(),
        email: form.email.trim(),
        telefone: form.telefone,
        senha: form.senha,
      });
      setSuccess(`Negócio ${form.nome.trim()} criado.`);
      setModal(null);
      setForm(EMPTY_CREATE);
      await load();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setModalLoading(false);
    }
  };

  const runModalAction = async (event) => {
    event?.preventDefault();
    if (!modal?.tenant) return;
    setModalError('');
    setModalLoading(true);
    try {
      if (modal.type === 'transfer') {
        await api.post(`/superadmin/tenants/${modal.tenant.id}/transfer-admin`, { email: modalForm.email });
        setSuccess('Admin transferido. Sessões antigas foram invalidadas.');
      } else if (modal.type === 'impersonate') {
        if (modalForm.motivo.trim().length < 5) throw new Error('Informe o motivo do suporte.');
        await startImpersonation(modal.tenant.id, modalForm.motivo.trim());
        navigate('/');
        return;
      } else if (modal.type === 'hardDelete') {
        if (modalForm.confirmacao.trim() !== modal.tenant.slug && modalForm.confirmacao.trim() !== modal.tenant.nome) {
          throw new Error('Digite exatamente o slug ou o nome do negócio.');
        }
        await api.delete(`/superadmin/tenants/${modal.tenant.id}`, { confirmacao: modalForm.confirmacao.trim() });
        setSuccess('Negócio excluído definitivamente.');
      } else if (modal.type === 'announcement') {
        await api.patch('/superadmin/announcement', modalForm);
        setSuccess('Comunicado global atualizado.');
      }
      setModal(null);
      await load();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setModalLoading(false);
    }
  };

  const saveAnnouncement = async (event) => {
    event.preventDefault();
    setModalLoading(true);
    setModalError('');
    try {
      await api.patch('/superadmin/announcement', modalForm);
      setSuccess('Comunicado global atualizado.');
      setModal(null);
      setAnnouncement({ ...modalForm, ativo: Boolean(modalForm.ativo) });
    } catch (err) {
      setModalError(err.message);
    } finally {
      setModalLoading(false);
    }
  };

  if (isSystem) {
    return <SuperadminSystemPage onBack={() => navigate('/superadmin')} />;
  }

  return (
    <div className="superadmin-page">
      <header className="superadmin-topbar">
        <div className="superadmin-topbar__brand">
          <Logo size={40} withWordmark />
          <Badge tone="amber">Superadmin</Badge>
        </div>
        <nav className="superadmin-tabs">
          <button type="button" className="is-active">Negócios</button>
          <button type="button" onClick={() => navigate('/superadmin/sistema')}>Sistema</button>
        </nav>
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
            <p>Gerencie tenants. Dados operacionais só são acessíveis durante uma impersonação auditada.</p>
          </div>
          <div className="section-head__actions">
            <Button icon="plus" onClick={() => { setForm(EMPTY_CREATE); setModalError(''); setModal({ type: 'create' }); }}>Novo negócio</Button>
            <Button icon="sound" variant="secondary" onClick={() => openModal('announcement')}>Comunicado global</Button>
            <Button icon="refresh" variant="secondary" onClick={load} loading={loading}>Atualizar</Button>
          </div>
        </div>

        <div className="superadmin-metrics">
          <div><span>Tenants ativos</span><strong>{metrics?.tenantsAtivos ?? '—'}</strong></div>
          <div><span>Carrinhos</span><strong>{metrics?.carrinhos ?? '—'}</strong></div>
          <div><span>Sessões hoje</span><strong>{metrics?.sessoesHoje ?? '—'}</strong></div>
        </div>

        {announcement.ativo && announcement.mensagem && (
          <InfoNote tone={announcement.tipo === 'warning' ? 'warning' : announcement.tipo === 'success' ? 'success' : 'info'} icon="info">
            <strong>Comunicado global:</strong> {announcement.mensagem}
          </InfoNote>
        )}
        {error && <InfoNote tone="warning" icon="alert">{error}</InfoNote>}
        {success && <InfoNote tone="success" icon="check">{success}</InfoNote>}

        {loading ? <div className="center-pad"><Spinner size={28} /></div> : tenants.length === 0 ? (
          <EmptyState icon="users" title="Nenhum negócio cadastrado" text="Crie o primeiro negócio." />
        ) : (
          <div className="tenant-grid">
            {tenants.map((tenant) => (
              <article key={tenant.id} className={`tenant-card ${tenant.excluido ? 'is-deleted' : tenant.ativo ? '' : 'is-inactive'}`}>
                <div className="tenant-card__head">
                  <div>
                    <h2>{tenant.nome}</h2>
                    <span className="tenant-card__slug">{tenant.slug}</span>
                  </div>
                  <Badge tone={tenant.excluido ? 'red' : tenant.ativo ? 'green' : 'gray'}>
                    {tenant.excluido ? 'Excluído' : tenant.ativo ? 'Ativo' : 'Suspenso'}
                  </Badge>
                </div>
                <div className="tenant-card__stats">
                  <span><strong>{tenant.usuarios}</strong> usuários ativos</span>
                </div>
                <p className="muted small">
                  Admin: {tenant.adminsEmail || 'sem e-mail'} · {(tenant.adminsTelefone || '').split(',').map((phone) => formatPhoneDisplay(phone.trim())).filter(Boolean).join(', ') || 'sem telefone'}
                </p>
                <div className="tenant-actions">
                  {!tenant.excluido && (tenant.ativo ? (
                    <Button size="sm" variant="dangerGhost" loading={busyId === tenant.id} onClick={() => suspend(tenant)}>Suspender</Button>
                  ) : (
                    <Button size="sm" variant="successGhost" loading={busyId === tenant.id} onClick={() => reactivate(tenant)}>Reativar</Button>
                  ))}
                  {tenant.excluido ? (
                    <Button size="sm" variant="secondary" loading={busyId === tenant.id} onClick={() => restore(tenant)}>Restaurar</Button>
                  ) : (
                    <Button size="sm" variant="ghost" loading={busyId === tenant.id} onClick={() => softDelete(tenant)}>Excluir</Button>
                  )}
                  {!tenant.excluido && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => openModal('transfer', tenant)}>Transferir admin</Button>
                      <Button size="sm" variant="secondary" loading={busyId === tenant.id} onClick={() => resetPassword(tenant)}>Resetar senha</Button>
                      <Button size="sm" variant="secondary" icon="play" onClick={() => openModal('impersonate', tenant)}>Entrar como admin</Button>
                    </>
                  )}
                  <Button size="sm" variant="dangerGhost" onClick={() => openModal('hardDelete', tenant)}>
                    Excluir definitivo
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <Modal
        open={modal?.type === 'create'}
        onClose={() => setModal(null)}
        title="Novo negócio"
        subtitle="Tenant + admin inicial + categorias e planos padrão."
        icon="users"
        dismissible={!modalLoading}
        footer={<Button type="submit" form="superadmin-create-tenant" size="lg" icon="check" loading={modalLoading} block>Criar negócio</Button>}
      >
        <form id="superadmin-create-tenant" className="stack" onSubmit={createTenant}>
          <InlineError>{modalError}</InlineError>
          <Field label="Nome do negócio" htmlFor="super-nome" required><Input id="super-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} maxLength={80} /></Field>
          <Field label="Nome do administrador" htmlFor="super-admin" required><Input id="super-admin" value={form.adminNome} onChange={(e) => setForm({ ...form, adminNome: e.target.value })} maxLength={80} /></Field>
          <Field label="E-mail do admin" htmlFor="super-email" required><Input id="super-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={120} autoCapitalize="none" /></Field>
          <Field label="Telefone do admin" htmlFor="super-telefone" required hint="Formato (DD) 9XXXX-XXXX."><Input id="super-telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: formatPhoneInput(e.target.value) })} maxLength={16} inputMode="tel" /></Field>
          <Field label="Senha inicial" htmlFor="super-senha" required><Input id="super-senha" type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} maxLength={72} autoComplete="new-password" /></Field>
        </form>
      </Modal>

      <Modal
        open={modal?.type === 'transfer' || modal?.type === 'impersonate' || modal?.type === 'hardDelete' || modal?.type === 'announcement'}
        onClose={() => setModal(null)}
        title={
          modal?.type === 'transfer' ? `Transferir admin · ${modal.tenant?.nome}`
            : modal?.type === 'impersonate' ? `Suporte · ${modal.tenant?.nome}`
              : modal?.type === 'hardDelete' ? `Excluir definitivamente · ${modal.tenant?.nome}`
                : 'Comunicado global'
        }
        subtitle={
          modal?.type === 'hardDelete' ? 'Esta ação apaga todos os dados do tenant e não pode ser desfeita.'
            : modal?.type === 'impersonate' ? 'O acesso será registrado na auditoria com início e fim.'
              : undefined
        }
        icon={modal?.type === 'hardDelete' ? 'alert' : modal?.type === 'impersonate' ? 'lock' : 'users'}
        dismissible={!modalLoading}
        footer={
          modal?.type === 'announcement' ? undefined : (
            <Button
              variant={modal?.type === 'hardDelete' ? 'danger' : 'primary'}
              size="lg"
              loading={modalLoading}
              onClick={runModalAction}
              block
            >
              {modal?.type === 'transfer' ? 'Transferir admin' : modal?.type === 'impersonate' ? 'Entrar no modo suporte' : 'Excluir definitivamente'}
            </Button>
          )
        }
      >
        <div className="stack">
          <InlineError>{modalError}</InlineError>
          {modal?.type === 'transfer' && (
            <Field label="E-mail do usuário que será o novo admin" htmlFor="transfer-email" required hint="O usuário precisa existir neste tenant.">
              <Input id="transfer-email" type="email" value={modalForm.email || ''} onChange={(e) => setModalForm({ ...modalForm, email: e.target.value })} />
            </Field>
          )}
          {modal?.type === 'impersonate' && (
            <Field label="Motivo do suporte" htmlFor="impersonation-reason" required hint="Ex.: cliente relatou erro ao encerrar aluguel.">
              <Input id="impersonation-reason" value={modalForm.motivo || ''} onChange={(e) => setModalForm({ ...modalForm, motivo: e.target.value })} maxLength={300} />
            </Field>
          )}
          {modal?.type === 'hardDelete' && (
            <Field label={`Digite "${modal.tenant?.slug}" para confirmar`} htmlFor="hard-confirm" required hint="Segunda confirmação obrigatória.">
              <Input id="hard-confirm" value={modalForm.confirmacao || ''} onChange={(e) => setModalForm({ ...modalForm, confirmacao: e.target.value })} autoCapitalize="none" />
            </Field>
          )}
          {modal?.type === 'announcement' && (
            <form className="stack" onSubmit={saveAnnouncement}>
              <Field label="Mensagem" htmlFor="announcement-message" hint="Deixe vazio/desative para remover o banner.">
                <Input id="announcement-message" value={modalForm.mensagem || ''} onChange={(e) => setModalForm({ ...modalForm, mensagem: e.target.value })} maxLength={300} />
              </Field>
              <Field label="Tipo" htmlFor="announcement-type">
                <select id="announcement-type" className="input" value={modalForm.tipo || 'info'} onChange={(e) => setModalForm({ ...modalForm, tipo: e.target.value })}>
                  <option value="info">Informação</option>
                  <option value="success">Sucesso</option>
                  <option value="warning">Atenção</option>
                </select>
              </Field>
              <label className="switch-row">
                <span><strong>Exibir banner</strong><small>Aparece no dashboard de todos os tenants.</small></span>
                <input type="checkbox" checked={Boolean(modalForm.ativo)} onChange={(e) => setModalForm({ ...modalForm, ativo: e.target.checked })} />
              </label>
              <Button type="submit" loading={modalLoading} icon="check" block>Salvar comunicado</Button>
            </form>
          )}
        </div>
      </Modal>

      <Modal open={Boolean(resetResult)} onClose={() => setResetResult(null)} title="Senha temporária gerada" icon="key" size="sm">
        {resetResult && (
          <div className="stack">
            <InfoNote tone="warning" icon="alert">
              Mostre esta senha ao admin. Ela não será exibida novamente e exige troca no primeiro login.
            </InfoNote>
            <div className="temp-password">
              <strong>{resetResult.senhaTemporaria}</strong>
              <span>{resetResult.admin?.email || resetResult.admin?.nome}</span>
            </div>
            <Button onClick={() => { navigator.clipboard?.writeText(resetResult.senhaTemporaria); }} icon="key" block>Copiar senha</Button>
            <Button variant="secondary" onClick={() => setResetResult(null)} block>Fechar</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
