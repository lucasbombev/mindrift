-- ============================================================================
-- Mindrift — migração 003 (v5): timer livre + Web Push
-- ============================================================================
-- A tabela sessions precisa ser reconstruída porque a versão anterior tinha
-- minutos_contratados > 0 e fim_previsto_em NOT NULL. O runner em
-- backend/src/db.js faz backup, cria sessions_new, copia, troca e recria índices.
-- ============================================================================

-- Estrutura final relevante de sessions:
--   minutos_contratados INTEGER NOT NULL CHECK (minutos_contratados >= 0)
--   fim_previsto_em TEXT NULL
-- (demais colunas permanecem iguais)

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant ON push_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- O runner registra schema_migrations(version=5) e PRAGMA user_version=5.
