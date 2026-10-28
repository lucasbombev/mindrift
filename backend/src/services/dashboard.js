import { dayBounds } from '../utils/time.js';
import { getSetting } from '../db.js';
import { buildReceipts, filterReceipts, sessionAmounts } from './payments.js';

export function serializeCart(row) {
  return {
    id: row.id,
    codigo: row.codigo,
    fotoUrl: row.foto_url || null,
    status: row.status,
    observacao: row.observacao || null,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

export function getDashboard(db) {
  const now = new Date();
  const { start, end } = dayBounds();
  const nomeEstabelecimento = getSetting(db, 'nome_estabelecimento', 'Drift Rent');
  const alertLeadSeconds = Number(getSetting(db, 'alert_lead_seconds', '60')) || 0;

  const carts = db
    .prepare('SELECT * FROM carts WHERE excluido_em IS NULL ORDER BY codigo COLLATE NOCASE')
    .all()
    .map(serializeCart);

  const activeRows = db
    .prepare(
      `SELECT s.*, c.codigo AS cart_codigo, u.nome AS operador_nome
       FROM sessions s
       JOIN carts c ON c.id = s.cart_id
       LEFT JOIN users u ON u.id = s.operador_id
       WHERE s.status = 'em_andamento' AND s.excluida_em IS NULL
       ORDER BY s.fim_previsto_em ASC`,
    )
    .all();

  const activeByCart = new Map(activeRows.map((row) => [row.cart_id, row]));

  const activeSessionDto = (row) => {
    const amounts = sessionAmounts(row);
    return {
      id: row.id,
      cartId: row.cart_id,
      cartCodigo: row.cart_codigo,
      clienteNome: row.cliente_nome,
      planoNome: row.plano_nome,
      minutosContratados: row.minutos_contratados,
      valorCentavos: row.valor_centavos,
      valorPagoCentavos: amounts.pagoCentavos,
      valorPendenteCentavos: amounts.pendenteCentavos,
      valorAdiantadoCentavos: amounts.adiantadoCentavos,
      pagamentoAdiantado: Boolean(row.pagamento_adiantado),
      formaPagamento: row.forma_pagamento || null,
      formaAdiantado: row.forma_adiantado || null,
      adiantadoEm: row.adiantado_em || null,
      pagoEm: row.pago_em || null,
      iniciadoEm: row.iniciado_em,
      fimPrevistoEm: row.fim_previsto_em,
      operadorNome: row.operador_nome || null,
      pago: Boolean(row.pago),
    };
  };

  const activeSessions = activeRows.map(activeSessionDto);

  const cartsWithSessions = carts.map((cart) => {
    const active = activeByCart.get(cart.id) || null;
    return {
      ...cart,
      sessaoAtiva: active ? activeSessionDto(active) : null,
    };
  });

  // Recebimentos do dia: adiantado no início + parcela final no encerramento.
  const paymentRows = db
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
  const receipts = filterReceipts(paymentRows.flatMap(buildReceipts), start, end);
  const revenue = {
    total: receipts.reduce((sum, receipt) => sum + receipt.valorCentavos, 0),
    qtd: receipts.length,
  };

  const pendingRows = db
    .prepare(
      `SELECT * FROM sessions
       WHERE status = 'encerrada' AND pago = 0 AND excluida_em IS NULL
         AND encerrado_em >= ? AND encerrado_em < ?`,
    )
    .all(start, end);
  const pendingItems = pendingRows
    .map((row) => sessionAmounts(row).pendenteCentavos)
    .filter((value) => value > 0);
  const pending = {
    total: pendingItems.reduce((sum, value) => sum + value, 0),
    qtd: pendingItems.length,
  };

  const startedToday = db
    .prepare(
      `SELECT COUNT(*) AS qtd FROM sessions
       WHERE iniciado_em >= ? AND iniciado_em < ? AND excluida_em IS NULL`,
    )
    .get(start, end).qtd;

  const byStatus = carts.reduce(
    (acc, cart) => {
      acc[cart.status] = (acc[cart.status] || 0) + 1;
      return acc;
    },
    { disponivel: 0, em_uso: 0, carregando: 0, manutencao: 0 },
  );

  return {
    serverNow: now.toISOString(),
    nomeEstabelecimento,
    alertLeadSeconds,
    summary: {
      totalCarrinhos: carts.length,
      emUso: activeSessions.length,
      disponiveis: byStatus.disponivel,
      carregando: byStatus.carregando,
      manutencao: byStatus.manutencao,
      faturamentoHojeCentavos: revenue.total,
      pagamentosHoje: revenue.qtd,
      pendenteHojeCentavos: pending.total,
      pendentesHoje: pending.qtd,
      sessoesHoje: startedToday,
    },
    carts: cartsWithSessions,
    sessoesAtivas: activeSessions,
    horarioServidor: now.toISOString(),
  };
}

export function getActiveSessionsMinimal(db) {
  return db
    .prepare(
      `SELECT s.id, s.cliente_nome, s.fim_previsto_em, c.codigo AS cart_codigo
       FROM sessions s JOIN carts c ON c.id = s.cart_id
       WHERE s.status = 'em_andamento' AND s.excluida_em IS NULL`,
    )
    .all();
}
