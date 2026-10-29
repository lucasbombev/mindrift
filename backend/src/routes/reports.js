import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { getReport } from '../services/cashReports.js';
import { badRequest } from '../utils/errors.js';
import { addDaysKey, localDateKey, parseDateKey, rangeBounds } from '../utils/time.js';

export function createReportsRouter(db) {
  const router = Router();
  router.use(requireAdmin);

  router.get('/summary', (req, res, next) => {
    try {
      const toKey = req.query.to ? String(req.query.to) : localDateKey();
      const fromKey = req.query.from ? String(req.query.from) : addDaysKey(toKey, -6);
      if (!parseDateKey(fromKey) || !parseDateKey(toKey)) throw badRequest('Período inválido.');
      const { start, end } = rangeBounds(fromKey, toKey);
      if (new Date(end) - new Date(start) > 367 * 24 * 60 * 60 * 1000) {
        throw badRequest('O período máximo é de 366 dias.');
      }
      res.json(getReport(db, req.tenantId, fromKey, toKey));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
