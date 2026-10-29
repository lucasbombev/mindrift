import { hashPassword } from './auth.js';
import { conflict, badRequest, notFound } from '../utils/errors.js';
import { nowIso } from '../utils/time.js';
import { normalizePhoneBR } from '../utils/phone.js';

export const DEFAULT_CATEGORIES = [
  { nome: 'Drift', slug: 'drift', icone: '🏎️', cor: '#f97316' },
  { nome: 'Kart', slug: 'kart', icone: '🏁', cor: '#2563eb' },
  { nome: 'Patinete', slug: 'patinete', icone: '🛴', cor: '#16a34a' },
  { nome: 'Quadriciclo', slug: 'quadriciclo', icone: '🏍️', cor: '#7c3aed' },
];

export const DEFAULT_PLANS = [
  { nome: '5 min', minutos: 5, valor_centavos: 500 },
  { nome: '10 min', minutos: 10, valor_centavos: 800 },
  { nome: '15 min', minutos: 15, valor_centavos: 1000 },
];

export function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function uniqueTenantSlug(db, value) {
  const base = slugify(value) || 'negocio';
  let slug = base;
  let suffix = 2;
  while (db.prepare('SELECT id FROM tenants WHERE slug = ? COLLATE NOCASE').get(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

export function getTenantById(db, id) {
  return db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) || null;
}

export function serializeTenant(row) {
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    slug: row.slug,
    ativo: Boolean(row.ativo),
    excluido: Boolean(row.excluido_em),
    excluidoEm: row.excluido_em || null,
    criadoEm: row.criado_em,
  };
}

export function seedTenantCategories(db, tenantId) {
  const now = nowIso();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO categories
      (tenant_id, nome, slug, icone, cor, ativo, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  );
  for (const category of DEFAULT_CATEGORIES) {
    insert.run(tenantId, category.nome, category.slug, category.icone, category.cor, now, now);
  }
  return db.prepare('SELECT * FROM categories WHERE tenant_id = ? ORDER BY id').all(tenantId);
}

export function seedTenantPlans(db, tenantId) {
  const now = nowIso();
  const exists = db.prepare(
    `SELECT id FROM pricing_plans
     WHERE tenant_id = ? AND minutos = ? AND category_id IS NULL LIMIT 1`,
  );
  const insert = db.prepare(
    `INSERT INTO pricing_plans
      (tenant_id, nome, minutos, valor_centavos, ativo, category_id, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, 1, NULL, ?, ?)`,
  );
  for (const plan of DEFAULT_PLANS) {
    if (!exists.get(tenantId, plan.minutos)) {
      insert.run(tenantId, plan.nome, plan.minutos, plan.valor_centavos, now, now);
    }
  }
}

export function seedTenantSettings(db, tenantId, businessName = 'Meu Negócio') {
  const now = nowIso();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO settings (tenant_id, chave, valor, atualizado_em)
     VALUES (?, ?, ?, ?)`,
  );
  insert.run(tenantId, 'alert_lead_seconds', '60', now);
  insert.run(tenantId, 'som_fim', 'alarme', now);
  insert.run(tenantId, 'som_repetir', '1', now);
  insert.run(tenantId, 'nome_estabelecimento', businessName, now);
}

export function seedTenantDefaults(db, tenantId, businessName = 'Meu Negócio') {
  seedTenantCategories(db, tenantId);
  seedTenantPlans(db, tenantId);
  seedTenantSettings(db, tenantId, businessName);
}

function uniqueUsername(db, email) {
  const local = String(email.split('@')[0] || 'admin')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 30) || 'admin';
  let username = local;
  let suffix = 2;
  while (db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username)) {
    username = `${local}${suffix}`;
    suffix += 1;
  }
  return username;
}

function assertEmailAvailable(db, email) {
  const existing = db
    .prepare('SELECT id FROM users WHERE email IS NOT NULL AND lower(email) = lower(?)')
    .get(email);
  if (existing) throw conflict('Este e-mail já está cadastrado.');
}

export async function createTenantWithAdmin(db, input) {
  const nome = String(input.nome || '').trim();
  const adminNome = String(input.adminNome || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const senha = String(input.senha || '');
  const telefone = normalizePhoneBR(input.telefone, { required: true });
  if (nome.length < 2) throw badRequest('Informe o nome do negócio.');
  if (adminNome.length < 2) throw badRequest('Informe o nome do administrador.');
  if (!email || !email.includes('@')) throw badRequest('Informe um e-mail válido.');
  if (senha.length < 8 || !/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha)) {
    throw badRequest('A senha deve ter pelo menos 8 caracteres, com letras e números.');
  }
  assertEmailAvailable(db, email);

  const senhaHash = await hashPassword(senha);
  const now = nowIso();
  const slug = uniqueTenantSlug(db, input.slug || nome);
  const username = uniqueUsername(db, email);

  const run = db.transaction(() => {
    const tenantInfo = db
      .prepare('INSERT INTO tenants (nome, slug, ativo, criado_em) VALUES (?, ?, 1, ?)')
      .run(nome, slug, now);
    const tenantId = Number(tenantInfo.lastInsertRowid);
    seedTenantDefaults(db, tenantId, nome);
    const userInfo = db
      .prepare(
        `INSERT INTO users (tenant_id, nome, username, email, telefone, senha_hash, role, ativo,
           must_change_password, token_version, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, 'admin', 1, 0, 1, ?, ?)`,
      )
      .run(tenantId, adminNome, username, email, telefone, senhaHash, now, now);
    return { tenantId, userId: Number(userInfo.lastInsertRowid) };
  });
  const ids = run();
  return {
    tenant: getTenantById(db, ids.tenantId),
    user: db.prepare('SELECT * FROM users WHERE id = ?').get(ids.userId),
  };
}

export function getTenantOrFail(db, id) {
  const tenant = getTenantById(db, id);
  if (!tenant) throw notFound('Negócio não encontrado.');
  return tenant;
}
