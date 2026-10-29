import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { closeCash, getCashSummary, listClosures } from '../services/cashReports.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { localDateKey, parseDateKey } from '../utils/time.js';

const closeSchema = z.object({
  data: z.string().optional(),
  observacao: z.string().trim().max(300).optional().nullable(),
});

export function createCashRouter(db) {
  const router = Router();
  router.use(requireAdmin);

  router.get('/summary', (req, res, next) => {
    try {
      const dateKey = req.query.data ? String(req.query.data) : localDateKey();
      if (!parseDateKey(dateKey)) throw badRequest('Data inválida.');
      res.json(getCashSummary(db, req.tenantId, dateKey));
    } catch (err) {
      next(err);
    }
  });

  router.post('/close', (req, res, next) => {
    try {
      const body = closeSchema.parse(req.body ?? {});
      const dateKey = body.data || localDateKey();
      if (!parseDateKey(dateKey)) throw badRequest('Data inválida.');
      if (dateKey > localDateKey()) throw badRequest('Não é possível fechar um caixa futuro.');
      const existing = db.prepare('SELECT id FROM cash_closures WHERE tenant_id = ? AND data = ?').get(req.tenantId, dateKey);
      if (existing) throw conflict('O caixa desta data já foi fechado.', 'caixa_ja_fechado');
      const closure = closeCash(db, req.tenantId, dateKey, body.observacao, req.user);
      req.app.locals.broadcast?.(req.tenantId);
      res.status(201).json({ fechamento: closure });
    } catch (err) {
      next(err);
    }
  });

  router.get('/closures', (req, res) => {
    res.json({ items: listClosures(db, req.tenantId) });
  });

  router.get('/closures/:id', (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = db
        .prepare(
          `SELECT cc.*, u.nome AS usuario_nome FROM cash_closures cc
           LEFT JOIN users u ON u.id = cc.usuario_id WHERE cc.id = ? AND cc.tenant_id = ?`,
        )
        .get(id, req.tenantId);
      if (!row) throw notFound('Fechamento não encontrado.');
      res.json({
        item: {
          id: row.id,
          data: row.data,
          totalCentavos: row.total_centavos,
          totalPendenteCentavos: row.total_pendente_centavos,
          qtdSessoes: row.qtd_sessoes,
          criadoEm: row.criado_em,
          usuarioNome: row.usuario_nome,
          payload: JSON.parse(row.payload_json),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
