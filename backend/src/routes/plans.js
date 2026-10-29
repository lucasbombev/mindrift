import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { requireCategory } from '../services/categories.js';
import { notFound } from '../utils/errors.js';
import { nowIso } from '../utils/time.js';

const planSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do plano.').max(40),
  minutos: z.coerce.number().int().min(1, 'Mínimo de 1 minuto.').max(1440),
  valor_centavos: z.coerce.number().int().min(0).max(1_000_000),
  category_id: z.coerce.number().int().positive().nullable().optional(),
  ativo: z.boolean().optional(),
});

const updateSchema = planSchema.partial();

function serialize(row) {
  return {
    id: row.id,
    nome: row.nome,
    minutos: row.minutos,
    valorCentavos: row.valor_centavos,
    categoryId: row.category_id ?? null,
    categoryNome: row.category_nome || null,
    categoryIcone: row.category_icone || null,
    categoryCor: row.category_cor || null,
    ativo: Boolean(row.ativo),
    criadoEm: row.criado_em,
  };
}

const PLAN_SELECT = `
  SELECT p.*, c.nome AS category_nome, c.icone AS category_icone, c.cor AS category_cor
  FROM pricing_plans p
  LEFT JOIN categories c ON c.id = p.category_id
`;

function getPlan(db, tenantId, id) {
  return db.prepare(`${PLAN_SELECT} WHERE p.id = ? AND p.tenant_id = ?`).get(id, tenantId);
}

export function createPlansRouter(db) {
  const router = Router();

  router.get('/', (req, res, next) => {
    try {
      const todos = req.query.todos === '1' && req.user.role === 'admin';
      const conditions = ['p.tenant_id = ?'];
      const params = [req.tenantId];
      if (!todos) conditions.push('p.ativo = 1');
      if (req.query.categoryId !== undefined && req.query.categoryId !== '') {
        const category = requireCategory(db, req.tenantId, req.query.categoryId);
        conditions.push('(p.category_id IS NULL OR p.category_id = ?)');
        params.push(category.id);
      }
      const rows = db
        .prepare(
          `${PLAN_SELECT} WHERE ${conditions.join(' AND ')}
           ORDER BY p.minutos ASC, p.id ASC`,
        )
        .all(...params);
      res.json({ items: rows.map(serialize) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requireAdmin, (req, res, next) => {
    try {
      const body = planSchema.parse(req.body);
      if (body.category_id) requireCategory(db, req.tenantId, body.category_id, { activeOnly: true });
      const now = nowIso();
      const info = db
        .prepare(
          `INSERT INTO pricing_plans
            (tenant_id, category_id, nome, minutos, valor_centavos, ativo, criado_em, atualizado_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          req.tenantId,
          body.category_id || null,
          body.nome,
          body.minutos,
          body.valor_centavos,
          body.ativo === false ? 0 : 1,
          now,
          now,
        );
      res.status(201).json({ item: serialize(getPlan(db, req.tenantId, Number(info.lastInsertRowid))) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', requireAdmin, (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = getPlan(db, req.tenantId, id);
      if (!row) throw notFound('Plano não encontrado.');
      const body = updateSchema.parse(req.body);
      if (body.category_id) {
        const category = requireCategory(db, req.tenantId, body.category_id);
        if (Number(category.id) !== Number(row.category_id) && !category.ativo) {
          throw badRequest('Escolha uma categoria ativa.');
        }
      }
      const fields = [];
      const params = [];
      for (const [column, value] of [
        ['nome', body.nome],
        ['minutos', body.minutos],
        ['valor_centavos', body.valor_centavos],
      ]) {
        if (value !== undefined) {
          fields.push(`${column} = ?`);
          params.push(value);
        }
      }
      if (body.category_id !== undefined) {
        fields.push('category_id = ?');
        params.push(body.category_id || null);
      }
      if (body.ativo !== undefined) {
        fields.push('ativo = ?');
        params.push(body.ativo ? 1 : 0);
      }
      if (!fields.length) return res.json({ item: serialize(row) });
      fields.push('atualizado_em = ?');
      params.push(nowIso());
      db.prepare(`UPDATE pricing_plans SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`).run(
        ...params,
        id,
        req.tenantId,
      );
      res.json({ item: serialize(getPlan(db, req.tenantId, id)) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', requireAdmin, (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = getPlan(db, req.tenantId, id);
      if (!row) throw notFound('Plano não encontrado.');
      const usage = db
        .prepare('SELECT COUNT(*) AS n FROM sessions WHERE tenant_id = ? AND plano_id = ?')
        .get(req.tenantId, id).n;
      if (usage > 0) {
        db.prepare(
          'UPDATE pricing_plans SET ativo = 0, atualizado_em = ? WHERE id = ? AND tenant_id = ?',
        ).run(nowIso(), id, req.tenantId);
        return res.json({
          ok: true,
          desativado: true,
          mensagem: 'Plano possui histórico de sessões e foi desativado em vez de excluído.',
        });
      }
      db.prepare('DELETE FROM pricing_plans WHERE id = ? AND tenant_id = ?').run(id, req.tenantId);
      res.json({ ok: true, desativado: false });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
