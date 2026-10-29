import crypto from 'node:crypto';
import { openDb, ensureDefaultTenant } from './db.js';
import { config } from './config.js';
import { hashPassword } from './services/auth.js';
import { nowIso } from './utils/time.js';

const SAMPLE_CARTS = [
  { codigo: 'C01', status: 'disponivel', categoria: 'drift' },
  { codigo: 'C02', status: 'disponivel', categoria: 'drift' },
  { codigo: 'C03', status: 'carregando', categoria: 'kart' },
  { codigo: 'C04', status: 'manutencao', categoria: 'patinete' },
];

async function ensureSuperadmin(db, log) {
  const existing = db.prepare("SELECT id FROM users WHERE role = 'superadmin' LIMIT 1").get();
  if (existing) return { created: false };
  const now = nowIso();
  const hash = await hashPassword(config.superadminPassword);
  db.prepare(
    `INSERT INTO users (tenant_id, nome, username, email, senha_hash, role, ativo,
       must_change_password, token_version, criado_em, atualizado_em)
     VALUES (NULL, ?, ?, ?, ?, 'superadmin', 1, 1, 1, ?, ?)`,
  ).run(
    config.superadminName,
    config.superadminUsername,
    config.superadminEmail || null,
    hash,
    now,
    now,
  );
  log.info?.(
    `[seed] Superadmin criado: ${config.superadminUsername} / ${config.superadminPassword} (troca obrigatória).`,
  );
  return { created: true };
}

export async function seedDatabase(db, { log = console } = {}) {
  const tenant = ensureDefaultTenant(db);
  const superadmin = await ensureSuperadmin(db, log);

  const defaultUsers = db
    .prepare('SELECT COUNT(*) AS n FROM users WHERE tenant_id = ?')
    .get(tenant.id).n;
  if (defaultUsers > 0) {
    return {
      created: false,
      reason: 'Banco já possui usuários.',
      tenantId: tenant.id,
      superadminCreated: superadmin.created,
    };
  }

  const now = nowIso();
  const senhaHash = await hashPassword('admin123');
  const categories = db.prepare('SELECT * FROM categories WHERE tenant_id = ?').all(tenant.id);
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));

  const run = db.transaction(() => {
    const admin = db
      .prepare(
        `INSERT INTO users (tenant_id, nome, username, email, senha_hash, role, ativo,
           must_change_password, token_version, criado_em, atualizado_em)
         VALUES (?, ?, ?, NULL, ?, 'admin', 1, 1, 1, ?, ?)`,
      )
      .run(tenant.id, 'Administrador', 'admin', senhaHash, now, now);

    const insertCart = db.prepare(
      `INSERT INTO carts
        (tenant_id, category_id, codigo, qr_token, foto_url, status, observacao, criado_em, atualizado_em)
       VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, ?)`,
    );
    for (const cart of SAMPLE_CARTS) {
      const category = categoryBySlug.get(cart.categoria) || categories[0];
      insertCart.run(
        tenant.id,
        category.id,
        cart.codigo,
        crypto.randomUUID(),
        cart.status,
        now,
        now,
      );
    }

    return { adminId: Number(admin.lastInsertRowid) };
  });

  const result = run();
  log.info?.('[seed] Dados iniciais criados para o tenant default.');
  log.info?.('[seed] Login: admin / admin123 (troca de senha obrigatória no primeiro acesso).');
  return {
    created: true,
    adminId: result.adminId,
    tenantId: tenant.id,
    credentials: { username: 'admin', password: 'admin123' },
    carts: SAMPLE_CARTS.length,
    superadminCreated: superadmin.created,
  };
}

const isMain = process.argv[1] && process.argv[1].endsWith('seed.js');
if (isMain) {
  const db = openDb(config.dbPath);
  seedDatabase(db)
    .then((result) => {
      if (!result.created) console.log(`[seed] Nada a fazer: ${result.reason}`);
      db.close();
    })
    .catch((err) => {
      console.error('[seed] Erro:', err);
      process.exitCode = 1;
      db.close();
    });
}
