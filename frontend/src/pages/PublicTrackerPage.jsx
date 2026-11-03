import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Logo } from '../components/Icons.jsx';
import { Button, Spinner } from '../components/ui.jsx';
import { formatCountdown } from '../lib/format.js';

function storageKey(slug) {
  return `mindrift.tracker.${slug}`;
}

async function consultStatus(slug, name) {
  const res = await fetch(
    `/api/public/status/${encodeURIComponent(slug)}?name=${encodeURIComponent(name)}`,
    { headers: { Accept: 'application/json' } },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data?.erro?.mensagem || 'Não foi possível consultar agora.');
    error.codigo = data?.erro?.codigo || 'erro';
    throw error;
  }
  return data;
}

export function PublicTrackerPage() {
  const { tenantSlug } = useParams();
  const [name, setName] = useState('');
  const [activeName, setActiveName] = useState('');
  const [result, setResult] = useState(null);
  const [remaining, setRemaining] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);

  const consult = useCallback(
    async (queryName, silent = false) => {
      const clean = String(queryName || '').trim();
      if (clean.length < 2) {
        setError('Digite o nome da criança.');
        return;
      }
      if (!silent) setLoading(true);
      setError('');
      try {
        const data = await consultStatus(tenantSlug, clean);
        setResult(data);
        setRemaining(data.segundosRestantes ?? null);
        setLastUpdate(new Date());
        try { localStorage.setItem(storageKey(tenantSlug), clean); } catch { /* noop */ }
      } catch (err) {
        setResult(null);
        setRemaining(null);
        setError(err.message);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [tenantSlug],
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey(tenantSlug));
      if (saved) {
        setName(saved);
        setActiveName(saved);
      }
    } catch { /* noop */ }
  }, [tenantSlug]);

  useEffect(() => {
    document.title = 'Acompanhar tempo · Mindrift';
    return () => { document.title = 'Mindrift · Painel da pista'; };
  }, []);

  useEffect(() => {
    if (activeName) consult(activeName);
  }, [activeName, consult]);

  useEffect(() => {
    if (!activeName) return undefined;
    const poll = setInterval(() => consult(activeName, true), 15000);
    return () => clearInterval(poll);
  }, [activeName, consult]);

  useEffect(() => {
    if (remaining === null) return undefined;
    const timer = setInterval(() => {
      setRemaining((current) => (current === null ? null : Math.max(0, current - 1)));
    }, 1000);
    return () => clearInterval(timer);
  }, [remaining !== null]);

  const submit = (event) => {
    event.preventDefault();
    const clean = name.trim();
    if (clean.length < 2) {
      setError('Digite o nome da criança.');
      return;
    }
    setActiveName(clean);
    try { localStorage.setItem(storageKey(tenantSlug), clean); } catch { /* noop */ }
    consult(clean);
  };

  const timerText = result?.tempoLivre
    ? 'Livre'
    : remaining === null
      ? '--:--'
      : formatCountdown(remaining * 1000).text;
  const finished = result && !result.tempoLivre && remaining !== null && remaining <= 0;
  const warning = !finished && remaining !== null && remaining <= 300;
  const danger = !finished && remaining !== null && remaining <= 60;

  return (
    <main className="tracker-page">
      <div className="tracker-shell">
        <header className="tracker-brand">
          <Logo size={44} withWordmark />
          <span>Consulta de tempo</span>
        </header>

        <section className="tracker-hero">
          <span className="tracker-hero__eyebrow">Sem fila, sem espera</span>
          <h1>Acompanhe o tempo do seu filho</h1>
          <p>Digite o nome da criança para ver quanto tempo ainda falta no brinquedo.</p>
        </section>

        <form className="tracker-form" onSubmit={submit}>
          <label htmlFor="tracker-name">Nome da criança</label>
          <div className="tracker-form__row">
            <input
              id="tracker-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Pedro"
              autoComplete="off"
              maxLength={80}
              disabled={loading}
            />
            <Button type="submit" size="lg" icon="search" loading={loading}>
              Consultar Tempo
            </Button>
          </div>
        </form>

        {error && (
          <div className="tracker-message tracker-message--error" role="alert">
            {error}
          </div>
        )}

        {result?.ambiguo && (
          <div className="tracker-message tracker-message--warning" role="alert">
            <strong>Encontramos mais de uma criança com esse nome.</strong>
            <p>{result.mensagem}</p>
          </div>
        )}

        {result && !result.ambiguo && (
          <section className={`tracker-result ${danger ? 'is-danger' : warning ? 'is-warning' : ''}`}>
            <div className="tracker-result__head">
              <div>
                <span className="tracker-result__eyebrow">{result.estabelecimento}</span>
                <h2>{result.equipamento}</h2>
                <p>{result.nome}</p>
              </div>
              <span className={`tracker-live ${finished ? 'is-finished' : ''}`}>
                {finished ? 'Encerrado' : result.tempoLivre ? 'Tempo livre' : 'Ao vivo'}
              </span>
            </div>

            <div className={`tracker-timer ${danger ? 'is-danger' : warning ? 'is-warning' : ''} ${finished ? 'is-finished' : ''}`}>
              {timerText}
            </div>

            {finished ? (
              <p className="tracker-finished">
                O tempo do(a) {result.nome} acabou! Por favor, vá até o operador.
              </p>
            ) : result.tempoLivre ? (
              <p className="tracker-note">O tempo está sendo controlado pelo operador.</p>
            ) : (
              <p className="tracker-note">Atualizamos automaticamente a cada 15 segundos.</p>
            )}
          </section>
        )}

        {lastUpdate && (
          <p className="tracker-updated">
            Última atualização: {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}

        <footer className="tracker-footer">
          <strong>Mindrift</strong>
          <span>Em caso de dúvida, chame o operador.</span>
        </footer>
      </div>
    </main>
  );
}
