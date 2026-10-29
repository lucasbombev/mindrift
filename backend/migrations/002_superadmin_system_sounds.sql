-- ============================================================================
-- Drift Rent — migração 002: superadmin/sistema, telefone, sons e status
-- ============================================================================
-- O runner em backend/src/db.js adiciona as colunas via ALTER TABLE apenas se
-- ainda não existirem e cria as tabelas abaixo com IF NOT EXISTS. O backup é
-- feito automaticamente em backend/backups/pre-migration-*.db.
-- O script abaixo é referência do schema final v4.
-- ============================================================================

ALTER TABLE tenants ADD COLUMN excluido_em TEXT;
ALTER TABLE users ADD COLUMN telefone TEXT;

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
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  superadmin_id INTEGER NOT NULL REFERENCES users(id),
  admin_id INTEGER REFERENCES users(id),
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

CREATE INDEX IF NOT EXISTS idx_tenants_excluido ON tenants(excluido_em);
CREATE INDEX IF NOT EXISTS idx_cart_status_events_tenant ON cart_status_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cart_status_events_cart ON cart_status_events(cart_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, iniciado_em);
CREATE INDEX IF NOT EXISTS idx_audit_logs_superadmin ON audit_logs(superadmin_id, iniciado_em);

-- O runner também garante para cada tenant:
--   settings(tenant, 'som_fim', 'alarme')
--   settings(tenant, 'som_repetir', '1')
-- O som é armazenado por usuário em user_sound_preferences (som_nome NULL =
-- herdar o som do tenant; volume 0-100; vibrar 0/1).
