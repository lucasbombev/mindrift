import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useNow } from '../hooks/useServerClock.js';
import { brl, clientName, formatCountdown, formatTime, paymentLabel, statusLabel } from '../lib/format.js';
import { Badge, Button, Field, InlineError, InfoNote, Input, PageHeader, Spinner } from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';
import {
  EditClientModal,
  EndSessionModal,
  PayActiveModal,
  RenewSessionModal,
  StartSessionModal,
} from '../components/sessionModals.jsx';

function tokenFromText(text) {
  const raw = String(text || '').trim();
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/scan\/([^/?#]+)/);
    if (match) return decodeURIComponent(match[1]);
  } catch {
    /* não é URL */
  }
  const match = raw.match(/\/scan\/([^/?#]+)/);
  if (match) return decodeURIComponent(match[1]);
  return /^[a-zA-Z0-9-]{8,}$/.test(raw) ? raw : null;
}

function ScanResult({ token, onScanAnother }) {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [observacao, setObservacao] = useState('');
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [serverOffset, setServerOffset] = useState(0);
  const localNow = useNow(1000);
  const now = localNow + serverOffset;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api.get(`/scan/${encodeURIComponent(token)}`);
      setData(next);
      if (next.serverNow) setServerOffset(new Date(next.serverNow).getTime() - Date.now());
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const checkin = async () => {
    setCheckinLoading(true);
    try {
      await api.post(`/carts/${data.cart.id}/checkin`, { observacao: observacao.trim() || undefined });
      toast('Check-in concluído. Carrinho disponível.', { type: 'success' });
      setObservacao('');
      await load();
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setCheckinLoading(false);
    }
  };

  if (loading && !data) return <div className="center-pad"><Spinner size={30} /></div>;

  if (error) {
    return (
      <div className="container">
        <div className="error-panel">
          <span className="error-panel__icon"><Icon name="qr" size={30} /></span>
          <h1>QR não reconhecido neste negócio</h1>
          <p>{error}</p>
          <div className="scan-result__actions">
            <Button icon="scan" onClick={onScanAnother}>Escanear outro</Button>
            <Button variant="secondary" icon="home" onClick={() => window.location.assign('/')}>Voltar ao painel</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { cart, activeSession } = data;
  const remaining = activeSession
    ? new Date(activeSession.fimPrevistoEm).getTime() - now
    : null;
  const countdown = remaining === null ? null : formatCountdown(remaining);
  const pending = Number(activeSession?.valorPendenteCentavos) || 0;

  return (
    <div className="container scan-result">
      <div className="scan-result__top">
        <button type="button" className="back-link" onClick={onScanAnother}>
          <Icon name="chevronLeft" size={18} /> Escanear outro
        </button>
        <span className="scan-result__tenant">{data.tenant?.nome}</span>
      </div>

      <div className="scan-cart-head" style={{ '--category-color': cart.category?.cor }}>
        <div className="scan-cart-head__icon">{cart.category?.icone || '🏁'}</div>
        <div className="scan-cart-head__body">
          <span className="eyebrow">{cart.category?.nome || 'Equipamento'}</span>
          <h1>{cart.codigo}</h1>
          <div className="scan-cart-head__badges">
            <Badge tone={cart.status === 'disponivel' ? 'green' : cart.status === 'em_uso' ? 'blue' : cart.status === 'carregando' ? 'amber' : 'red'}>
              {statusLabel(cart.status)}
            </Badge>
            {cart.observacao && <span className="muted small">{cart.observacao}</span>}
          </div>
        </div>
      </div>

      {cart.status === 'disponivel' && !activeSession && (
        <section className="scan-action-card">
          <div className="scan-action-card__head">
            <span className="scan-action-card__icon is-ready"><Icon name="play" size={28} /></span>
            <div>
              <h2>Pronto para alugar</h2>
              <p>Check-out: inicie o timer agora. O carrinho passa para “em uso”.</p>
            </div>
          </div>
          <Button size="lg" icon="play" block onClick={() => setModal({ type: 'start' })}>
            Iniciar aluguel agora
          </Button>
        </section>
      )}

      {activeSession && (
        <section className="scan-action-card">
          <div className="scan-session-head">
            <div>
              <span className="eyebrow">Sessão ativa</span>
              <h2>{clientName(activeSession.clienteNome)}</h2>
              <p>{activeSession.planoNome} · {activeSession.minutosContratados} min · {brl(activeSession.valorCentavos)}</p>
            </div>
            <div className={`scan-timer ${countdown?.expired ? 'is-expired' : ''}`}>
              <strong>{countdown?.text}</strong>
              <span>{countdown?.expired ? 'excedido' : 'restantes'}</span>
            </div>
          </div>
          <div className="scan-session-meta">
            <span><Icon name="clock" size={15} /> Início {formatTime(activeSession.iniciadoEm)}</span>
            <span><Icon name="timer" size={15} /> Fim {formatTime(activeSession.fimPrevistoEm)}</span>
            <span><Icon name="cash" size={15} /> {activeSession.pago ? `Pago${activeSession.formaPagamento ? ` · ${paymentLabel(activeSession.formaPagamento)}` : ''}` : pending > 0 ? `Falta ${brl(pending)}` : 'Pago'}</span>
          </div>
          <div className="scan-session-actions">
            <Button variant="secondary" icon="plus" onClick={() => setModal({ type: 'renew' })}>Renovar</Button>
            <Button variant="success" icon="stop" onClick={() => setModal({ type: 'end' })}>Encerrar</Button>
            {pending > 0 && (
              <Button variant="ghost" icon="cash" onClick={() => setModal({ type: 'pay' })}>Registrar pagamento</Button>
            )}
            <Button variant="ghost" icon="edit" onClick={() => setModal({ type: 'client' })}>Editar cliente</Button>
          </div>
        </section>
      )}

      {cart.status === 'carregando' && !activeSession && (
        <section className="scan-action-card">
          <div className="scan-action-card__head">
            <span className="scan-action-card__icon is-charging"><Icon name="refresh" size={28} /></span>
            <div>
              <h2>Na carga</h2>
              <p>Check-in: marque quando o equipamento estiver pronto para voltar à pista.</p>
            </div>
          </div>
          <Button size="lg" icon="check" block loading={checkinLoading} onClick={checkin}>
            Marcar como Disponível
          </Button>
        </section>
      )}

      {cart.status === 'manutencao' && !activeSession && (
        <section className="scan-action-card">
          <div className="scan-action-card__head">
            <span className="scan-action-card__icon is-maintenance"><Icon name="settings" size={28} /></span>
            <div>
              <h2>Em manutenção</h2>
              <p>Este equipamento não pode ser alugado até ser liberado.</p>
            </div>
          </div>
          <Field label="Observação do check-in" htmlFor="scan-obs" hint="Ex.: troca de bateria concluída.">
            <Input id="scan-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={300} disabled={!isAdmin || checkinLoading} placeholder={isAdmin ? 'Opcional' : 'Apenas administradores liberam'} />
          </Field>
          {isAdmin ? (
            <Button size="lg" icon="check" block loading={checkinLoading} onClick={checkin}>
              Liberar e marcar como Disponível
            </Button>
          ) : (
            <InfoNote tone="warning" icon="lock">
              Peça a um administrador para liberar este carrinho da manutenção.
            </InfoNote>
          )}
        </section>
      )}

      {cart.status === 'em_uso' && !activeSession && (
        <InfoNote tone="warning" icon="alert">
          O carrinho está marcado como em uso, mas não há sessão ativa. Peça ao administrador para
          ajustar o status.
        </InfoNote>
      )}

      {modal?.type === 'start' && (
        <StartSessionModal
          open
          onClose={() => setModal(null)}
          carts={[cart]}
          preselectedCart={cart}
          onSuccess={() => { setModal(null); load(); }}
        />
      )}
      {modal?.type === 'renew' && activeSession && (
        <RenewSessionModal
          open
          onClose={() => setModal(null)}
          session={activeSession}
          offset={serverOffset}
          onSuccess={() => { setModal(null); load(); }}
        />
      )}
      {modal?.type === 'end' && activeSession && (
        <EndSessionModal
          open
          onClose={() => setModal(null)}
          session={activeSession}
          offset={serverOffset}
          onSuccess={() => { setModal(null); load(); }}
        />
      )}
      {modal?.type === 'pay' && activeSession && (
        <PayActiveModal
          open
          onClose={() => setModal(null)}
          session={activeSession}
          onSuccess={() => { setModal(null); load(); }}
        />
      )}
      {modal?.type === 'client' && activeSession && (
        <EditClientModal
          open
          onClose={() => setModal(null)}
          session={activeSession}
          onSuccess={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}

function ScannerView() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const scannerRef = useRef(null);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    setScanning(false);
    if (scanner) {
      try { await scanner.stop(); } catch { /* já parado */ }
      try { scanner.clear(); } catch { /* noop */ }
    }
  }, []);

  useEffect(() => () => { stopScanner(); }, [stopScanner]);

  const handleDecoded = useCallback(async (text) => {
    const token = tokenFromText(text);
    if (!token) {
      toast('Este QR não parece ser de um equipamento.', { type: 'error' });
      return;
    }
    await stopScanner();
    navigate(`/scan/${encodeURIComponent(token)}`);
  }, [navigate, stopScanner, toast]);

  const startCamera = async () => {
    setCameraError('');
    setStarting(true);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      setScanning(true);
      await new Promise((resolve) => setTimeout(resolve, 80));
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => { handleDecoded(decoded); },
        () => {},
      );
    } catch (err) {
      setScanning(false);
      setCameraError(
        'Não foi possível abrir a câmera. Verifique a permissão ou use o código do carrinho abaixo.',
      );
      try { await scannerRef.current?.clear(); } catch { /* noop */ }
      scannerRef.current = null;
    } finally {
      setStarting(false);
    }
  };

  const manualSubmit = async (event) => {
    event.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    setManualLoading(true);
    try {
      const data = await api.get(`/scan/code/${encodeURIComponent(code)}`);
      navigate(`/scan/${encodeURIComponent(data.cart.qrToken)}`);
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setManualLoading(false);
    }
  };

  return (
    <div className="container scan-page">
      <PageHeader
        title="Escanear"
        subtitle="Aponte a câmera para o QR do carrinho. Escaneou, alugou."
        eyebrow="Check-in e check-out"
      />

      <div className="scanner-card">
        <div className="scanner-card__frame">
          <div id="qr-reader" className={`qr-reader ${scanning ? '' : 'is-hidden'}`} />
          {!scanning && (
            <div className="scanner-placeholder">
              <span className="scanner-placeholder__icon"><Icon name="scan" size={48} /></span>
              <h2>Leitor de QR Code</h2>
              <p>Use a câmera traseira do celular. Funciona no Chrome Android e Safari iOS.</p>
              <Button size="lg" icon="camera" loading={starting} onClick={startCamera}>
                {starting ? 'Abrindo câmera…' : 'Abrir câmera e escanear'}
              </Button>
            </div>
          )}
        </div>
        {scanning && (
          <Button variant="secondary" icon="close" onClick={stopScanner} block>
            Fechar câmera
          </Button>
        )}
        {cameraError && <InfoNote tone="warning" icon="alert">{cameraError}</InfoNote>}
      </div>

      <div className="scanner-manual">
        <div className="scanner-manual__head">
          <Icon name="keyboard" size={20} />
          <div>
            <strong>Sem câmera? Digite o código</strong>
            <span>O mesmo fluxo abre a tela certa do carrinho.</span>
          </div>
        </div>
        <form onSubmit={manualSubmit} className="scanner-manual__form">
          <Input
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value.toUpperCase())}
            placeholder="Ex.: D01"
            maxLength={12}
            autoCapitalize="characters"
            disabled={manualLoading}
          />
          <Button type="submit" icon="arrowRight" loading={manualLoading}>Abrir</Button>
        </form>
      </div>

      <div className="admin-hint">
        <Icon name="info" size={17} />
        <p>
          O QR é exclusivo do seu negócio. Ao encerrar um aluguel, escolha em 1 toque o destino:
          disponível, carregamento ou manutenção.
        </p>
      </div>
    </div>
  );
}

export function ScanPage() {
  const { qrToken } = useParams();
  const navigate = useNavigate();
  if (!qrToken) return <ScannerView />;
  return <ScanResult token={qrToken} onScanAnother={() => navigate('/scan')} />;
}
