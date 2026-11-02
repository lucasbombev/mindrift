-- ============================================================================
-- Mindrift — migração 004 (v6): AuditLog de alteração de senha do superadmin
-- ============================================================================
-- audit_logs passa a aceitar tenant_id NULL (eventos de plataforma, sem tenant)
-- e ganha tipo ('impersonation' | 'password_change').
-- O runner em backend/src/db.js reconstrói a tabela e copia os registros antigos.
-- ============================================================================

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

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, iniciado_em);
CREATE INDEX IF NOT EXISTS idx_audit_logs_superadmin ON audit_logs(superadmin_id, iniciado_em);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tipo ON audit_logs(tipo, iniciado_em);

-- Rota: PUT /api/superadmin/password
-- Requer superadmin autenticado; valida senha atual com bcrypt, exige nova >= 6,
-- e insere audit_logs(tipo='password_change', tenant_id=NULL, superadmin_id).
