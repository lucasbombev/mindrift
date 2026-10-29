-- ============================================================================
-- Drift Rent — migração estrutural 001: multi-tenant + categorias + QR + cliente opcional
-- ============================================================================
-- IMPORTANTE
--   * Este arquivo é o schema final de referência. O runner automático em
--     backend/src/db.js aplica a cópia dos dados legados e registra a versão em
--     schema_migrations; ele detecta users.tenant_id e NÃO reaplica a migração.
--     Portanto, rodar "npm start" ou "npm run seed" várias vezes é idempotente.
--   * Em banco legado, o migrador:
--       1. cria um backup VACUUM INTO em backend/backups/pre-migration-*.db;
--       2. renomeia as tabelas antigas para *_old;
--       3. cria este schema;
--       4. cria o tenant "Meu Negócio" (slug default);
--       5. copia usuários, carrinhos, planos, sessões, eventos, ajustes e caixas;
--       6. preenche categoria Drift, qr_token UUID v4 e tenant_id;
--       7. recria todos os índices e valida foreign_key_check.
--   * Não execute este SQL manualmente em um banco legado sem antes ler
--     backend/migrations/MIGRACAO.md. O caminho recomendado é "npm start".
-- ============================================================================

CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  slug TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
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
  minutos_contratados INTEGER NOT NULL CHECK (minutos_contratados > 0),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
  iniciado_em TEXT NOT NULL,
  fim_previsto_em TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_uma_ativa_por_carrinho
  ON sessions(cart_id) WHERE status = 'em_andamento' AND excluida_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status, iniciado_em);
CREATE INDEX IF NOT EXISTS idx_sessions_cart ON sessions(cart_id);
CREATE INDEX IF NOT EXISTS idx_sessions_cliente ON sessions(cliente_nome COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_sessions_pago_em ON sessions(pago_em);
CREATE INDEX IF NOT EXISTS idx_sessions_adiantado_em ON sessions(adiantado_em);

CREATE INDEX IF NOT EXISTS idx_session_events_tenant ON session_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events(session_id, criado_em);

CREATE INDEX IF NOT EXISTS idx_cash_closures_tenant ON cash_closures(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_closures_tenant_data
  ON cash_closures(tenant_id, data);

-- ============================================================================
-- Dados semeados (o runner faz o mesmo em transação):
--   tenants: 'Meu Negócio' / 'default'
--   categories: Drift 🏎️, Kart 🏁, Patinete 🛴, Quadriciclo 🏍️
--   pricing_plans: 5 min, 10 min, 15 min globais (category_id NULL)
--   settings: alert_lead_seconds=60, nome_estabelecimento='Meu Negócio'
--   superadmin: criado no seed assíncrono (SUPERADMIN_*), com troca obrigatória
-- ============================================================================
