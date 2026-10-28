/**
 * Regras financeiras de uma sessão.
 *
 * - "adiantado" é o valor recebido no início do aluguel;
 * - "pago" indica que o valor total da sessão já foi quitado (adiantado + eventual restante);
 * - uma renovação em sessão adiantada deixa o adicional pendente para o encerramento.
 */
export function sessionAmounts(row) {
  if (!row) {
    return { totalCentavos: 0, adiantadoCentavos: 0, pagoCentavos: 0, pendenteCentavos: 0 };
  }
  const totalCentavos = Math.max(0, Number(row.valor_centavos) || 0);
  const adiantadoCentavos = Math.min(
    totalCentavos,
    Math.max(0, Number(row.valor_adiantado_centavos) || 0),
  );
  const cancelada = row.status === 'cancelada';
  const pagoCentavos = cancelada
    ? 0
    : adiantadoCentavos + (row.pago ? Math.max(0, totalCentavos - adiantadoCentavos) : 0);
  return {
    totalCentavos,
    adiantadoCentavos,
    pagoCentavos,
    pendenteCentavos: cancelada ? 0 : Math.max(0, totalCentavos - pagoCentavos),
  };
}

/**
 * Transforma uma sessão em 0..2 recebimentos datados:
 * - adiantado (no início);
 * - final (somente a diferença restante, no encerramento/baixa).
 *
 * Sessões canceladas ou excluídas não geram recebimento.
 */
export function buildReceipts(row) {
  if (!row || row.excluida_em || row.status === 'cancelada') return [];
  const { totalCentavos, adiantadoCentavos } = sessionAmounts(row);
  const receipts = [];

  if (adiantadoCentavos > 0 && row.adiantado_em) {
    receipts.push({
      tipo: 'adiantado',
      sessionId: row.id,
      cartCodigo: row.cart_codigo || null,
      clienteNome: row.cliente_nome,
      operadorId: row.operador_id,
      operadorNome: row.operador_nome || '—',
      valorCentavos: adiantadoCentavos,
      formaPagamento: row.forma_adiantado || row.forma_pagamento || 'outro',
      data: row.adiantado_em,
    });
  }

  const restante = Math.max(0, totalCentavos - adiantadoCentavos);
  if (row.pago && restante > 0 && row.pago_em) {
    receipts.push({
      tipo: 'final',
      sessionId: row.id,
      cartCodigo: row.cart_codigo || null,
      clienteNome: row.cliente_nome,
      operadorId: row.operador_id,
      operadorNome: row.operador_nome || '—',
      valorCentavos: restante,
      formaPagamento: row.forma_pagamento || row.forma_adiantado || 'outro',
      data: row.pago_em,
    });
  }

  return receipts;
}

export function filterReceipts(receipts, startIso, endIso) {
  return receipts.filter((receipt) => receipt.data >= startIso && receipt.data < endIso);
}
