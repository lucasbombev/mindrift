import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { config, assertRuntimeDirs } from './config.js';
import {
  seedTenantCategories,
  seedTenantPlans,
  seedTenantSettings,
  seedTenantDefaults,
} from './services/tenants.js';
import { nowIso } from './utils/time.js';

// ---------------------------------------------------------------------------
// Schema final (multi-tenant + categorias + QR + cliente opcional).
// O migrador renomeia as tabelas antigas para *_old antes de executar a parte
// de TABELAS, copia os dados e só então recria os índices.
// ---------------------------------------------------------------------------

const SCHEMA_TABLES = `
CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  slug TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  excluido_em TEXT,
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  nome TEXT NOT NULL,
  slug TEXT NOT NULL,
  icone TEXT,
  cor TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER REFERENCES tenants(id),
  nome TEXT NOT NULL,
  username TEXT NOT NULL COLLATE NOCASE,
  email TEXT,
  telefone TEXT,
  push_enabled INTEGER NOT NULL DEFAULT 1,
  senha_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'operador')),
  ativo INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  token_version INTEGER NOT NULL DEFAULT 1,
  ultimo_login_em TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  CHECK (
    (role = 'superadmin' AND tenant_id IS NULL)
    OR (role IN ('admin', 'operador') AND tenant_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS carts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  codigo TEXT NOT NULL COLLATE NOCASE,
  qr_token TEXT NOT NULL,
  foto_url TEXT,
  capacidade_maxima INTEGER NOT NULL DEFAULT 1 CHECK (capacidade_maxima >= 1),
  status TEXT NOT NULL DEFAULT 'disponivel'
    CHECK (status IN ('disponivel', 'em_uso', 'carregando', 'manutencao')),
  observacao TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  excluido_em TEXT
);

CREATE TABLE IF NOT EXISTS pricing_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  minutos INTEGER NOT NULL CHECK (minutos > 0),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  cart_id INTEGER NOT NULL REFERENCES carts(id),
  cliente_nome TEXT,
  plano_id INTEGER REFERENCES pricing_plans(id) ON DELETE SET NULL,
  plano_nome TEXT NOT NULL,
  minutos_contratados INTEGER NOT NULL CHECK (minutos_contratados >= 0),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
  iniciado_em TEXT NOT NULL,
  fim_previsto_em TEXT,
  encerrado_em TEXT,
  duracao_segundos INTEGER,
  status TEXT NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento', 'encerrada', 'cancelada')),
  pago INTEGER NOT NULL DEFAULT 0,
  forma_pagamento TEXT CHECK (forma_pagamento IN ('dinheiro', 'pix', 'cartao')),
  pagamento_adiantado INTEGER NOT NULL DEFAULT 0,
  valor_adiantado_centavos INTEGER NOT NULL DEFAULT 0,
  forma_adiantado TEXT,
  adiantado_em TEXT,
  operador_id INTEGER NOT NULL REFERENCES users(id),
  observacao TEXT,
  motivo_cancelamento TEXT,
  pago_em TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  excluida_em TEXT,
  excluida_por INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'inicio', 'renovacao', 'encerramento', 'cancelamento',
    'pagamento', 'edicao_valor', 'edicao_cliente', 'exclusao'
  )),
  payload_json TEXT,
  usuario_id INTEGER REFERENCES users(id),
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  chave TEXT NOT NULL,
  valor TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (tenant_id, chave)
);

CREATE TABLE IF NOT EXISTS cash_closures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  data TEXT NOT NULL,
  total_centavos INTEGER NOT NULL,
  total_pendente_centavos INTEGER NOT NULL,
  qtd_sessoes INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES users(id),
  criado_em TEXT NOT NULL,
  UNIQUE (tenant_id, data)
);


CREATE TABLE IF NOT EXISTS cart_status_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  cart_id INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  de TEXT NOT NULL CHECK (de IN ('disponivel', 'em_uso', 'carregando', 'manutencao')),
  para TEXT NOT NULL CHECK (para IN ('disponivel', 'em_uso', 'carregando', 'manutencao')),
  motivo TEXT,
  observacao TEXT,
  usuario_id INTEGER NOT NULL REFERENCES users(id),
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER REFERENCES tenants(id),
  superadmin_id INTEGER NOT NULL REFERENCES users(id),
  admin_id INTEGER REFERENCES users(id),
  tipo TEXT NOT NULL DEFAULT 'impersonation'
    CHECK (tipo IN ('impersonation', 'password_change')),
  motivo TEXT NOT NULL,
  iniciado_em TEXT NOT NULL,
  finalizado_em TEXT,
  ip TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS user_sound_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  som_nome TEXT,
  volume INTEGER NOT NULL DEFAULT 70 CHECK (volume >= 0 AND volume <= 100),
  vibrar INTEGER NOT NULL DEFAULT 1,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS global_announcements (
  id INTEGER PRIMARY KEY,
  mensagem TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'info' CHECK (tipo IN ('info', 'warning', 'success')),
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_por INTEGER REFERENCES users(id),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);


CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`;

