-- ============================================================================
-- Mindrift — migração 005 (v7): push ativado por padrão
-- ============================================================================
-- Cada usuário começa com push_enabled = 1. O soft prompt pós-login só aparece
-- quando o navegador está em Notification.permission === 'default'.
-- A inscrição real continua em push_subscriptions (uma por dispositivo).
-- ============================================================================

ALTER TABLE users ADD COLUMN push_enabled INTEGER NOT NULL DEFAULT 1;

-- GET /api/push/status?endpoint=<endpoint do dispositivo>
-- retorna { ativo, inscricoes, configurado, pushEnabled }.
-- PATCH /api/push/preferences { enabled: boolean } registra "Agora não"/toggle.
-- POST /api/push/subscribe marca push_enabled=1.
-- DELETE /api/push/unsubscribe remove a inscrição e marca push_enabled=0.
