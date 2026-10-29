import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Field, InlineError, InfoNote, Input } from '../components/ui.jsx';
import { Icon, Logo } from '../components/Icons.jsx';

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nome: '',
    adminNome: '',
    email: '',
    senha: '',
    confirmar: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.nome.trim().length < 2) return setError('Informe o nome do negócio.');
    if (form.adminNome.trim().length < 2) return setError('Informe o nome do administrador.');
    if (!form.email.includes('@')) return setError('Informe um e-mail válido.');
    if (form.senha.length < 8) return setError('A senha deve ter pelo menos 8 caracteres.');
    if (!/[a-zA-Z]/.test(form.senha) || !/[0-9]/.test(form.senha)) {
      return setError('A senha precisa ter letras e números.');
    }
    if (form.senha !== form.confirmar) return setError('As senhas não conferem.');
    setLoading(true);
    try {
      await signup({
        nome: form.nome.trim(),
        adminNome: form.adminNome.trim(),
        email: form.email.trim(),
        senha: form.senha,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
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
            Seu negócio,
            <br />
            sua própria pista.
          </h1>
          <p>
            Crie um espaço isolado para sua frota, seus operadores e seu caixa. Você começa com
            categorias e planos prontos para acelerar.
          </p>
          <ul className="login-features">
            <li><Icon name="cart" size={19} /> Frota só do seu negócio</li>
            <li><Icon name="users" size={19} /> Operadores com acesso separado</li>
            <li><Icon name="timer" size={19} /> 4 categorias + planos 5/10/15 min</li>
          </ul>
        </section>

        <section className="login-card">
          <div className="login-card__head">
            <span className="login-card__icon"><Icon name="plus" size={22} /></span>
            <div>
              <h2>Criar meu negócio</h2>
              <p>Cadastro público. O primeiro usuário será o administrador.</p>
            </div>
          </div>

          <form onSubmit={submit} className="login-form">
            <InlineError>{error}</InlineError>
            <Field label="Nome do negócio" htmlFor="signup-nome" required>
              <Input id="signup-nome" value={form.nome} onChange={set('nome')} maxLength={80} placeholder="Ex.: Leão Brinquedos" disabled={loading} />
            </Field>
            <Field label="Seu nome" htmlFor="signup-admin" required>
              <Input id="signup-admin" value={form.adminNome} onChange={set('adminNome')} maxLength={80} autoComplete="name" disabled={loading} />
            </Field>
            <Field label="E-mail" htmlFor="signup-email" required hint="Você usará este e-mail para entrar.">
              <Input id="signup-email" type="email" value={form.email} onChange={set('email')} maxLength={120} autoComplete="email" autoCapitalize="none" disabled={loading} />
            </Field>
            <div className="form-grid form-grid--2">
              <Field label="Senha" htmlFor="signup-senha" required hint="8+ caracteres, com letras e números.">
                <Input id="signup-senha" type="password" value={form.senha} onChange={set('senha')} maxLength={72} autoComplete="new-password" disabled={loading} />
              </Field>
              <Field label="Confirmar senha" htmlFor="signup-confirmar" required>
                <Input id="signup-confirmar" type="password" value={form.confirmar} onChange={set('confirmar')} maxLength={72} autoComplete="new-password" disabled={loading} />
              </Field>
            </div>
            <InfoNote icon="check">
              Ao criar, preparamos as categorias <strong>Drift, Kart, Patinete e Quadriciclo</strong> e
              os planos globais de 5, 10 e 15 minutos.
            </InfoNote>
            <Button type="submit" size="lg" block loading={loading} icon="arrowRight">
              Criar negócio e entrar
            </Button>
          </form>

          <div className="login-card__footer login-card__footer--split">
            <Link to="/login">Já tenho conta</Link>
            <span>Ambiente isolado por negócio</span>
          </div>
        </section>
      </div>
    </div>
  );
}