const SCHEMA_INDEXES = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_categories_tenant ON categories(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_tenant_slug ON categories(tenant_id, slug COLLATE NOCASE);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
  ON users(lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_codigo_tenant
  ON carts(tenant_id, codigo COLLATE NOCASE) WHERE excluido_em IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_qr_token ON carts(qr_token);
CREATE INDEX IF NOT EXISTS idx_carts_tenant ON carts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_carts_category ON carts(category_id);

CREATE INDEX IF NOT EXISTS idx_plans_tenant ON pricing_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_plans_category ON pricing_plans(category_id);

CREATE INDEX IF NOT EXISTS idx_sessions_ativa_por_carrinho
  ON sessions(cart_id, status) WHERE status = 'em_andamento' AND excluida_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status, iniciado_em);
CREATE INDEX IF NOT EXISTS idx_sessions_cart ON sessions(cart_id);
CREATE INDEX IF NOT EXISTS idx_sessions_cliente ON sessions(cliente_nome COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_sessions_pago_em ON sessions(pago_em);
CREATE INDEX IF NOT EXISTS idx_sessions_adiantado_em ON sessions(adiantado_em);

CREATE INDEX IF NOT EXISTS idx_session_events_tenant ON session_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events(session_id, criado_em);


CREATE INDEX IF NOT EXISTS idx_tenants_excluido ON tenants(excluido_em);
CREATE INDEX IF NOT EXISTS idx_cart_status_events_tenant ON cart_status_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cart_status_events_cart ON cart_status_events(cart_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, iniciado_em);
CREATE INDEX IF NOT EXISTS idx_audit_logs_superadmin ON audit_logs(superadmin_id, iniciado_em);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant ON push_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_cash_closures_tenant ON cash_closures(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_closures_tenant_data
  ON cash_closures(tenant_id, data);
`;

function tableExists(db, name) {
  return Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name),
  );
}

function tableColumns(db, name) {
  return new Set(db.prepare(`PRAGMA table_info(${name})`).all().map((column) => column.name));
}

function createMigrationBackup(db) {
  if (config.dbPath === ':memory:') return null;
  try {
    fs.mkdirSync(config.backupDir, { recursive: true });
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+$/, '')
      .replace('T', '-');
    const target = path.join(config.backupDir, `pre-migration-${stamp}.db`);
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    return target;
  } catch (err) {
    console.error('[migração] Não foi possível criar backup antes da migração:', err.message);
    return null;
  }
}

function migrateLegacy(db) {
  const backup = createMigrationBackup(db);
  if (backup) console.log(`[migração] Backup criado antes da migração: ${backup}`);

  db.pragma('foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    const oldTables = [
      'session_events',
      'sessions',
      'carts',
      'pricing_plans',
      'users',
      'settings',
      'cash_closures',
    ];
    for (const table of oldTables) {
      if (tableExists(db, table)) db.exec(`ALTER TABLE ${table} RENAME TO ${table}_old`);
    }

    db.exec(SCHEMA_TABLES);

    const now = nowIso();
    const tenantInfo = db
      .prepare("INSERT INTO tenants (nome, slug, ativo, criado_em) VALUES ('Meu Negócio', 'default', 1, ?)")
      .run(now);
    const tenantId = Number(tenantInfo.lastInsertRowid);
    seedTenantCategories(db, tenantId);
    const drift = db
      .prepare("SELECT id FROM categories WHERE tenant_id = ? AND slug = 'drift'")
      .get(tenantId);

    // Usuários existentes passam a pertencer ao tenant padrão.
    db.prepare(
      `INSERT INTO users
        (id, tenant_id, nome, username, email, senha_hash, role, ativo,
         must_change_password, token_version, ultimo_login_em, criado_em, atualizado_em)
       SELECT id, ?, nome, username, email, senha_hash, role, ativo,
              must_change_password, token_version, ultimo_login_em, criado_em, atualizado_em
       FROM users_old`,
    ).run(tenantId);

    // Brinquedos recebem categoria Drift e um QR token opaco.
    const oldCarts = db.prepare('SELECT * FROM carts_old').all();
    const insertCart = db.prepare(
      `INSERT INTO carts
        (id, tenant_id, category_id, codigo, qr_token, foto_url, status, observacao,
         criado_em, atualizado_em, excluido_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const cart of oldCarts) {
      insertCart.run(
        cart.id,
        tenantId,
        drift.id,
        cart.codigo,
        crypto.randomUUID(),
        cart.foto_url,
        cart.status,
        cart.observacao,
        cart.criado_em,
        cart.atualizado_em,
        cart.excluido_em,
      );
    }

    db.prepare(
      `INSERT INTO pricing_plans
        (id, tenant_id, category_id, nome, minutos, valor_centavos, ativo, criado_em, atualizado_em)
       SELECT id, ?, NULL, nome, minutos, valor_centavos, ativo, criado_em, atualizado_em
       FROM pricing_plans_old`,
    ).run(tenantId);

    db.prepare(
      `INSERT INTO sessions
        (id, tenant_id, cart_id, cliente_nome, plano_id, plano_nome, minutos_contratados,
         valor_centavos, iniciado_em, fim_previsto_em, encerrado_em, duracao_segundos,
         status, pago, forma_pagamento, pagamento_adiantado, valor_adiantado_centavos,
         forma_adiantado, adiantado_em, operador_id, observacao, motivo_cancelamento,
         pago_em, criado_em, atualizado_em, excluida_em, excluida_por)
       SELECT id, ?, cart_id, cliente_nome, plano_id, plano_nome, minutos_contratados,
              valor_centavos, iniciado_em, fim_previsto_em, encerrado_em, duracao_segundos,
              status, pago, forma_pagamento, pagamento_adiantado, valor_adiantado_centavos,
              forma_adiantado, adiantado_em, operador_id, observacao, motivo_cancelamento,
              pago_em, criado_em, atualizado_em, excluida_em, excluida_por
       FROM sessions_old`,
    ).run(tenantId);

    db.prepare(
      `INSERT INTO session_events
        (id, tenant_id, session_id, tipo, payload_json, usuario_id, criado_em)
       SELECT id, ?, session_id, tipo, payload_json, usuario_id, criado_em
       FROM session_events_old`,
    ).run(tenantId);

    if (tableExists(db, 'settings_old')) {
      db.prepare(
        `INSERT INTO settings (tenant_id, chave, valor, atualizado_em)
         SELECT ?, chave, valor, atualizado_em FROM settings_old`,
      ).run(tenantId);
    }

    if (tableExists(db, 'cash_closures_old')) {
      db.prepare(
        `INSERT INTO cash_closures
          (id, tenant_id, data, total_centavos, total_pendente_centavos, qtd_sessoes,
           payload_json, usuario_id, criado_em)
         SELECT id, ?, data, total_centavos, total_pendente_centavos, qtd_sessoes,
                payload_json, usuario_id, criado_em
         FROM cash_closures_old`,
      ).run(tenantId);
    }

    for (const table of oldTables) {
      if (tableExists(db, `${table}_old`)) db.exec(`DROP TABLE ${table}_old`);
    }

    seedTenantPlans(db, tenantId);
    seedTenantSettings(db, tenantId, 'Meu Negócio');

    db.exec(SCHEMA_INDEXES);
    db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (3, ?)').run(now);
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* noop */
    }
    db.pragma('foreign_keys = ON');
    throw err;
  }
  db.pragma('foreign_keys = ON');
  console.log('[migração] Multi-tenant aplicado com sucesso.');
}


