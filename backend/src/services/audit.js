import { nowIso } from '../utils/time.js';

export function logEvent(db, tenantId, sessionId, tipo, usuarioId, payload = null) {
  db.prepare(
    `INSERT INTO session_events (tenant_id, session_id, tipo, payload_json, usuario_id, criado_em)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    tenantId,
    sessionId,
    tipo,
    payload ? JSON.stringify(payload) : null,
    usuarioId ?? null,
    nowIso(),
  );
}

export function listSessionEvents(db, tenantId, sessionId) {
  return db
    .prepare(
      `SELECT e.id, e.tipo, e.payload_json, e.criado_em, e.usuario_id, u.nome AS usuario_nome
       FROM session_events e
       LEFT JOIN users u ON u.id = e.usuario_id
       WHERE e.tenant_id = ? AND e.session_id = ?
       ORDER BY e.id ASC`,
    )
    .all(tenantId, sessionId)
    .map((row) => ({
      id: row.id,
      tipo: row.tipo,
      payload: row.payload_json ? safeJson(row.payload_json) : null,
      usuarioId: row.usuario_id,
      usuarioNome: row.usuario_nome || 'Sistema',
      criadoEm: row.criado_em,
    }));
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
