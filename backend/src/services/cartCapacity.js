/** Capacidade e ocupação de equipamentos individuais (1) ou coletivos (>1). */
export function cartCapacity(row) {
  const value = Number(row?.capacidade_maxima);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

export function activeSessionsForCart(db, tenantId, cartId) {
  return db
    .prepare(
      `SELECT * FROM sessions
       WHERE tenant_id = ? AND cart_id = ?
         AND status = 'em_andamento' AND excluida_em IS NULL
       ORDER BY iniciado_em ASC, id ASC`,
    )
    .all(tenantId, cartId);
}

export function activeSessionCountForCart(db, tenantId, cartId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS n FROM sessions
       WHERE tenant_id = ? AND cart_id = ?
         AND status = 'em_andamento' AND excluida_em IS NULL`,
    )
    .get(tenantId, cartId).n;
}

/**
 * Status derivado, nunca gravado como 'lotado':
 * - sem sessões: status operacional (disponível/carregando/manutenção)
 * - com sessões e capacidade 1: em_uso
 * - com sessões e capacidade >1: em_uso até a última vaga; lotado ao encher
 */
export function computedCartStatus(row, activeCount) {
  if (activeCount <= 0) {
    return row?.status === 'carregando' || row?.status === 'manutencao'
      ? row.status
      : 'disponivel';
  }
  return cartCapacity(row) > 1 && activeCount >= cartCapacity(row) ? 'lotado' : 'em_uso';
}

export function occupancyForCart(db, tenantId, cartId) {
  const active = activeSessionsForCart(db, tenantId, cartId);
  return { active, count: active.length };
}
