import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { api, downloadAuthenticated } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Button, EmptyState, PageHeader, Spinner } from '../components/ui.jsx';
import { Icon } from '../components/Icons.jsx';

function scanUrl(token) {
  return `${window.location.origin}/scan/${token}`;
}

async function makeQr(token) {
  return QRCode.toDataURL(scanUrl(token), {
    margin: 1,
    width: 640,
    errorCorrectionLevel: 'M',
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function printGlobalPoster(qrDataUrl, publicUrl, tenantName, openedWindow = null) {
  const win = openedWindow || window.open('', '_blank', 'width=900,height=1200');
  if (!win) return false;
  win.document.write(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>QR Code para os Pais</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; background: #fff; color: #0b1220; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 24mm 20mm; display: flex; flex-direction: column; align-items: center; text-align: center; }
  .brand { font-size: 20px; font-weight: 900; letter-spacing: -0.04em; color: #c2410c; }
  h1 { margin: 28mm 0 8px; font-size: 34px; line-height: 1.05; letter-spacing: -0.05em; }
  p { margin: 0; max-width: 150mm; color: #475569; font-size: 17px; line-height: 1.5; }
  .qr { margin: 18mm 0 12mm; width: 112mm; height: 112mm; padding: 5mm; border: 2px solid #e2e8f0; border-radius: 8mm; }
  .qr img { width: 100%; height: 100%; display: block; }
  .hint { font-size: 22px; font-weight: 800; color: #0b1220; }
  .url { margin-top: 6mm; font-size: 11px; color: #64748b; word-break: break-all; }
</style></head><body>
<div class="page">
  <div class="brand">Leao Brinquedos</div>
  <h1>Acompanhe o tempo<br>do seu filho!</h1>
  <p>Aponte a câmera do celular para o QR Code e consulte o tempo restante sem precisar chamar o operador.</p>
  <div class="qr"><img src="${qrDataUrl}" alt="QR Code de acompanhamento"></div>
  <div class="hint">Aponte a câmera do celular.</div>
  <div class="url">${escapeHtml(publicUrl)}</div>
  <p style="margin-top:auto;font-size:12px">${escapeHtml(tenantName)} · Leao Brinquedos · gestão de brinquedos</p>
</div>
</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
  return true;
}

async function drawLabelPng(cart, tenantName) {
  const size = 600;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = cart.category?.cor || '#f97316';
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, size - 18, size - 18);
  const qr = await makeQr(cart.qrToken);
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = qr;
  });
  ctx.drawImage(image, 105, 52, 390, 390);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(cart.codigo, size / 2, 492);
  ctx.fillStyle = '#475569';
  ctx.font = '500 26px system-ui, sans-serif';
  ctx.fillText(`${cart.category?.icone || ''} ${cart.category?.nome || ''}`.trim(), size / 2, 528);
  ctx.fillStyle = '#64748b';
  ctx.font = '500 20px system-ui, sans-serif';
  ctx.fillText(tenantName || '', size / 2, 562);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `qr-${cart.codigo}.png`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function QrCodesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [carts, setCarts] = useState([]);
  const [qrs, setQrs] = useState({});
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState('');
  const [printCart, setPrintCart] = useState(null);
  const [globalQr, setGlobalQr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/carts');
      const items = data.items || [];
      setCarts(items);
      const entries = await Promise.all(
        items.map(async (cart) => [cart.id, await makeQr(cart.qrToken)]),
      );
      setQrs(Object.fromEntries(entries));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const cart of carts) {
      const key = cart.categoryId || 0;
      if (!map.has(key)) map.set(key, { category: cart.category, items: [] });
      map.get(key).items.push(cart);
    }
    return [...map.values()];
  }, [carts]);

  const printOne = (cart) => {
    setPrintCart(cart);
    setTimeout(() => window.print(), 120);
  };

  const generateGlobalQr = async () => {
    if (!user?.tenantSlug) return;
    // Abre a janela de impressão dentro do gesto do usuário; alguns navegadores
    // bloqueiam pop-up se ele for aberto depois de um await.
    const win = window.open('', '_blank', 'width=900,height=1200');
    if (!win) {
      toast('Permita pop-ups para abrir o pôster em PDF.', { type: 'warning' });
      return;
    }
    const publicUrl = `${window.location.origin}/acompanhar/${encodeURIComponent(user.tenantSlug)}`;
    try {
      const data = await QRCode.toDataURL(publicUrl, {
        margin: 1,
        width: 900,
        errorCorrectionLevel: 'M',
        color: { dark: '#0b1220', light: '#ffffff' },
      });
      setGlobalQr({ url: publicUrl, data });
      printGlobalPoster(data, publicUrl, user.tenantName, win);
    } catch (err) {
      win.close();
      toast(err.message || 'Não foi possível gerar o QR Code.', { type: 'error' });
    }
  };

  const downloadAll = async () => {
    setPdfLoading(true);
    try {
      await downloadAuthenticated(
        `/qrcodes/pdf?baseUrl=${encodeURIComponent(window.location.origin)}`,
        'etiquetas-qrcodes.pdf',
      );
      toast('PDF A4 com todas as etiquetas baixado.', { type: 'success' });
    } catch (err) {
      toast(err.message, { type: 'error' });
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="container qr-page">
      <PageHeader
        title="QR Codes"
        subtitle={`${carts.length} etiqueta(s) de 5 × 5 cm. Cole no equipamento e escaneie pelo app.`}
        eyebrow="Administração"
        actions={
          <Button icon="download" onClick={downloadAll} loading={pdfLoading}>
            Imprimir todos (PDF)
          </Button>
        }
      />

      <section className="global-qr-section">
        <div className="global-qr-section__copy">
          <span className="eyebrow">QR Code para os Pais</span>
          <h2>Acompanhamento sem fila</h2>
          <p>
            Imprima este QR Code e coloque na entrada. Os pais escaneiam, digitam o nome da
            criança e acompanham o tempo pelo celular, sem login.
          </p>
          <span className="global-qr-section__url">
            {user?.tenantSlug ? `/acompanhar/${user.tenantSlug}` : 'Configure o slug do negócio'}
          </span>
        </div>
        <div className="global-qr-section__actions">
          {globalQr ? <img src={globalQr.data} alt="QR Code global para os pais" /> : <Icon name="qr" size={48} />}
          <Button icon="print" onClick={generateGlobalQr} disabled={!user?.tenantSlug}>
            Gerar Pôster / QR Code Global
          </Button>
        </div>
      </section>

      {loading ? (
        <div className="center-pad"><Spinner size={28} /></div>
      ) : error ? (
        <div className="error-panel error-panel--inline"><p>{error}</p><Button size="sm" icon="refresh" onClick={load}>Tentar novamente</Button></div>
      ) : carts.length === 0 ? (
        <EmptyState icon="qr" title="Sem brinquedos para etiquetar" text="Cadastre brinquedos primeiro." />
      ) : (
        <div className="qr-groups">
          {grouped.map((group) => (
            <section key={group.category?.id || 0} className="qr-group">
              <h2 className="qr-group__title" style={{ '--category-color': group.category?.cor }}>
                <span>{group.category?.icone}</span> {group.category?.nome || 'Sem categoria'}
                <small>{group.items.length}</small>
              </h2>
              <div className="qr-grid">
                {group.items.map((cart) => (
                  <article key={cart.id} className="qr-card" style={{ '--category-color': cart.category?.cor }}>
                    <div className="qr-card__label">
                      <img src={qrs[cart.id]} alt={`QR do brinquedo ${cart.codigo}`} />
                      <strong>{cart.codigo}</strong>
                      <span>{cart.category?.icone} {cart.category?.nome}</span>
                      <small>{user?.tenantName}</small>
                    </div>
                    <div className="qr-card__actions">
                      <Button size="sm" variant="secondary" icon="print" onClick={() => printOne(cart)}>Imprimir QR</Button>
                      <Button size="sm" variant="ghost" icon="download" onClick={() => drawLabelPng(cart, user?.tenantName)}>Baixar PNG</Button>
                    </div>
                    <p className="qr-card__hint"><Icon name="scan" size={14} /> /scan/{cart.qrToken.slice(0, 8)}…</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="admin-hint">
        <Icon name="info" size={17} />
        <p>
          O QR contém um token opaco do seu negócio. Se a etiqueta for de outro negócio, o app mostra
          “QR não reconhecido neste negócio”.
        </p>
      </div>

      {printCart && (
        <div className="qr-print-sheet" aria-hidden="true">
          <div className="qr-print-label">
            <img src={qrs[printCart.id]} alt="" />
            <strong>{printCart.codigo}</strong>
            <span>{printCart.category?.icone} {printCart.category?.nome}</span>
            <small>{user?.tenantName}</small>
          </div>
        </div>
      )}
    </div>
  );
}
