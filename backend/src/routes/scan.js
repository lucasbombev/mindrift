import { Router } from 'express';
import { serializeCart } from '../services/dashboard.js';
import { getSessionById } from '../services/sessions.js';
import { notFound } from '../utils/errors.js';

function scanResponse(db, tenantId, cart) {
  const active = db
    .prepare(
      `SELECT id FROM sessions WHERE tenant_id = ? AND cart_id = ?
       AND status = 'em_andamento' AND excluida_em IS NULL`,
    )
    .get(tenantId, cart.id);
  const tenant = db.prepare('SELECT nome, slug FROM tenants WHERE id = ?').get(tenantId);
  return {
    serverNow: new Date().toISOString(),
    tenant: { id: tenantId, nome: tenant?.nome || null, slug: tenant?.slug || null },
    cart: serializeCart(cart),
    activeSession: active ? getSessionById(db, tenantId, active.id) : null,
  };
}

const CART_SELECT = `
  SELECT c.*, cat.nome AS category_nome, cat.slug AS category_slug,
         cat.icone AS category_icone, cat.cor AS category_cor, cat.ativo AS category_ativo
  FROM carts c JOIN categories cat ON cat.id = c.category_id
`;

export function createScanRouter(db) {
  const router = Router();

  router.get('/code/:codigo', (req, res, next) => {
    try {
      const cart = db
        .prepare(
          `${CART_SELECT}
           WHERE c.tenant_id = ? AND c.codigo = ? COLLATE NOCASE AND c.excluido_em IS NULL`,
        )
        .get(req.tenantId, String(req.params.codigo).trim());
      if (!cart) throw notFound('Carrinho não encontrado neste negócio.');
      res.json(scanResponse(db, req.tenantId, cart));
    } catch (err) {
      next(err);
    }
  });

  router.get('/:qrToken', (req, res, next) => {
    try {
      const cart = db
        .prepare(
          `${CART_SELECT}
           WHERE c.tenant_id = ? AND c.qr_token = ? AND c.excluido_em IS NULL`,
        )
        .get(req.tenantId, String(req.params.qrToken));
      if (!cart) throw notFound('QR não reconhecido neste negócio.');
      res.json(scanResponse(db, req.tenantId, cart));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
