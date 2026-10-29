import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { SignupPage } from './pages/SignupPage.jsx';
import { AppLayout } from './components/Layout.jsx';
import { ForcedPasswordChange } from './components/ChangePassword.jsx';
import { Button, LoadingScreen, PageHeader, Spinner } from './components/ui.jsx';
import { Icon, Logo } from './components/Icons.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { HistoryPage } from './pages/HistoryPage.jsx';
import { ReportsPage } from './pages/ReportsPage.jsx';
import { CartsPage } from './pages/CartsPage.jsx';
import { PlansPage } from './pages/PlansPage.jsx';
import { UsersPage } from './pages/UsersPage.jsx';
import { CashPage } from './pages/CashPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { ChangePasswordPage } from './pages/ChangePasswordPage.jsx';
import { PwaUpdateBanner } from './components/PwaUpdateBanner.jsx';
import { SuperadminPage } from './pages/SuperadminPage.jsx';
import { CategoriesPage } from './pages/CategoriesPage.jsx';
import { QrCodesPage } from './pages/QrCodesPage.jsx';
import { ScanPage } from './pages/ScanPage.jsx';

function AdminOnly({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

function ServerUnavailable() {
  const { bootError, retryBoot, loading } = useAuth();
  return (
    <div className="server-down">
      <div className="server-down__card">
        <Logo size={56} withWordmark />
        <span className="server-down__badge">
          <Icon name="wifiOff" size={18} /> Sem conexão com o servidor
        </span>
        <h1>O notebook está ligado e na mesma rede?</h1>
        <p>{bootError || 'Não foi possível falar com o servidor local.'}</p>
        <ul>
          <li>Confirme se o notebook está ligado e com o painel aberto.</li>
          <li>Verifique se o celular está na mesma rede Wi-Fi.</li>
          <li>Confira o endereço IP exibido no terminal do notebook.</li>
        </ul>
        <Button size="lg" icon="refresh" onClick={retryBoot} loading={loading} block>
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}

function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="container">
      <div className="not-found">
        <span className="not-found__code">404</span>
        <h1>Página não encontrada</h1>
        <p>O endereço que você tentou abrir não existe neste app.</p>
        <Button icon="home" onClick={() => navigate('/')}>
          Voltar ao painel
        </Button>
      </div>
    </div>
  );
}

function BootSplash() {
  return (
    <div className="boot-splash">
      <Logo size={58} />
      <Spinner size={26} />
      <p>Conectando ao painel da pista…</p>
    </div>
  );
}

function AppRoutes() {
  const { user, loading, bootError } = useAuth();

  if (loading) return <BootSplash />;
  if (bootError && !user) return <ServerUnavailable />;
  if (!user) {
    return (
      <Routes>
        <Route path="/cadastro" element={<SignupPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  if (user.mustChangePassword) return <ForcedPasswordChange />;
  if (user.role === 'superadmin') return <SuperadminPage />;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="scan" element={<ScanPage />} />
        <Route path="scan/:qrToken" element={<ScanPage />} />
        <Route path="historico" element={<HistoryPage />} />
        <Route path="login" element={<Navigate to="/" replace />} />
        <Route path="cadastro" element={<Navigate to="/" replace />} />
        <Route path="alterar-senha" element={<ChangePasswordPage />} />
        <Route
          path="relatorios"
          element={
            <AdminOnly>
              <ReportsPage />
            </AdminOnly>
          }
        />
        <Route
          path="carrinhos"
          element={
            <AdminOnly>
              <CartsPage />
            </AdminOnly>
          }
        />
        <Route
          path="planos"
          element={
            <AdminOnly>
              <PlansPage />
            </AdminOnly>
          }
        />
        <Route
          path="categorias"
          element={
            <AdminOnly>
              <CategoriesPage />
            </AdminOnly>
          }
        />
        <Route
          path="qrcodes"
          element={
            <AdminOnly>
              <QrCodesPage />
            </AdminOnly>
          }
        />
        <Route
          path="usuarios"
          element={
            <AdminOnly>
              <UsersPage />
            </AdminOnly>
          }
        />
        <Route
          path="caixa"
          element={
            <AdminOnly>
              <CashPage />
            </AdminOnly>
          }
        />
        <Route
          path="configuracoes"
          element={
            <AdminOnly>
              <SettingsPage />
            </AdminOnly>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <>
      <AppRoutes />
      <PwaUpdateBanner />
    </>
  );
}
