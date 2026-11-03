-- ============================================================================
-- Mindrift — migração 006 (v8): equipamentos coletivos
-- ============================================================================
-- capacidade_maxima = 1 para carrinhos de drift; >1 para pula-pula/infláveis.
-- O status "lotado" é derivado (ocupação >= capacidade), não gravado no CHECK.
-- A antiga unicidade de uma sessão ativa por carrinho é removida para permitir
-- sessões paralelas em equipamentos coletivos.
-- ============================================================================

ALTER TABLE carts ADD COLUMN capacidade_maxima INTEGER NOT NULL DEFAULT 1;

DROP INDEX IF EXISTS idx_sessions_uma_ativa_por_carrinho;

CREATE INDEX IF NOT EXISTS idx_sessions_ativa_por_carrinho
  ON sessions(cart_id, status) WHERE status = 'em_andamento' AND excluida_em IS NULL;
