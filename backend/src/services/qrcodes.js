import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';

export function buildScanUrl(baseUrl, token) {
  return `${String(baseUrl).replace(/\/+$/, '')}/scan/${token}`;
}

export function normalizeBaseUrl(value, req) {
  const fallback = req
    ? `${req.protocol}://${req.get('host')}`
    : 'http://localhost:3000';
  const raw = String(value || fallback).trim().slice(0, 500);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    parsed = new URL(fallback);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) parsed = new URL(fallback);
  return `${parsed.protocol}//${parsed.host}`;
}

/**
 * PDF A4 com etiquetas 5x5 cm, 3 colunas x 4 linhas (12 por página).
 */
export async function buildLabelsPdf({ tenantName, carts, baseUrl }) {
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const label = 141.73; // 50 mm
  const gapX = 10;
  const gapY = 10;
  const cols = 3;
  const rows = 4;
  const marginX = (pageWidth - (cols * label + (cols - 1) * gapX)) / 2;
  const marginY = (pageHeight - (rows * label + (rows - 1) * gapY)) / 2;

  for (let index = 0; index < carts.length; index += 1) {
    if (index > 0 && index % (cols * rows) === 0) doc.addPage();
    const slot = index % (cols * rows);
    const col = slot % cols;
    const row = Math.floor(slot / cols);
    const x = marginX + col * (label + gapX);
    const y = marginY + row * (label + gapY);
    const cart = carts[index];
    const url = buildScanUrl(baseUrl, cart.qr_token);
    const qrBuffer = await QRCode.toBuffer(url, {
      type: 'png',
      margin: 1,
      width: 240,
      errorCorrectionLevel: 'M',
    });

    doc.save();
    doc.roundedRect(x, y, label, label, 6).lineWidth(0.8).strokeColor('#cbd5e1').stroke();
    doc.image(qrBuffer, x + (label - 76) / 2, y + 10, { width: 76, height: 76 });
    doc
      .fillColor('#0f172a')
      .font('Helvetica-Bold')
      .fontSize(17)
      .text(cart.codigo, x + 6, y + 91, { width: label - 12, align: 'center' });
    doc
      .fillColor('#475569')
      .font('Helvetica')
      .fontSize(8)
      .text(cart.category_nome || '', x + 6, y + 112, { width: label - 12, align: 'center' });
    doc
      .fillColor('#64748b')
      .fontSize(7)
      .text(tenantName || '', x + 6, y + 125, { width: label - 12, align: 'center' });
    doc.restore();
  }

  if (carts.length === 0) {
    doc.fontSize(14).fillColor('#334155').text('Nenhum carrinho para imprimir.', 40, 60);
  }

  doc.end();
  return done;
}
