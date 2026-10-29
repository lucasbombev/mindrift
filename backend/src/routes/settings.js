import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { getSettings, setSetting } from '../db.js';

const settingsSchema = z.object({
  alert_lead_seconds: z.coerce.number().int().min(0).max(600).optional(),
  som_fim: z.enum(['beep', 'sino', 'alarme', 'bipe-duplo', 'apito', 'campainha']).optional(),
  som_repetir: z.boolean().optional(),
  nome_estabelecimento: z.string().trim().min(1).max(60).optional(),
});

export function createSettingsRouter(db) {
  const router = Router();
  router.use(requireAdmin);

  router.get('/', (req, res) => {
    res.json({ settings: getSettings(db, req.tenantId) });
  });

  router.patch('/', (req, res, next) => {
    try {
      const body = settingsSchema.parse(req.body);
      if (body.alert_lead_seconds !== undefined) {
        setSetting(db, req.tenantId, 'alert_lead_seconds', String(body.alert_lead_seconds));
      }
      if (body.nome_estabelecimento !== undefined) {
        setSetting(db, req.tenantId, 'nome_estabelecimento', body.nome_estabelecimento);
      }
      if (body.som_fim !== undefined) {
        setSetting(db, req.tenantId, 'som_fim', body.som_fim);
      }
      if (body.som_repetir !== undefined) {
        setSetting(db, req.tenantId, 'som_repetir', body.som_repetir ? '1' : '0');
      }
      req.app.locals.broadcast?.(req.tenantId);
      res.json({ settings: getSettings(db, req.tenantId) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
