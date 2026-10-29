import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { buildLabelsPdf, normalizeBaseUrl } from '../services/qrcodes.js';

export function createQrcodesRouter(db) {
  const router = Router();
  router.use(requireAdmin);

  router.get('/pdf', async (req, res, next) => {
    try {
      const baseUrl = normalizeBaseUrl(req.query.baseUrl, req);
      const tenant = db.prepare('SELECT nome FROM tenants WHERE id = ?').get(req.tenantId);
      const carts = db
        .prepare(
          `SELECT c.codigo, c.qr_token, cat.nome AS category_nome
           FROM carts c JOIN categories cat ON cat.id = c.category_id
           WHERE c.tenant_id = ? AND c.excluido_em IS NULL
           ORDER BY cat.nome COLLATE NOCASE, c.codigo COLLATE NOCASE`,
        )
        .all(req.tenantId);
      const pdf = await buildLabelsPdf({
        tenantName: tenant?.nome || '',
        carts,
        baseUrl,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="etiquetas-qrcodes.pdf"');
      res.setHeader('Cache-Control', 'no-store');
      res.send(pdf);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
