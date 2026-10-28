import { dayBounds, localDateKey, addDaysKey } from '../utils/time.js';
import { buildReceipts, filterReceipts, sessionAmounts } from './payments.js';

const METHOD_LABEL = { dinheiro: 'Dinheiro', pix: 'Pix', cartao: 'Cartão' };

function zeroMethods() {
  return { dinheiro: 0, pix: 0, cartao: 0, outro: 0 };
}

function paymentRowsInRange(db, start, end) {
  return db
    .prepare(
      `SELECT s.*, c.codigo AS cart_codigo, u.nome AS operador_nome
       FROM sessions s
       JOIN carts c ON c.id = s.cart_id
       LEFT JOIN users u ON u.id = s.operador_id
       WHERE s.excluida_em IS NULL AND s.status != 'cancelada'
         AND (
           (s.valor_adiantado_centavos > 0 AND s.adiantado_em >= ? AND s.adiantado_em < ?)
           OR (s.pago = 1 AND s.pago_em >= ? AND s.pago_em < ?)
         )`,
    )
    .all(start, end, start, end);
}

function receiptsInRange(db, start, end) {
  return filterReceipts(paymentRowsInRange(db, start, end).flatMap(buildReceipts), start, end)
    .sort((a, b) => a.data.localeCompare(b.data));
}

export function getCashSummary(db, dateKey) {
  const { start, end } = dayBounds(dateKey);
  const closure = db
    .prepare(
      `SELECT cc.*, u.nome AS usuario_nome FROM cash_closures cc
       LEFT JOIN users u ON u.id = cc.usuario_id WHERE cc.data = ?`,
    )
    .get(dateKey);

  const receipts = receiptsInRange(db, start, end);

  const totals = zeroMethods();
  let total = 0;
  const byOperatorMap = new Map();
  for (const receipt of receipts) {
    const method = receipt.formaPagamento || 'outro';
    totals[method] = (totals[method] || 0) + receipt.valorCentavos;
    total += receipt.valorCentavos;
    const key = receipt.operadorId || 0;
    if (!byOperatorMap.has(key)) {
      byOperatorMap.set(key, {
        operadorId: receipt.operadorId,
        operadorNome: receipt.operadorNome || '—',
        totalCentavos: 0,
        qtd: 0,
        porForma: zeroMethods(),
      });
    }
    const op = byOperatorMap.get(key);
    op.totalCentavos += receipt.valorCentavos;
    op.qtd += 1;
    op.porForma[method] = (op.porForma[method] || 0) + receipt.valorCentavos;
  }

  const pendingRows = db
    .prepare(
      `SELECT s.*, c.codigo AS cart_codigo, u.nome AS operador_nome
       FROM sessions s
       JOIN carts c ON c.id = s.cart_id
       LEFT JOIN users u ON u.id = s.operador_id
       WHERE s.status = 'encerrada' AND s.pago = 0 AND s.excluida_em IS NULL
         AND s.encerrado_em >= ? AND s.encerrado_em < ?
       ORDER BY s.encerrado_em ASC`,
    )
    .all(start, end);
  const pendingItems = pendingRows
    .map((row) => ({ row, restante: sessionAmounts(row).pendenteCentavos }))
    .filter((item) => item.restante > 0);

  const ended = db
    .prepare(
      `SELECT COUNT(*) AS qtd, COALESCE(SUM(valor_centavos), 0) AS total,
              COALESCE(SUM(duracao_segundos), 0) AS segundos
       FROM sessions
       WHERE status = 'encerrada' AND excluida_em IS NULL
         AND encerrado_em >= ? AND encerrado_em < ?`,
    )
    .get(start, end);

  const cancelled = db
    .prepare(
      `SELECT COUNT(*) AS qtd FROM sessions
       WHERE status = 'cancelada' AND excluida_em IS NULL
         AND encerrado_em >= ? AND encerrado_em < ?`,
    )
    .get(start, end).qtd;

  return {
    data: dateKey,
    fechado: Boolean(closure),
    fechamento: closure
      ? {
          id: closure.id,
          data: closure.data,
          totalCentavos: closure.total_centavos,
          totalPendenteCentavos: closure.total_pendente_centavos,
          qtdSessoes: closure.qtd_sessoes,
          criadoEm: closure.criado_em,
          usuarioNome: closure.usuario_nome || '—',
          payload: safeJson(closure.payload_json),
        }
      : null,
    totais: {
      dinheiroCentavos: totals.dinheiro,
      pixCentavos: totals.pix,
      cartaoCentavos: totals.cartao,
      outroCentavos: totals.outro,
      totalCentavos: total,
    },
    pagamentos: receipts.map((receipt) => ({
      id: `${receipt.sessionId}-${receipt.tipo}`,
      sessionId: receipt.sessionId,
      tipo: receipt.tipo,
      clienteNome: receipt.clienteNome,
      valorCentavos: receipt.valorCentavos,
      formaPagamento: receipt.formaPagamento,
      pagoEm: receipt.data,
      operadorNome: receipt.operadorNome || '—',
      cartCodigo: receipt.cartCodigo || null,
    })),
    porOperador: [...byOperatorMap.values()].sort((a, b) => b.totalCentavos - a.totalCentavos),
    pendentes: {
      totalCentavos: pendingItems.reduce((sum, item) => sum + item.restante, 0),
      qtd: pendingItems.length,
      itens: pendingItems.map(({ row, restante }) => ({
        id: row.id,
        clienteNome: row.cliente_nome,
        cartCodigo: row.cart_codigo,
        valorCentavos: restante,
        encerradoEm: row.encerrado_em,
        operadorNome: row.operador_nome || '—',
        valorAdiantadoCentavos: sessionAmounts(row).adiantadoCentavos,
      })),
    },
    sessoes: {
      encerradas: ended.qtd,
      valorContratadoCentavos: ended.total,
      duracaoTotalSegundos: ended.segundos,
      canceladas: cancelled,
    },
    formasLabel: METHOD_LABEL,
  };
}

