import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { getSettings, setSetting } from '../db.js';
import {
  createBackup,
  listBackups,
  resolveBackupPath,
} from '../services/backup.js';
import { getSystemInfo } from '../services/system.js';
import { badRequest } from '../utils/errors.js';

const settingsSchema = z.object({
  alert_lead_seconds: z.coerce.number().int().min(0).max(600).optional(),
  nome_estabelecimento: z.string().trim().min(1).max(60).optional(),
});

export function createSettingsRouter(db) {
  const router = Router();
  router.use(requireAdmin);

  router.get('/', (_req, res) => {
    res.json({ settings: getSettings(db) });
  });

  router.patch('/', (req, res, next) => {
    try {
      const body = settingsSchema.parse(req.body);
      if (body.alert_lead_seconds !== undefined) {
        setSetting(db, 'alert_lead_seconds', String(body.alert_lead_seconds));
      }
      if (body.nome_estabelecimento !== undefined) {
        setSetting(db, 'nome_estabelecimento', body.nome_estabelecimento);
      }
      req.app.locals.broadcast?.();
      res.json({ settings: getSettings(db) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/system', (_req, res) => {
    res.json(getSystemInfo(db));
  });

  router.get('/backups', (_req, res) => {
    res.json({ items: listBackups() });
  });

  router.post('/backups', async (req, res, next) => {
    try {
      const backup = await createBackup(db, { prefix: 'manual' });
      res.status(201).json({ backup });
    } catch (err) {
      next(err);
    }
  });

  router.get('/backups/:filename/download', (req, res, next) => {
    try {
      const filePath = resolveBackupPath(String(req.params.filename));
      if (!filePath) throw badRequest('Backup não encontrado.');
      res.download(filePath, path.basename(filePath));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
