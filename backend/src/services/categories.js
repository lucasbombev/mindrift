import { badRequest, notFound } from '../utils/errors.js';
import { slugify } from './tenants.js';

export function serializeCategory(row) {
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    slug: row.slug,
    icone: row.icone || '🏁',
    cor: row.cor || '#f97316',
    ativo: Boolean(row.ativo),
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

export function listCategories(db, tenantId, { includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'AND ativo = 1';
  return db
    .prepare(
      `SELECT * FROM categories WHERE tenant_id = ? ${where}
       ORDER BY ativo DESC, nome COLLATE NOCASE`,
    )
    .all(tenantId)
    .map(serializeCategory);
}

export function getCategoryById(db, tenantId, id) {
  return db.prepare('SELECT * FROM categories WHERE id = ? AND tenant_id = ?').get(id, tenantId);
}

export function requireCategory(db, tenantId, id, { activeOnly = false } = {}) {
  const row = getCategoryById(db, tenantId, Number(id));
  if (!row) throw notFound('Categoria não encontrada.');
  if (activeOnly && !row.ativo) throw badRequest('Categoria inativa.');
  return row;
}