export function closeCash(db, dateKey, observacao, user) {
  const summary = getCashSummary(db, dateKey);
  const now = new Date().toISOString();
  const payload = {
    ...summary,
    fechado: true,
    observacao: observacao || null,
    fechadoPor: user.nome,
  };
  const info = db
    .prepare(
      `INSERT INTO cash_closures
        (data, total_centavos, total_pendente_centavos, qtd_sessoes, payload_json, usuario_id, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      dateKey,
      summary.totais.totalCentavos,
      summary.pendentes.totalCentavos,
      summary.sessoes.encerradas,
      JSON.stringify(payload),
      user.id,
      now,
    );
  return {
    id: Number(info.lastInsertRowid),
    data: dateKey,
    totalCentavos: summary.totais.totalCentavos,
    totalPendenteCentavos: summary.pendentes.totalCentavos,
    qtdSessoes: summary.sessoes.encerradas,
    criadoEm: now,
    usuarioNome: user.nome,
    payload,
  };
}

export function listClosures(db, limit = 60) {
  return db
    .prepare(
      `SELECT cc.*, u.nome AS usuario_nome
       FROM cash_closures cc LEFT JOIN users u ON u.id = cc.usuario_id
       ORDER BY cc.data DESC, cc.id DESC LIMIT ?`,
    )
    .all(limit)
    .map((row) => ({
      id: row.id,
      data: row.data,
      totalCentavos: row.total_centavos,
      totalPendenteCentavos: row.total_pendente_centavos,
      qtdSessoes: row.qtd_sessoes,
      criadoEm: row.criado_em,
      usuarioNome: row.usuario_nome || '—',
      payload: safeJson(row.payload_json),
    }));
}

export function getReport(db, fromKey, toKey) {
  const { start, end } = dayBoundsRange(fromKey, toKey);

  const receipts = receiptsInRange(db, start, end);

  const startedRows = db
    .prepare(
      `SELECT s.id, s.iniciado_em, s.encerrado_em, s.status, s.cart_id,
              c.codigo AS cart_codigo, s.cliente_nome, s.valor_centavos, s.pago
       FROM sessions s JOIN carts c ON c.id = s.cart_id
       WHERE s.excluida_em IS NULL AND s.status != 'cancelada'
         AND s.iniciado_em >= ? AND s.iniciado_em < ?`,
    )
    .all(start, end);

  const cancelled = db
    .prepare(
      `SELECT COUNT(*) AS qtd FROM sessions
       WHERE status = 'cancelada' AND excluida_em IS NULL
         AND iniciado_em >= ? AND iniciado_em < ?`,
    )
    .get(start, end).qtd;

  const revenue = receipts.reduce((sum, receipt) => sum + receipt.valorCentavos, 0);
  const paidSessionIds = new Set(receipts.map((receipt) => receipt.sessionId));
  const byDayMap = new Map();
  const byMethod = { dinheiro: 0, pix: 0, cartao: 0, outro: 0 };
  const byCartMap = new Map();
  const paidSessionsByCart = new Map();
  for (const receipt of receipts) {
    const key = localDateKey(new Date(receipt.data));
    const day = byDayMap.get(key) || { data: key, totalCentavos: 0, qtd: 0 };
    day.totalCentavos += receipt.valorCentavos;
    day.qtd += 1;
    byDayMap.set(key, day);
    byMethod[receipt.formaPagamento || 'outro'] += receipt.valorCentavos;
    const cart = byCartMap.get(receipt.cartCodigo) || {
      cartCodigo: receipt.cartCodigo,
      receitaCentavos: 0,
      sessoesPagas: 0,
      sessoes: 0,
    };
    cart.receitaCentavos += receipt.valorCentavos;
    const set = paidSessionsByCart.get(receipt.cartCodigo) || new Set();
    set.add(receipt.sessionId);
    paidSessionsByCart.set(receipt.cartCodigo, set);
    cart.sessoesPagas = set.size;
    byCartMap.set(receipt.cartCodigo, cart);
  }

  const hours = Array.from({ length: 24 }, (_, hora) => ({ hora, sessoes: 0 }));
  for (const row of startedRows) {
    const hour = new Date(row.iniciado_em).getHours();
    hours[hour].sessoes += 1;
    const cart = byCartMap.get(row.cart_codigo) || {
      cartCodigo: row.cart_codigo,
      receitaCentavos: 0,
      sessoesPagas: 0,
      sessoes: 0,
    };
    cart.sessoes += 1;
    byCartMap.set(row.cart_codigo, cart);
  }

  // Preenche todos os dias do período para o gráfico.
  const days = [];
  let cursor = fromKey;
  let guard = 0;
  while (cursor <= toKey && guard < 370) {
    days.push(byDayMap.get(cursor) || { data: cursor, totalCentavos: 0, qtd: 0 });
    cursor = addDaysKey(cursor, 1);
    guard += 1;
  }

  const pending = db
    .prepare(
      `SELECT s.id, s.cliente_nome, s.valor_centavos, s.valor_adiantado_centavos, s.pago,
              s.encerrado_em, s.status
       FROM sessions s
       WHERE s.status = 'encerrada' AND s.pago = 0 AND s.excluida_em IS NULL
       ORDER BY s.encerrado_em ASC`,
    )
    .all()
    .map((row) => ({ ...row, restante: sessionAmounts(row).pendenteCentavos }))
    .filter((row) => row.restante > 0);
  const debtorMap = new Map();
  for (const row of pending) {
    const key = row.cliente_nome.trim().toLowerCase();
    const debtor = debtorMap.get(key) || {
      clienteNome: row.cliente_nome.trim(),
      totalCentavos: 0,
      qtd: 0,
      ultimaEm: row.encerrado_em,
      sessoes: [],
    };
    debtor.totalCentavos += row.restante;
    debtor.qtd += 1;
    debtor.ultimaEm = row.encerrado_em;
    debtor.sessoes.push({ id: row.id, valorCentavos: row.restante, encerradoEm: row.encerrado_em });
    debtorMap.set(key, debtor);
  }

  return {
    periodo: { from: fromKey, to: toKey },
    faturamentoCentavos: revenue,
    recebidos: receipts.length,
    sessoesPagas: paidSessionIds.size,
    ticketMedioCentavos: paidSessionIds.size ? Math.round(revenue / paidSessionIds.size) : 0,
    sessoesIniciadas: startedRows.length,
    sessoesEncerradas: startedRows.filter((r) => r.status === 'encerrada').length,
    sessoesCanceladas: cancelled,
    pendenteCentavos: pending.reduce((sum, row) => sum + row.restante, 0),
    pendenteQtd: pending.length,
    porDia: days,
    porForma: byMethod,
    carrinhos: [...byCartMap.values()]
      .sort((a, b) => b.sessoes - a.sessoes || b.receitaCentavos - a.receitaCentavos)
      .slice(0, 8),
    horarios: hours,
    horarioPico: hours.reduce((best, item) => (item.sessoes > best.sessoes ? item : best), hours[0]),
    devedores: [...debtorMap.values()].sort((a, b) => b.totalCentavos - a.totalCentavos).slice(0, 50),
  };
}

function dayBoundsRange(fromKey, toKey) {
  const start = new Date(`${fromKey}T00:00:00`);
  const end = new Date(`${toKey}T00:00:00`);
  end.setDate(end.getDate() + 1);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    const err = new Error('Período inválido.');
    err.status = 400;
    throw err;
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
