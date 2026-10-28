import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { notFound } from '../utils/errors.js';
import { nowIso } from '../utils/time.js';

const planSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do plano.').max(40),
  minutos: z.coerce.number().int().min(1, 'Mínimo de 1 minuto.').max(1440),
  valor_centavos: z.coerce.number().int().min(0).max(1_000_000),
  ativo: z.boolean().optional(),
});

const updateSchema = planSchema.partial();

function serialize(row) {
  return {
    id: row.id,
    nome: row.nome,
    minutos: row.minutos,
    valorCentavos: row.valor_centavos,
    ativo: Boolean(row.ativo),
    criadoEm: row.criado_em,
  };
}

export function createPlansRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const todos = req.query.todos === '1' && req.user.role === 'admin';
    const rows = db
      .prepare(
        `SELECT * FROM pricing_plans ${todos ? '' : 'WHERE ativo = 1'}
         ORDER BY minutos ASC, id ASC`,
      )
      .all();
    res.json({ items: rows.map(serialize) });
  });

  router.post('/', requireAdmin, (req, res, next) => {
    try {
      const body = planSchema.parse(req.body);
      const now = nowIso();
      const info = db
        .prepare(
          `INSERT INTO pricing_plans (nome, minutos, valor_centavos, ativo, criado_em, atualizado_em)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(body.nome, body.minutos, body.valor_centavos, body.ativo === false ? 0 : 1, now, now);
      const row = db.prepare('SELECT * FROM pricing_plans WHERE id = ?').get(info.lastInsertRowid);
      res.status(201).json({ item: serialize(row) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', requireAdmin, (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = db.prepare('SELECT * FROM pricing_plans WHERE id = ?').get(id);
      if (!row) throw notFound('Plano não encontrado.');
      const body = updateSchema.parse(req.body);
      const fields = [];
      const params = [];
      if (body.nome !== undefined) {
        fields.push('nome = ?');
        params.push(body.nome);
      }
      if (body.minutos !== undefined) {
        fields.push('minutos = ?');
        params.push(body.minutos);
      }
      if (body.valor_centavos !== undefined) {
        fields.push('valor_centavos = ?');
        params.push(body.valor_centavos);
      }
      if (body.ativo !== undefined) {
        fields.push('ativo = ?');
        params.push(body.ativo ? 1 : 0);
      }
      if (!fields.length) return res.json({ item: serialize(row) });
      fields.push('atualizado_em = ?');
      params.push(nowIso());
      db.prepare(`UPDATE pricing_plans SET ${fields.join(', ')} WHERE id = ?`).run(...params, id);
      res.json({
        item: serialize(db.prepare('SELECT * FROM pricing_plans WHERE id = ?').get(id)),
      });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', requireAdmin, (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = db.prepare('SELECT * FROM pricing_plans WHERE id = ?').get(id);
      if (!row) throw notFound('Plano não encontrado.');
      const usage = db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE plano_id = ?').get(id).n;
      if (usage > 0) {
        db.prepare('UPDATE pricing_plans SET ativo = 0, atualizado_em = ? WHERE id = ?').run(
          nowIso(),
          id,
        );
        return res.json({
          ok: true,
          desativado: true,
          mensagem: 'Plano possui histórico de sessões e foi desativado em vez de excluído.',
        });
      }
      db.prepare('DELETE FROM pricing_plans WHERE id = ?').run(id);
      res.json({ ok: true, desativado: false });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
