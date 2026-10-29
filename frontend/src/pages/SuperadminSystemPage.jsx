import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, downloadAuthenticated } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Button, IconButton, InfoNote, Spinner } from '../components/ui.jsx';
import { Icon, Logo } from '../components/Icons.jsx';

function bytes(size) {
  if (size === null || size === undefined) return '—';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
function uptime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}min` : `${minutes}min`;
}

export function SuperadminSystemPage({ onBack }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [system, setSystem] = useState(null);
  const [logs, setLogs] = useState(null);
  const [backups, setBackups] = useState([]);
  const [impersonations, setImpersonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [systemData, logData, backupData, impData] = await Promise.all([
        api.get('/superadmin/system'),
        api.get('/superadmin/system/logs?tail=200'),
        api.get('/superadmin/system/backups'),
        api.get('/superadmin/impersonations'),
      ]);
      setSystem(systemData);
      setLogs(logData);
      setBackups(backupData.items || []);
      setImpersonations(impData.items || []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const backupNow = async () => {
    setBusy('backup');
    try {
      const data = await api.post('/superadmin/system/backups');
      await downloadAuthenticated(
        `/superadmin/system/backups/${encodeURIComponent(data.backup.filename)}/download`,
        data.backup.filename,
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const downloadBackup = (filename) => downloadAuthenticated(
    `/superadmin/system/backups/${encodeURIComponent(filename)}/download`,
    filename,
  ).catch((err) => setError(err.message));

  const downloadLog = () => downloadAuthenticated('/superadmin/system/logs/download', 'drift-rent.log')
    .catch((err) => setError(err.message));

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
        <nav className="superadmin-tabs">
          <button type="button" onClick={onBack}>Negócios</button>
          <button type="button" className="is-active">Sistema</button>
        </nav>
        <div className="superadmin-topbar__right">
          <span className="muted small">{user?.nome}</span>
          <IconButton icon="refresh" label="Atualizar sistema" onClick={load} />
          <IconButton icon="logout" label="Sair" onClick={handleLogout} />
        </div>
      </header>

      <main className="container">
        <div className="section-head section-head--stack">
          <div>
            <span className="eyebrow">Infraestrutura</span>
            <h1>Sistema</h1>
            <p>Somente superadmin vê estes detalhes. Nada disso aparece no painel do tenant.</p>
          </div>
          <div className="section-head__actions">
            <Button icon="download" onClick={backupNow} loading={busy === 'backup'}>Rodar backup agora</Button>
            <Button variant="secondary" icon="download" disabled={!system?.lastBackup} onClick={() => system?.lastBackup && downloadBackup(system.lastBackup.filename)}>Baixar backup</Button>
            <Button variant="secondary" icon="download" onClick={downloadLog}>Baixar log</Button>
          </div>
        </div>

        {error && <InfoNote tone="warning" icon="alert">{error}</InfoNote>}
        {loading ? <div className="center-pad"><Spinner size={28} /></div> : system && (
          <>
            <div className="system-grid">
              <div><span>Hostname</span><strong>{system.hostname}</strong></div>
              <div><span>IPs</span><strong>{system.ips?.join(', ') || '—'}</strong></div>
              <div><span>Uptime</span><strong>{uptime(system.uptimeSegundos)}</strong></div>
              <div><span>Versão</span><strong>{system.versao}</strong></div>
              <div><span>Tailscale Serve</span><strong className="system-grid__url">{system.tailscaleUrl || 'não configurado'}</strong></div>
              <div><span>HTTPS</span><strong>{system.httpsAtivo ? `ativo · ${system.httpsPort}` : 'não configurado'}</strong></div>
              <div><span>Secure context</span><strong>{window.isSecureContext ? 'sim' : 'não'}</strong></div>
              <div><span>WebSocket</span><strong>{system.webSocketConnections} conexão(ões)</strong></div>
              <div><span>Banco</span><strong>{bytes(system.dbSizeBytes)}</strong></div>
              <div><span>Último backup</span><strong>{system.lastBackup?.createdAt ? new Date(system.lastBackup.createdAt).toLocaleString('pt-BR') : 'nenhum'}</strong></div>
              <div><span>Espaço livre</span><strong>{bytes(system.diskFreeBytes)}</strong></div>
              <div><span>Fuso / Node</span><strong>{system.fuso} · {system.node}</strong></div>
            </div>

            <section className="settings-card">
              <header className="settings-card__head">
                <span className="settings-card__icon"><Icon name="download" size={20} /></span>
                <div><h2>Backups</h2><p>Globais da plataforma.</p></div>
              </header>
              <div className="backup-list">
                {backups.length === 0 ? <p className="muted">Nenhum backup.</p> : backups.slice(0, 8).map((backup) => (
                  <div key={backup.filename} className="backup-row">
                    <span className="backup-row__icon"><Icon name="download" size={17} /></span>
                    <div className="backup-row__info">
                      <strong>{backup.filename}</strong>
                      <span>{bytes(backup.sizeBytes)} · {new Date(backup.createdAt).toLocaleString('pt-BR')}</span>
                    </div>
                    <button type="button" className="link-button" onClick={() => downloadBackup(backup.filename)}>Baixar</button>
                  </div>
                ))}
              </div>
            </section>

            <section className="settings-card">
              <header className="settings-card__head">
                <span className="settings-card__icon"><Icon name="receipt" size={20} /></span>
                <div><h2>Tail de logs</h2><p>{logs?.caminho || system.logPath} · {bytes(logs?.tamanhoBytes)}</p></div>
                <Button size="sm" variant="secondary" icon="download" onClick={downloadLog}>Baixar log</Button>
              </header>
              <pre className="log-tail">{logs?.conteudo || 'Sem log ainda.'}</pre>
            </section>

            <section className="settings-card">
              <header className="settings-card__head">
                <span className="settings-card__icon"><Icon name="lock" size={20} /></span>
                <div><h2>Impersonações auditadas</h2><p>Últimos acessos de suporte.</p></div>
              </header>
              <div className="audit-list">
                {impersonations.length === 0 ? <p className="muted">Nenhuma impersonação registrada.</p> : impersonations.map((item) => (
                  <div key={item.id} className="audit-row">
                    <div>
                      <strong>{item.tenantNome} · {item.adminNome || item.adminEmail}</strong>
                      <span>{item.motivo}</span>
                    </div>
                    <div className="audit-row__dates">
                      <Badge tone={item.finalizadoEm ? 'gray' : 'amber'}>{item.finalizadoEm ? 'Encerrada' : 'Em aberto'}</Badge>
                      <small>{new Date(item.iniciadoEm).toLocaleString('pt-BR')}</small>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