/**
 * v4 — superadmin/sistema, telefone, som e histórico de status.
 * Colunas são adicionadas sem reconstruir tabelas; as novas tabelas vêm de SCHEMA_TABLES.
 */
function migrateV4(db, { makeBackup = true } = {}) {
  const tenantCols = tableColumns(db, 'tenants');
  const userCols = tableColumns(db, 'users');
  const needsColumns = !tenantCols.has('excluido_em') || !userCols.has('telefone');
  if (makeBackup && needsColumns && tableExists(db, 'users')) createMigrationBackup(db);

  if (!tenantCols.has('excluido_em')) db.exec('ALTER TABLE tenants ADD COLUMN excluido_em TEXT');
  if (!userCols.has('telefone')) db.exec('ALTER TABLE users ADD COLUMN telefone TEXT');

  db.exec(SCHEMA_TABLES);
  db.exec(SCHEMA_INDEXES);
  for (const tenant of db.prepare('SELECT id, nome FROM tenants').all()) {
    seedTenantSettings(db, tenant.id, tenant.nome);
  }
  db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (4, ?)').run(nowIso());
  db.pragma('user_version = 4');
}


/**
 * v5 — timer livre (fim_previsto_em nullable / minutos >= 0) e push.
 * A tabela sessions precisa ser reconstruída porque as constraints antigas
 * impediam NULL e 0. O restante é apenas CREATE TABLE IF NOT EXISTS.
 */
