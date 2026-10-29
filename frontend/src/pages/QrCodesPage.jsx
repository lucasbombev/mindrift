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

      {loading ? (
        <div className="center-pad"><Spinner size={28} /></div>
      ) : error ? (
        <div className="error-panel error-panel--inline"><p>{error}</p><Button size="sm" icon="refresh" onClick={load}>Tentar novamente</Button></div>
      ) : carts.length === 0 ? (
        <EmptyState icon="qr" title="Sem carrinhos para etiquetar" text="Cadastre carrinhos primeiro." />
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
                      <img src={qrs[cart.id]} alt={`QR do carrinho ${cart.codigo}`} />
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
