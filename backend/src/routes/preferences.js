import { Router } from 'express';
import { z } from 'zod';
import { getSetting } from '../db.js';
import { badRequest } from '../utils/errors.js';
import { nowIso } from '../utils/time.js';

export const SOUND_NAMES = ['beep', 'sino', 'alarme', 'bipe-duplo', 'apito', 'campainha'];

const schema = z.object({
  som_nome: z.enum(SOUND_NAMES).nullable().optional(),
  volume: z.coerce.number().int().min(0).max(100).optional(),
  vibrar: z.boolean().optional(),
});

function getRow(db, userId) {
  return db.prepare('SELECT * FROM user_sound_preferences WHERE user_id = ?').get(userId);
}

export function soundPreferences(db, tenantId, userId) {
  const row = getRow(db, userId);
  return {
    somNome: row?.som_nome || null,
    volume: row?.volume ?? 70,
    vibrar: row ? Boolean(row.vibrar) : true,
    tenant: {
      somFim: getSetting(db, tenantId, 'som_fim', 'alarme'),
      alertLeadSeconds: Number(getSetting(db, tenantId, 'alert_lead_seconds', '60')) || 0,
      repetir: getSetting(db, tenantId, 'som_repetir', '1') === '1',
    },
    sons: SOUND_NAMES,
  };
}

export function createPreferencesRouter(db) {
  const router = Router();

  router.get('/sound', (req, res) => {
    res.json(soundPreferences(db, req.tenantId, req.user.id));
  });

  router.patch('/sound', (req, res, next) => {
    try {
      const body = schema.parse(req.body);
      const current = getRow(db, req.user.id);
      const somNome = body.som_nome === undefined ? current?.som_nome ?? null : body.som_nome;
      const volume = body.volume === undefined ? current?.volume ?? 70 : body.volume;
      const vibrar = body.vibrar === undefined ? (current ? Boolean(current.vibrar) : true) : body.vibrar;
      if (!Number.isInteger(Number(volume)) || Number(volume) < 0 || Number(volume) > 100) {
        throw badRequest('Volume inválido.');
      }
      db.prepare(
        `INSERT INTO user_sound_preferences (user_id, som_nome, volume, vibrar, atualizado_em)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET som_nome = excluded.som_nome,
           volume = excluded.volume, vibrar = excluded.vibrar, atualizado_em = excluded.atualizado_em`,
      ).run(req.user.id, somNome, Number(volume), vibrar ? 1 : 0, nowIso());
      res.json(soundPreferences(db, req.tenantId, req.user.id));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