function migrateV5(db, { makeBackup = true } = {}) {
  const info = db.prepare('PRAGMA table_info(sessions)').all();
  const fim = info.find((column) => column.name === 'fim_previsto_em');
  const minutes = info.find((column) => column.name === 'minutos_contratados');
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sessions'").get()?.sql || '';
  const needsRebuild = Boolean(fim?.notnull) || /minutos_contratados\s*>\s*0/i.test(sql);
  if (needsRebuild && makeBackup && tableExists(db, 'sessions')) createMigrationBackup(db);

  if (needsRebuild) {
    db.pragma('foreign_keys = OFF');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`
        CREATE TABLE sessions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER NOT NULL REFERENCES tenants(id),
          cart_id INTEGER NOT NULL REFERENCES carts(id),
          cliente_nome TEXT,
          plano_id INTEGER REFERENCES pricing_plans(id) ON DELETE SET NULL,
          plano_nome TEXT NOT NULL,
          minutos_contratados INTEGER NOT NULL CHECK (minutos_contratados >= 0),
          valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
          iniciado_em TEXT NOT NULL,
          fim_previsto_em TEXT,
          encerrado_em TEXT,
          duracao_segundos INTEGER,
          status TEXT NOT NULL DEFAULT 'em_andamento'
            CHECK (status IN ('em_andamento', 'encerrada', 'cancelada')),
          pago INTEGER NOT NULL DEFAULT 0,
          forma_pagamento TEXT CHECK (forma_pagamento IN ('dinheiro', 'pix', 'cartao')),
          pagamento_adiantado INTEGER NOT NULL DEFAULT 0,
          valor_adiantado_centavos INTEGER NOT NULL DEFAULT 0,
          forma_adiantado TEXT,
          adiantado_em TEXT,
          operador_id INTEGER NOT NULL REFERENCES users(id),
          observacao TEXT,
          motivo_cancelamento TEXT,
          pago_em TEXT,
          criado_em TEXT NOT NULL,
          atualizado_em TEXT NOT NULL,
          excluida_em TEXT,
          excluida_por INTEGER REFERENCES users(id)
        )
      `);
      db.exec(`
        INSERT INTO sessions_new
          (id, tenant_id, cart_id, cliente_nome, plano_id, plano_nome, minutos_contratados,
           valor_centavos, iniciado_em, fim_previsto_em, encerrado_em, duracao_segundos,
           status, pago, forma_pagamento, pagamento_adiantado, valor_adiantado_centavos,
           forma_adiantado, adiantado_em, operador_id, observacao, motivo_cancelamento,
           pago_em, criado_em, atualizado_em, excluida_em, excluida_por)
        SELECT id, tenant_id, cart_id, cliente_nome, plano_id, plano_nome, minutos_contratados,
               valor_centavos, iniciado_em, fim_previsto_em, encerrado_em, duracao_segundos,
               status, pago, forma_pagamento, pagamento_adiantado, valor_adiantado_centavos,
               forma_adiantado, adiantado_em, operador_id, observacao, motivo_cancelamento,
               pago_em, criado_em, atualizado_em, excluida_em, excluida_por
        FROM sessions
      `);
      db.exec('DROP TABLE sessions');
      db.exec('ALTER TABLE sessions_new RENAME TO sessions');
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* noop */ }
      db.pragma('foreign_keys = ON');
      throw err;
    }
    db.pragma('foreign_keys = ON');
  }
  db.exec(SCHEMA_TABLES);
  db.exec(SCHEMA_INDEXES);
  db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (5, ?)').run(nowIso());
  db.pragma('user_version = 5');
}


