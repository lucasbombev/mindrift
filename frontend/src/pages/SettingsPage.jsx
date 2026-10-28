import { useCallback, useEffect, useState } from 'react';
import { api, downloadAuthenticated } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { primeAudio, playEndAlarm } from '../lib/audio.js';
import {
  notificationPermission,
  requestNotifications,
  secureContextInfo,
} from '../lib/pwa.js';
import { formatDateTime } from '../lib/format.js';
import { InstallAppButton, InstallInstructionsModal } from '../components/InstallApp.jsx';
import {
  Badge,
  Button,
  Field,
  InlineError,
  Input,
  PageHeader,
  Spinner,
  Toggle,
} from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';

function bytes(size) {
  if (!size) return '0 KB';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function uptime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const input = document.createElement('textarea');
      input.value = text;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
      return true;
    } catch {
      return false;
    }
  }
}

export function SettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState(null);
  const [system, setSystem] = useState(null);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nome, setNome] = useState('');
  const [lead, setLead] = useState('60');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [backupLoading, setBackupLoading] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [soundTesting, setSoundTesting] = useState(false);
  const [permission, setPermission] = useState(notificationPermission());
  const secure = secureContextInfo();
  const httpsUrls = system?.httpsAtivo
    ? (system.urls || []).map((url) =>
        url.replace(/^http:\/\/([^/:]+):\d+$/, `https://$1:${system.httpsPort}`),
      )
    : [];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsData, systemData, backupsData] = await Promise.all([
        api.get('/settings'),
        api.get('/settings/system'),
        api.get('/settings/backups'),
      ]);
      setSettings(settingsData.settings);
      setNome(settingsData.settings.nome_estabelecimento || 'Drift Rent');
      setLead(settingsData.settings.alert_lead_seconds || '60');
      setSystem(systemData);
      setBackups(backupsData.items || []);
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

  const save = async (event) => {
    event.preventDefault();
    setSaveError('');
    const leadNumber = Number(lead);
    if (!Number.isInteger(leadNumber) || leadNumber < 0 || leadNumber > 600) {
      setSaveError('O aviso deve estar entre 0 e 600 segundos.');
      return;
    }
    if (!nome.trim()) return setSaveError('Informe o nome do estabelecimento.');
    setSaving(true);
    try {
      const data = await api.patch('/settings', {
        nome_estabelecimento: nome.trim(),
        alert_lead_seconds: leadNumber,
      });
      setSettings(data.settings);
      toast('Configurações salvas.', { type: 'success' });
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const testSound = async () => {
    setSoundTesting(true);
    const ok = await primeAudio();
    if (ok) {
      setTimeout(() => playEndAlarm(), 120);
      toast('Som de alerta reproduzido.', { type: 'success' });
    } else {
      toast('O navegador bloqueou o áudio. Toque novamente.', { type: 'warning' });
    }
    setTimeout(() => setSoundTesting(false), 1200);
  };

  const askNotifications = async () => {
    const result = await requestNotifications();
    setPermission(result);
    if (result === 'granted') toast('Notificações ativadas.', { type: 'success' });
    else if (result === 'denied') toast('Notificações bloqueadas pelo navegador.', { type: 'warning' });
    else if (result === 'unsupported') toast('Este navegador não suporta notificações.', { type: 'info' });
  };

  const createBackup = async () => {
    setBackupLoading(true);
    try {
      const data = await api.post('/settings/backups');
      toast(`Backup criado: ${data.backup.filename}`, { type: 'success', title: 'Backup concluído' });
      const backupsData = await api.get('/settings/backups');
      setBackups(backupsData.items || []);
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setBackupLoading(false);
    }
  };

  const downloadBackup = async (filename) => {
    try {
      await downloadAuthenticated(`/settings/backups/${encodeURIComponent(filename)}/download`, filename);
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  };

  const copyUrl = async (url) => {
    const ok = await copyText(url);
    toast(ok ? 'Endereço copiado.' : url, { type: ok ? 'success' : 'info' });
  };

  if (loading) {
    return (
      <div className="container">
        <PageHeader title="Ajustes" eyebrow="Administração" />
        <div className="center-pad">
          <Spinner size={28} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <PageHeader title="Ajustes" eyebrow="Administração" />
        <div className="error-panel error-panel--inline">
          <p>{error}</p>
          <Button size="sm" icon="refresh" onClick={load}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <PageHeader
        title="Ajustes"
        subtitle="Alertas, rede local, backups e informações do servidor."
        eyebrow="Administração"
      />

      <div className="settings-grid">
        <section className="settings-card">
          <header className="settings-card__head">
            <span className="settings-card__icon"><Icon name="settings" size={20} /></span>
            <div>
              <h2>Estabelecimento e alertas</h2>
              <p>Nome exibido no painel e antecedência do aviso sonoro.</p>
            </div>
          </header>
          <form onSubmit={save} className="stack">
            <InlineError>{saveError}</InlineError>
            <Field label="Nome do estabelecimento" htmlFor="settings-nome" required>
              <Input
                id="settings-nome"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                maxLength={60}
                disabled={saving}
              />
            </Field>
            <Field
              label="Avisar quantos segundos antes do fim"
              htmlFor="settings-lead"
              hint="0 desativa o aviso antecipado; o alarme final sempre toca. Padrão: 60."
            >
              <Input
                id="settings-lead"
                type="number"
                min="0"
                max="600"
                step="1"
                inputMode="numeric"
                value={lead}
                onChange={(event) => setLead(event.target.value)}
                disabled={saving}
              />
            </Field>
            <div className="settings-actions">
              <Button type="button" variant="secondary" icon="sound" onClick={testSound} loading={soundTesting}>
                Testar som
              </Button>
              <Button type="submit" icon="check" loading={saving}>
                Salvar configurações
              </Button>
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
              <Badge
                tone={permission === 'granted' ? 'green' : permission === 'denied' ? 'red' : 'amber'}
              >
                {permission === 'granted'
                  ? 'Ativadas'
                  : permission === 'denied'
                    ? 'Bloqueadas'
                    : permission === 'unsupported'
                      ? 'Sem suporte'
                      : 'Não configuradas'}
              </Badge>
            </div>
            <div className="settings-row settings-row--actions">
              <Button size="sm" variant="secondary" icon="sound" onClick={askNotifications} disabled={permission === 'granted'}>
                {permission === 'granted' ? 'Notificações ativas' : 'Ativar notificações'}
              </Button>
              <Button size="sm" variant="ghost" icon="info" onClick={() => setInstallOpen(true)}>
                Como instalar
              </Button>
            </div>
            <div className="settings-row settings-row--column">
              <div>
                <strong>Contexto seguro (PWA)</strong>
                <span>
                  {secure.secure
                    ? 'Este endereço permite instalar o app completo e usar o service worker.'
                    : 'Este endereço está em HTTP. Para PWA completo no celular, use HTTPS com o certificado local.'}
                </span>
              </div>
              <div className="settings-row__actions">
                <Badge tone={secure.secure ? 'green' : 'amber'}>
                  {secure.secure ? 'HTTPS / localhost' : 'HTTP'}
                </Badge>
                <InstallAppButton variant="secondary" label="Instalar app" />
              </div>
            </div>
          </div>
        </section>

        <section className="settings-card">
          <header className="settings-card__head">
            <span className="settings-card__icon"><Icon name="download" size={20} /></span>
            <div>
              <h2>Backups do banco</h2>
              <p>Cópia diária automática e backups manuais.</p>
            </div>
            <Button size="sm" icon="plus" onClick={createBackup} loading={backupLoading}>
              Criar agora
            </Button>
          </header>
          <div className="backup-list">
            {backups.length === 0 ? (
              <p className="muted">Nenhum backup criado ainda.</p>
            ) : (
              backups.slice(0, 8).map((backup) => (
                <div key={backup.filename} className="backup-row">
                  <span className="backup-row__icon"><Icon name="download" size={17} /></span>
                  <div className="backup-row__info">
                    <strong>{backup.filename}</strong>
                    <span>
                      {bytes(backup.sizeBytes)} · {formatDateTime(backup.createdAt)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => downloadBackup(backup.filename)}
                  >
                    Baixar
                  </button>
                </div>
              ))
            )}
          </div>
          <p className="muted small">
            Automático todos os dias às {String(system?.backupHour ?? 3).padStart(2, '0')}:00 · retenção de{' '}
            {system?.backupRetentionDays ?? 30} dias. Restaure com o servidor parado, trocando{' '}
            <code>backend/data/drift.db</code> pelo arquivo do backup.
          </p>
        </section>

        <section className="settings-card">
          <header className="settings-card__head">
            <span className="settings-card__icon"><Icon name="wifi" size={20} /></span>
            <div>
              <h2>Rede local</h2>
              <p>Endereços para abrir no celular.</p>
            </div>
          </header>
          <div className="url-list">
            {(system?.urls || []).length === 0 ? (
              <p className="muted">Nenhum IP de LAN detectado. Verifique a conexão do notebook.</p>
            ) : (
              system.urls.map((url) => (
                <div key={url} className="url-row">
                  <Icon name="wifi" size={17} />
                  <code>{url}</code>
                  <button type="button" className="link-button" onClick={() => copyUrl(url)}>
                    Copiar
                  </button>
                </div>
              ))
            )}
            {httpsUrls.map((url) => (
              <div key={url} className="url-row url-row--https">
                <Icon name="lock" size={17} />
                <code>{url}</code>
                <button type="button" className="link-button" onClick={() => copyUrl(url)}>
                  Copiar
                </button>
              </div>
            ))}
            {!secure.secure && (
              <p className="muted small">
                {httpsUrls.length
                  ? 'Use um dos endereços HTTPS acima para instalar o PWA no celular (confie no certificado local).'
                  : 'Para instalar o PWA no celular, gere um certificado com "npm run cert" e reinicie. Veja o README.'}
              </p>
            )}
            {httpsUrls.length > 0 && !secure.secure && (
              <p className="muted small">
                Instale a CA no celular para liberar o PWA:{' '}
                <a className="link-button" href="/local-ca.crt" download>
                  baixar certificado local
                </a>
              </p>
            )}
            {secure.secure && (
              <p className="muted small">
                Contexto seguro ativo. O app pode ser instalado na tela inicial e abrir em tela cheia.
              </p>
            )}
          </div>
          <div className="system-mini-grid">
            <div>
              <span>Versão</span>
              <strong>{system?.versao}</strong>
            </div>
            <div>
              <span>Servidor</span>
              <strong>{system?.hostname}</strong>
            </div>
            <div>
              <span>Fuso</span>
              <strong>{system?.fuso}</strong>
            </div>
            <div>
              <span>No ar há</span>
              <strong>{uptime(system?.uptimeSegundos)}</strong>
            </div>
            <div>
              <span>Banco</span>
              <strong>{bytes(system?.dbSizeBytes)}</strong>
            </div>
            <div>
              <span>Sessões</span>
              <strong>{system?.contagens?.sessoes}</strong>
            </div>
          </div>
          <p className="muted small">
            Para HTTPS confiável no celular via Tailscale, rode no notebook:{' '}
            <code>tailscale serve --bg 3000</code> (veja o README).
          </p>
          <p className="muted small">
            Banco em <code>{system?.dbPath}</code>
          </p>
        </section>
      </div>

      <div className="admin-hint">
        <Icon name="lock" size={17} />
        <p>
          O app não usa internet nem serviços externos. Fotos ficam em{' '}
          <code>backend/uploads</code> e os backups em <code>backend/backups</code>.
        </p>
      </div>

      <InstallInstructionsModal open={installOpen} onClose={() => setInstallOpen(false)} />
    </div>
  );
}
