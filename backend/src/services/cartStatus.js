import { nowIso } from '../utils/time.js';

export function logCartStatus(db, tenantId, cartId, de, para, motivo, observacao, usuarioId) {
  db.prepare(
    `INSERT INTO cart_status_events
      (tenant_id, cart_id, de, para, motivo, observacao, usuario_id, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(tenantId, cartId, de, para, motivo || null, observacao || null, usuarioId, nowIso());
}

export function listCartStatusEvents(db, tenantId, cartId) {
  return db
    .prepare(
      `SELECT e.id, e.de, e.para, e.motivo, e.observacao, e.criado_em,
              u.nome AS usuario_nome
       FROM cart_status_events e
       LEFT JOIN users u ON u.id = e.usuario_id
       WHERE e.tenant_id = ? AND e.cart_id = ?
       ORDER BY e.id DESC LIMIT 100`,
    )
    .all(tenantId, cartId)
    .map((row) => ({
      id: row.id,
      de: row.de,
      para: row.para,
      motivo: row.motivo,
      observacao: row.observacao,
      usuarioNome: row.usuario_nome || 'Sistema',
      criadoEm: row.criado_em,
    }));
}