/** v6 — AuditLog de alteração de senha do superadmin (tenant opcional + tipo). */
function migrateV6(db, { makeBackup = true } = {}) {
  const cols = tableColumns(db, 'audit_logs');
  const tenantCol = db.prepare('PRAGMA table_info(audit_logs)').all().find((c) => c.name === 'tenant_id');
  const needsRebuild = Boolean(tenantCol?.notnull) || !cols.has('tipo');
  if (needsRebuild && makeBackup && tableExists(db, 'audit_logs')) createMigrationBackup(db);
  if (needsRebuild) {
    db.pragma('foreign_keys = OFF');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`
        CREATE TABLE audit_logs_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER REFERENCES tenants(id),
          superadmin_id INTEGER NOT NULL REFERENCES users(id),
          admin_id INTEGER REFERENCES users(id),
          tipo TEXT NOT NULL DEFAULT 'impersonation'
            CHECK (tipo IN ('impersonation', 'password_change')),
          motivo TEXT NOT NULL,
          iniciado_em TEXT NOT NULL,
          finalizado_em TEXT,
          ip TEXT,
          user_agent TEXT
        )
      `);
      db.exec(`
        INSERT INTO audit_logs_new
          (id, tenant_id, superadmin_id, admin_id, tipo, motivo, iniciado_em, finalizado_em, ip, user_agent)
        SELECT id, tenant_id, superadmin_id, admin_id, 'impersonation', motivo, iniciado_em,
               finalizado_em, ip, user_agent
        FROM audit_logs
      `);
      db.exec('DROP TABLE audit_logs');
      db.exec('ALTER TABLE audit_logs_new RENAME TO audit_logs');
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* noop */ }
      db.pragma('foreign_keys = ON');
      throw err;
    }
    db.pragma('foreign_keys = ON');
  }
  db.exec(SCHEMA_TABLES);
  db.exec(SCHEMA_INDEXES);
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_tipo ON audit_logs(tipo, iniciado_em)');
  db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (6, ?)').run(nowIso());
  db.pragma('user_version = 6');
}


