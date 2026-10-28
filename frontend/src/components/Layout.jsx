import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSocket } from '../context/SocketContext.jsx';
import { Avatar, Button, IconButton, Modal } from '../components/ui.jsx';
import { Icon, Logo } from '../components/Icons.jsx';
import { InstallAppButton, InstallInstructionsModal } from '../components/InstallApp.jsx';
import { useInstallState } from '../hooks/useInstallState.js';
import { promptInstall } from '../lib/pwa.js';
import { roleLabel } from '../lib/format.js';

const ADMIN_LINKS = [
  { to: '/carrinhos', label: 'Carrinhos', icon: 'cart', desc: 'Fotos, status e cadastro' },
  { to: '/planos', label: 'Planos', icon: 'timer', desc: 'Tempos e valores' },
  { to: '/usuarios', label: 'Usuários', icon: 'users', desc: 'Operadores e permissões' },
  { to: '/configuracoes', label: 'Ajustes', icon: 'settings', desc: 'Som, backups e rede' },
];

export function AppLayout() {
  const { user, logout, isAdmin } = useAuth();
  const { connected } = useSocket();
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const { canPrompt, standalone } = useInstallState();

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const mainLinks = isAdmin
    ? [
        { to: '/', label: 'Início', icon: 'home', end: true },
        { to: '/historico', label: 'Histórico', icon: 'history' },
        { to: '/relatorios', label: 'Relatórios', icon: 'chart' },
        { to: '/caixa', label: 'Caixa', icon: 'cash' },
      ]
    : [
        { to: '/', label: 'Início', icon: 'home', end: true },
        { to: '/historico', label: 'Histórico', icon: 'history' },
      ];

  const isMoreActive =
    isAdmin && ADMIN_LINKS.some((link) => location.pathname.startsWith(link.to));

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleInstall = async () => {
    if (canPrompt) {
      await promptInstall();
    } else {
      setInstallOpen(true);
    }
    setMoreOpen(false);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="topbar__brand" aria-label="Ir para o painel">
          <Logo size={40} withWordmark />
        </NavLink>

        <nav className="desktop-nav" aria-label="Navegação principal">
          {mainLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => `desktop-nav__link ${isActive ? 'is-active' : ''}`}
            >
              <Icon name={link.icon} size={18} />
              <span>{link.label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            className={`desktop-nav__link ${isMoreActive ? 'is-active' : ''}`}
            onClick={() => setMoreOpen(true)}
          >
            <Icon name="more" size={18} />
            <span>Mais</span>
          </button>
        </nav>

        <div className="topbar__right">
          <span
            className={`connection-chip ${connected ? 'is-online' : 'is-offline'}`}
            title={connected ? 'Tempo real conectado' : 'Reconectando ao servidor'}
          >
            <span className="connection-chip__dot" />
            <span className="connection-chip__text">{connected ? 'Ao vivo' : 'Reconectando'}</span>
          </span>
          <div className="topbar__user">
            <Avatar name={user?.nome} size={36} />
            <div className="topbar__user-info">
              <strong>{user?.nome}</strong>
              <span>{roleLabel(user?.role)}</span>
            </div>
          </div>
          <IconButton icon="logout" label="Sair" onClick={handleLogout} className="topbar__logout" />
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Navegação">
        {mainLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => `bottom-nav__item ${isActive ? 'is-active' : ''}`}
          >
            <Icon name={link.icon} size={23} />
            <span>{link.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`bottom-nav__item ${isMoreActive ? 'is-active' : ''}`}
          onClick={() => setMoreOpen(true)}
        >
          <Icon name="more" size={23} />
          <span>Mais</span>
        </button>
      </nav>

      <Modal
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="Mais opções"
        subtitle={`${user?.nome} · ${roleLabel(user?.role)}`}
        icon="menu"
        size="sm"
      >
        <div className="more-sheet">
          {isAdmin && (
            <div className="more-sheet__group">
              <span className="more-sheet__title">Administração</span>
              {ADMIN_LINKS.map((link) => (
                <button
                  key={link.to}
                  type="button"
                  className="more-sheet__item"
                  onClick={() => navigate(link.to)}
                >
                  <span className="more-sheet__item-icon">
                    <Icon name={link.icon} size={20} />
                  </span>
                  <span className="more-sheet__item-text">
                    <strong>{link.label}</strong>
                    <small>{link.desc}</small>
                  </span>
                  <Icon name="chevronRight" size={18} />
                </button>
              ))}
            </div>
          )}

          <div className="more-sheet__group">
            <span className="more-sheet__title">Conta e app</span>
            <button
              type="button"
              className="more-sheet__item"
              onClick={() => navigate('/alterar-senha')}
            >
              <span className="more-sheet__item-icon">
                <Icon name="key" size={20} />
              </span>
              <span className="more-sheet__item-text">
                <strong>Alterar senha</strong>
                <small>Atualize sua senha de acesso</small>
              </span>
              <Icon name="chevronRight" size={18} />
            </button>
            {!standalone && (
              <button type="button" className="more-sheet__item" onClick={handleInstall}>
                <span className="more-sheet__item-icon">
                  <Icon name="install" size={20} />
                </span>
                <span className="more-sheet__item-text">
                  <strong>Instalar app</strong>
                  <small>Atalho em tela cheia no celular</small>
                </span>
                <Icon name="chevronRight" size={18} />
              </button>
            )}
          </div>

          <div className="more-sheet__status">
            <span className={`status-line ${connected ? 'is-online' : 'is-offline'}`}>
              <span className="connection-chip__dot" />
              {connected ? 'Conectado ao servidor local' : 'Sem conexão em tempo real'}
            </span>
            <Button variant="dangerGhost" icon="logout" block onClick={handleLogout}>
              Sair da conta
            </Button>
          </div>
        </div>
      </Modal>

      <InstallInstructionsModal open={installOpen} onClose={() => setInstallOpen(false)} />
    </div>
  );
}
