import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, InlineError } from '../components/ui.jsx';
import { Icon, Logo } from '../components/Icons.jsx';

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Informe usuário e senha.');
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message || 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-page__glow login-page__glow--one" />
      <div className="login-page__glow login-page__glow--two" />
      <div className="login-shell">
        <section className="login-hero">
          <div className="login-hero__brand">
            <Logo size={62} withWordmark />
          </div>
          <h1>
            A pista inteira
            <br />
            na palma da mão.
          </h1>
          <p>
            Controle aluguéis, timers e caixa em tempo real, direto na rede local da praça. Sem
            internet, sem complicação.
          </p>
          <ul className="login-features">
            <li>
              <Icon name="timer" size={19} /> Timer no servidor
            </li>
            <li>
              <Icon name="wifiOff" size={19} /> Funciona sem internet
            </li>
            <li>
              <Icon name="cart" size={19} /> Vários celulares
            </li>
          </ul>
        </section>

        <section className="login-card">
          <div className="login-card__head">
            <span className="login-card__icon">
              <Icon name="lock" size={21} />
            </span>
            <div>
              <h2>Acessar o painel</h2>
              <p>Entre com o usuário do operador ou administrador.</p>
            </div>
          </div>

          <form onSubmit={submit} className="login-form">
            <InlineError>{error}</InlineError>
            <div className="field">
              <label className="field__label" htmlFor="username">
                Usuário
              </label>
              <input
                id="username"
                className="input"
                type="text"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="ex.: admin"
                autoFocus
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="password">
                Senha
              </label>
              <div className="password-wrap">
                <input
                  id="password"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Sua senha"
                />
                <button
                  type="button"
                  className="password-wrap__toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={20} />
                </button>
              </div>
            </div>
            <Button type="submit" size="lg" block loading={loading} icon="arrowRight">
              Entrar
            </Button>
          </form>

          <div className="login-card__footer">
            <Icon name="wifi" size={16} />
            <span>Acesso pela rede Wi-Fi local · v1.0</span>
          </div>
        </section>
      </div>
    </div>
  );
}