/** v7 — preferência global de push por usuário (default ativado). */
function migrateV7(db, { makeBackup = true } = {}) {
  const cols = tableColumns(db, 'users');
  if (!cols.has('push_enabled')) {
    if (makeBackup && tableExists(db, 'users')) createMigrationBackup(db);
    db.exec('ALTER TABLE users ADD COLUMN push_enabled INTEGER NOT NULL DEFAULT 1');
  }
  db.exec(SCHEMA_TABLES);
  db.exec(SCHEMA_INDEXES);
  db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (7, ?)').run(nowIso());
  db.pragma('user_version = 7');
}


/** v8 — capacidade coletiva por equipamento (1 = individual, >1 = pula-pula). */
function migrateV8(db, { makeBackup = true } = {}) {
  const cols = tableColumns(db, 'carts');
  if (!cols.has('capacidade_maxima')) {
    if (makeBackup && tableExists(db, 'carts')) createMigrationBackup(db);
    db.exec('ALTER TABLE carts ADD COLUMN capacidade_maxima INTEGER NOT NULL DEFAULT 1');
  }
  db.exec('DROP INDEX IF EXISTS idx_sessions_uma_ativa_por_carrinho');
  db.exec(SCHEMA_TABLES);
  db.exec(SCHEMA_INDEXES);
  db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (8, ?)').run(nowIso());
  db.pragma('user_version = 8');
}

export function ensureDefaultTenant(db) {
  let tenant = db.prepare("SELECT * FROM tenants WHERE slug = 'default'").get();
  if (!tenant) {
    const now = nowIso();
    const info = db
      .prepare("INSERT INTO tenants (nome, slug, ativo, criado_em) VALUES ('Meu Negócio', 'default', 1, ?)")
      .run(now);
    tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(info.lastInsertRowid);
  }
  seedTenantDefaults(db, tenant.id, tenant.nome);
  return tenant;
}

export function openDb(filePath = config.dbPath) {
  if (filePath !== ':memory:') {
    assertRuntimeDirs();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  const usersExist = tableExists(db, 'users');
  const legacy = usersExist && !tableColumns(db, 'users').has('tenant_id');

  if (!legacy) {
    db.exec(SCHEMA_TABLES);
    migrateV4(db, { makeBackup: usersExist });
    migrateV5(db, { makeBackup: usersExist });
    migrateV6(db, { makeBackup: usersExist });
    migrateV7(db, { makeBackup: usersExist });
    migrateV8(db, { makeBackup: usersExist });
    ensureDefaultTenant(db);
  } else {
    migrateLegacy(db);
    ensureDefaultTenant(db);
    migrateV4(db, { makeBackup: false });
    migrateV5(db, { makeBackup: false });
    migrateV6(db, { makeBackup: false });
    migrateV7(db, { makeBackup: false });
    migrateV8(db, { makeBackup: false });
  }

  return db;
}

export function getSetting(db, tenantId, chave, fallback = null) {
  if (!tenantId) return fallback;
  const row = db
    .prepare('SELECT valor FROM settings WHERE tenant_id = ? AND chave = ?')
    .get(tenantId, chave);
  return row ? row.valor : fallback;
}

export function setSetting(db, tenantId, chave, valor) {
  db.prepare(
    `INSERT INTO settings (tenant_id, chave, valor, atualizado_em) VALUES (?, ?, ?, ?)
     ON CONFLICT(tenant_id, chave) DO UPDATE SET valor = excluded.valor,
       atualizado_em = excluded.atualizado_em`,
  ).run(tenantId, chave, String(valor), nowIso());
}

export function getSettings(db, tenantId) {
  const rows = db
    .prepare('SELECT chave, valor FROM settings WHERE tenant_id = ?')
    .all(tenantId);
  return Object.fromEntries(rows.map((row) => [row.chave, row.valor]));
}
