import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { getCategoryById, listCategories, requireCategory } from '../services/categories.js';
import { slugify } from '../services/tenants.js';
import { conflict, notFound } from '../utils/errors.js';
import { nowIso } from '../utils/time.js';

const hex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor hexadecimal, ex.: #f97316.');
const baseSchema = {
  nome: z.string().trim().min(2, 'Informe o nome da categoria.').max(50),
  icone: z.string().trim().min(1).max(16).optional(),
  cor: hex.optional(),
};
const createSchema = z.object(baseSchema);
const updateSchema = z.object({
  nome: baseSchema.nome.optional(),
  icone: baseSchema.icone,
  cor: baseSchema.cor,
  ativo: z.boolean().optional(),
});

function uniqueSlug(db, tenantId, nome, ignoreId = 0) {
  const base = slugify(nome) || 'categoria';
  let slug = base;
  let suffix = 2;
  while (
    db
      .prepare(
        'SELECT id FROM categories WHERE tenant_id = ? AND slug = ? COLLATE NOCASE AND id != ?',
      )
      .get(tenantId, slug, ignoreId)
  ) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

export function createCategoriesRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const includeInactive = req.user.role === 'admin' && req.query.todos === '1';
    res.json({ items: listCategories(db, req.tenantId, { includeInactive }) });
  });

  router.post('/', requireAdmin, (req, res, next) => {
    try {
      const body = createSchema.parse(req.body);
      const now = nowIso();
      const info = db
        .prepare(
          `INSERT INTO categories
            (tenant_id, nome, slug, icone, cor, ativo, criado_em, atualizado_em)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(
          req.tenantId,
          body.nome,
          uniqueSlug(db, req.tenantId, body.nome),
          body.icone || '🏁',
          body.cor || '#f97316',
          now,
          now,
        );
      req.app.locals.broadcast?.(req.tenantId);
      res.status(201).json({ item: listCategories(db, req.tenantId, { includeInactive: true }).find((c) => c.id === Number(info.lastInsertRowid)) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', requireAdmin, (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = getCategoryById(db, req.tenantId, id);
      if (!row) throw notFound('Categoria não encontrada.');
      const body = updateSchema.parse(req.body);
      const nome = body.nome ?? row.nome;
      db.prepare(
        `UPDATE categories SET nome = ?, slug = ?, icone = ?, cor = ?, ativo = ?,
           atualizado_em = ? WHERE id = ? AND tenant_id = ?`,
      ).run(
        nome,
        body.nome && body.nome !== row.nome
          ? uniqueSlug(db, req.tenantId, body.nome, id)
          : row.slug,
        body.icone ?? row.icone,
        body.cor ?? row.cor,
        body.ativo === undefined ? row.ativo : body.ativo ? 1 : 0,
        nowIso(),
        id,
        req.tenantId,
      );
      req.app.locals.broadcast?.(req.tenantId);
      res.json({ item: listCategories(db, req.tenantId, { includeInactive: true }).find((c) => c.id === id) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', requireAdmin, (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = getCategoryById(db, req.tenantId, id);
      if (!row) throw notFound('Categoria não encontrada.');
      const inUse = db
        .prepare('SELECT COUNT(*) AS n FROM carts WHERE tenant_id = ? AND category_id = ?')
        .get(req.tenantId, id).n;
      const planUse = db
        .prepare('SELECT COUNT(*) AS n FROM pricing_plans WHERE tenant_id = ? AND category_id = ?')
        .get(req.tenantId, id).n;
      if (inUse > 0 || planUse > 0) {
        db.prepare('UPDATE categories SET ativo = 0, atualizado_em = ? WHERE id = ? AND tenant_id = ?')
          .run(nowIso(), id, req.tenantId);
        req.app.locals.broadcast?.(req.tenantId);
        return res.json({
          ok: true,
          desativado: true,
          mensagem: 'Categoria possui carrinhos ou planos e foi desativada.',
        });
      }
      db.prepare('DELETE FROM categories WHERE id = ? AND tenant_id = ?').run(id, req.tenantId);
      req.app.locals.broadcast?.(req.tenantId);
      res.json({ ok: true, desativado: false });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
