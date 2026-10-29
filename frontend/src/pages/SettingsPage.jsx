import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useSoundPrefs } from '../context/SoundContext.jsx';
import { SOUND_OPTIONS } from '../lib/audio.js';
import { notificationPermission, requestNotifications } from '../lib/pwa.js';
import { InstallAppButton, InstallInstructionsModal } from '../components/InstallApp.jsx';
import { Badge, Button, Field, InlineError, Input, PageHeader, Spinner, Toggle } from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';

export function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { test, refresh: refreshSound } = useSoundPrefs();
  const [settings, setSettings] = useState(null);
  const [systemOk, setSystemOk] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nome, setNome] = useState('');
  const [lead, setLead] = useState(60);
  const [somFim, setSomFim] = useState('alarme');
  const [somRepetir, setSomRepetir] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [installOpen, setInstallOpen] = useState(false);
  const [soundTesting, setSoundTesting] = useState(false);
  const [permission, setPermission] = useState(notificationPermission());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsData, health] = await Promise.all([
        api.get('/settings'),
        fetch('/api/health').then((res) => res.ok).catch(() => false),
      ]);
      setSettings(settingsData.settings);
      setNome(settingsData.settings.nome_estabelecimento || 'Drift Rent');
      setLead(Number(settingsData.settings.alert_lead_seconds) === 30 ? 30 : Number(settingsData.settings.alert_lead_seconds) === 0 ? 0 : 60);
      setSomFim(settingsData.settings.som_fim || 'alarme');
      setSomRepetir(settingsData.settings.som_repetir !== '0');
      setSystemOk(health);
      setError('');
    } catch (err) {
      setError(err.message);
      setSystemOk(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (event) => {
    event.preventDefault();
    setSaveError('');
    if (!nome.trim()) return setSaveError('Informe o nome do estabelecimento.');
    setSaving(true);
    try {
      const data = await api.patch('/settings', {
        nome_estabelecimento: nome.trim(),
        alert_lead_seconds: Number(lead),
        som_fim: somFim,
        som_repetir: somRepetir,
      });
      setSettings(data.settings);
      await refreshSound();
      toast('Configurações salvas.', { type: 'success' });
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const testSound = async () => {
    setSoundTesting(true);
    const ok = await test(somFim, 80);
    toast(ok ? 'Som de fim reproduzido.' : 'Toque na tela para liberar o áudio e tente novamente.', {
      type: ok ? 'success' : 'warning',
    });
    setTimeout(() => setSoundTesting(false), 1000);
  };

  const askNotifications = async () => {
    const result = await requestNotifications();
    setPermission(result);
    if (result === 'granted') toast('Notificações ativadas.', { type: 'success' });
    else if (result === 'denied') toast('Notificações bloqueadas pelo navegador.', { type: 'warning' });
    else if (result === 'unsupported') toast('Este navegador não suporta notificações.', { type: 'info' });
  };

  if (loading) {
    return (
      <div className="container">
        <PageHeader title="Ajustes" eyebrow="Administração" />
        <div className="center-pad"><Spinner size={28} /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <PageHeader title="Ajustes" eyebrow="Administração" />
        <div className="error-panel error-panel--inline">
          <p>{error}</p>
          <Button size="sm" icon="refresh" onClick={load}>Tentar novamente</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <PageHeader
        title="Ajustes"
        subtitle={`${user?.tenantName || 'Seu negócio'} · operação, alertas e preferências.`}
        eyebrow="Administração"
      />

      <div className={`system-status-card ${systemOk === false ? 'is-offline' : 'is-online'}`}>
        <span className="system-status-card__dot" />
        <div>
          <strong>Sistema operacional</strong>
          <span>{systemOk === false ? 'Sem conexão com o servidor agora.' : 'Servidor respondendo normalmente.'}</span>
        </div>
        <Badge tone={systemOk === false ? 'red' : 'green'}>{systemOk === false ? 'Offline' : 'Online'}</Badge>
      </div>

      <div className="settings-grid">
        <section className="settings-card">
          <header className="settings-card__head">
            <span className="settings-card__icon"><Icon name="settings" size={20} /></span>
            <div>
              <h2>Estabelecimento e alertas</h2>
              <p>Nome exibido no painel, pré-alerta e som padrão do negócio.</p>
            </div>
          </header>
          <form onSubmit={save} className="stack">
            <InlineError>{saveError}</InlineError>
            <Field label="Nome do estabelecimento" htmlFor="settings-nome" required>
              <Input id="settings-nome" value={nome} onChange={(event) => setNome(event.target.value)} maxLength={60} disabled={saving} />
            </Field>
            <Field label="Pré-alerta antes do fim" htmlFor="settings-lead" hint="O alarme final sempre toca; o pré-alerta é opcional.">
              <select id="settings-lead" className="input" value={lead} onChange={(event) => setLead(Number(event.target.value))} disabled={saving}>
                <option value={60}>60 segundos antes</option>
                <option value={30}>30 segundos antes</option>
                <option value={0}>Desligado</option>
              </select>
            </Field>
            <Field label="Som de fim do tempo" htmlFor="settings-som" hint="Usado por quem não escolheu um som próprio.">
              <select id="settings-som" className="input" value={somFim} onChange={(event) => setSomFim(event.target.value)} disabled={saving}>
                {SOUND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Toggle
              checked={somRepetir}
              onChange={setSomRepetir}
              label="Repetir até dispensar"
              description="O alarme final repete até alguém confirmar o alerta."
              disabled={saving}
            />
            <div className="settings-actions">
              <Button type="button" variant="secondary" icon="sound" onClick={testSound} loading={soundTesting}>Testar som</Button>
              <Button type="submit" icon="check" loading={saving}>Salvar configurações</Button>
            </div>
          </form>
        </section>

        <section className="settings-card">
          <header className="settings-card__head">
            <span className="settings-card__icon"><Icon name="sound" size={20} /></span>
            <div>
              <h2>Alertas no dispositivo</h2>
              <p>Permissões e instalação do app.</p>
            </div>
          </header>
          <div className="settings-rows">
            <div className="settings-row">
              <div>
                <strong>Notificações do navegador</strong>
                <span>Exibe um aviso quando o tempo termina com a aba em segundo plano.</span>
              </div>
              <Badge tone={permission === 'granted' ? 'green' : permission === 'denied' ? 'red' : 'amber'}>
                {permission === 'granted' ? 'Ativadas' : permission === 'denied' ? 'Bloqueadas' : permission === 'unsupported' ? 'Sem suporte' : 'Não configuradas'}
              </Badge>
            </div>
            <div className="settings-row settings-row--actions">
              <Button size="sm" variant="secondary" icon="sound" onClick={askNotifications} disabled={permission === 'granted'}>
                {permission === 'granted' ? 'Notificações ativas' : 'Ativar notificações'}
              </Button>
              <Button size="sm" variant="ghost" icon="info" onClick={() => setInstallOpen(true)}>Como instalar</Button>
              <InstallAppButton variant="secondary" label="Instalar app" />
            </div>
            <p className="muted small">
              Volume, vibrar e escolha do som são preferências por usuário em <strong>Mais → Som e vibração</strong>.
            </p>
          </div>
        </section>
      </div>

      <div className="admin-hint">
        <Icon name="lock" size={17} />
        <p>Detalhes de infraestrutura, logs e backups ficam no menu Sistema do superadmin.</p>
      </div>

      <InstallInstructionsModal open={installOpen} onClose={() => setInstallOpen(false)} />
    </div>
  );
}
