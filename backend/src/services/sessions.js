import { badRequest, conflict, notFound } from '../utils/errors.js';
import { addMinutes, nowIso } from '../utils/time.js';
import { logEvent } from './audit.js';
import { sessionAmounts } from './payments.js';

export const SESSION_SELECT = `
  SELECT s.*, c.codigo AS cart_codigo, c.foto_url AS cart_foto_url,
         u.nome AS operador_nome
  FROM sessions s
  JOIN carts c ON c.id = s.cart_id
  LEFT JOIN users u ON u.id = s.operador_id
`;

export const PAYMENT_METHODS = ['dinheiro', 'pix', 'cartao'];

export function serializeSession(row) {
  if (!row) return null;
  const amounts = sessionAmounts(row);
  return {
    id: row.id,
    cartId: row.cart_id,
    cartCodigo: row.cart_codigo || null,
    cartFotoUrl: row.cart_foto_url || null,
    clienteNome: row.cliente_nome,
    planoId: row.plano_id,
    planoNome: row.plano_nome,
    minutosContratados: row.minutos_contratados,
    valorCentavos: row.valor_centavos,
    iniciadoEm: row.iniciado_em,
    fimPrevistoEm: row.fim_previsto_em,
    encerradoEm: row.encerrado_em,
    duracaoSegundos: row.duracao_segundos,
    status: row.status,
    pago: Boolean(row.pago),
    formaPagamento: row.forma_pagamento,
    pagamentoAdiantado: Boolean(row.pagamento_adiantado),
    valorAdiantadoCentavos: amounts.adiantadoCentavos,
    formaAdiantado: row.forma_adiantado || null,
    adiantadoEm: row.adiantado_em || null,
    valorPagoCentavos: amounts.pagoCentavos,
    valorPendenteCentavos: amounts.pendenteCentavos,
    operadorId: row.operador_id,
    operadorNome: row.operador_nome || null,
    observacao: row.observacao,
    motivoCancelamento: row.motivo_cancelamento,
    pagoEm: row.pago_em,
    criadoEm: row.criado_em,
    excluidaEm: row.excluida_em || null,
  };
}

export function getSessionById(db, id, { includeDeleted = false } = {}) {
  const row = db
    .prepare(`${SESSION_SELECT} WHERE s.id = ?${includeDeleted ? '' : ' AND s.excluida_em IS NULL'}`)
    .get(id);
  return row ? serializeSession(row) : null;
}

function assertPayment(formaPagamento, paid) {
  if (paid && !PAYMENT_METHODS.includes(formaPagamento)) {
    throw badRequest('Escolha a forma de pagamento: dinheiro, pix ou cartão.');
  }
}

function resolvePricing(db, input) {
  if (input.plano_id) {
    const plan = db
      .prepare('SELECT * FROM pricing_plans WHERE id = ? AND ativo = 1')
      .get(input.plano_id);
    if (!plan) throw badRequest('Plano inválido ou inativo.');
    return {
      planoId: plan.id,
      planoNome: plan.nome,
      minutos: plan.minutos,
      valorCentavos: plan.valor_centavos,
    };
  }
  const minutos = Number(input.minutos);
  const valorCentavos = Number(input.valor_centavos);
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > 1440) {
    throw badRequest('Informe os minutos entre 1 e 1440.');
  }
  if (!Number.isInteger(valorCentavos) || valorCentavos < 0 || valorCentavos > 1_000_000) {
    throw badRequest('Informe um valor válido.');
  }
  return {
    planoId: null,
    planoNome: input.plano_nome || 'Avulso',
    minutos,
    valorCentavos,
  };
}

export function startSession(db, input, operator) {
  const adiantado = Boolean(input.pagamento_adiantado);
  if (adiantado) assertPayment(input.forma_pagamento, true);

  const run = db.transaction(() => {
    const cart = db
      .prepare('SELECT * FROM carts WHERE id = ? AND excluido_em IS NULL')
      .get(input.cart_id);
    if (!cart) throw notFound('Carrinho não encontrado.');
    if (cart.status !== 'disponivel') {
      throw conflict(
        cart.status === 'em_uso'
          ? 'Este carrinho já está em uso.'
          : 'Carrinho indisponível. Altere o status para "disponível" antes de iniciar.',
        'carrinho_indisponivel',
      );
    }
    const active = db
      .prepare(
        "SELECT id FROM sessions WHERE cart_id = ? AND status = 'em_andamento' AND excluida_em IS NULL",
      )
      .get(cart.id);
    if (active) throw conflict('Este carrinho já possui uma sessão ativa.', 'carrinho_em_uso');

    const pricing = resolvePricing(db, input);
    const startedAt = new Date();
    const startedIso = startedAt.toISOString();
    const endsAt = addMinutes(startedAt, pricing.minutos);
    const now = nowIso();
    const forma = adiantado ? input.forma_pagamento : null;

    const info = db
      .prepare(
        `INSERT INTO sessions
          (cart_id, cliente_nome, plano_id, plano_nome, minutos_contratados, valor_centavos,
           iniciado_em, fim_previsto_em, status, pago, forma_pagamento, pago_em,
           pagamento_adiantado, valor_adiantado_centavos, forma_adiantado, adiantado_em,
           operador_id, observacao, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'em_andamento', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        cart.id,
        String(input.cliente_nome).trim(),
        pricing.planoId,
        pricing.planoNome,
        pricing.minutos,
        pricing.valorCentavos,
        startedIso,
        endsAt.toISOString(),
        adiantado ? 1 : 0,
        forma,
        adiantado ? startedIso : null,
        adiantado ? 1 : 0,
        adiantado ? pricing.valorCentavos : 0,
        forma,
        adiantado ? startedIso : null,
        operator.id,
        input.observacao ? String(input.observacao).trim() : null,
        now,
        now,
      );
    const sessionId = Number(info.lastInsertRowid);

    db.prepare("UPDATE carts SET status = 'em_uso', atualizado_em = ? WHERE id = ?").run(now, cart.id);
    logEvent(db, sessionId, 'inicio', operator.id, {
      carrinho: cart.codigo,
      cliente: String(input.cliente_nome).trim(),
      plano: pricing.planoNome,
      minutos: pricing.minutos,
      valorCentavos: pricing.valorCentavos,
      pagamentoAdiantado: adiantado,
      pago: adiantado,
      formaPagamento: forma,
      inicio: startedIso,
      fimPrevisto: endsAt.toISOString(),
    });
    if (adiantado) {
      logEvent(db, sessionId, 'pagamento', operator.id, {
        pago: true,
        valorCentavos: pricing.valorCentavos,
        formaPagamento: forma,
        pagoEm: startedIso,
        origem: 'inicio_adiantado',
      });
    }

    return sessionId;
  });

  const id = run();
  return getSessionById(db, id);
}

export function renewSession(db, id, input, operator) {
  const run = db.transaction(() => {
    const row = db
      .prepare("SELECT * FROM sessions WHERE id = ? AND status = 'em_andamento' AND excluida_em IS NULL")
      .get(id);
    if (!row) throw notFound('Sessão ativa não encontrada.');
    const pricing = resolvePricing(db, input);

    // Se o tempo já estourou, a renovação conta a partir de agora.
    const base = Math.max(Date.now(), new Date(row.fim_previsto_em).getTime());
    const newEnd = new Date(base + pricing.minutos * 60_000);
    const newMinutes = row.minutos_contratados + pricing.minutos;
    const newValue = row.valor_centavos + pricing.valorCentavos;
    const now = nowIso();
    // Um adicional não está coberto pelo pagamento anterior: a sessão volta a ter
    // um restante pendente para ser cobrado no encerramento. Se o adicional for 0,
    // mantém o estado de pagamento atual.
    const temAdicional = pricing.valorCentavos > 0;
    const newPago = temAdicional ? 0 : row.pago;
    const newPagoEm = temAdicional ? null : row.pago_em;
    const newForma = temAdicional ? null : row.forma_pagamento;

    db.prepare(
      `UPDATE sessions SET minutos_contratados = ?, valor_centavos = ?,
       fim_previsto_em = ?, pago = ?, pago_em = ?, forma_pagamento = ?, atualizado_em = ?
       WHERE id = ?`,
    ).run(newMinutes, newValue, newEnd.toISOString(), newPago, newPagoEm, newForma, now, id);

    const after = { ...row, valor_centavos: newValue, pago: newPago };
    logEvent(db, id, 'renovacao', operator.id, {
      plano: pricing.planoNome,
      minutosAdicionados: pricing.minutos,
      valorAdicionadoCentavos: pricing.valorCentavos,
      minutosTotais: newMinutes,
      valorTotalCentavos: newValue,
      novoFimPrevisto: newEnd.toISOString(),
      valorAdiantadoCentavos: sessionAmounts(after).adiantadoCentavos,
      valorPendenteCentavos: sessionAmounts(after).pendenteCentavos,
      cobrancaPendente: temAdicional,
    });
  });
  run();
  return getSessionById(db, id);
}

export function endSession(db, id, input, operator) {
  const run = db.transaction(() => {
    const row = db
      .prepare("SELECT * FROM sessions WHERE id = ? AND status = 'em_andamento' AND excluida_em IS NULL")
      .get(id);
    if (!row) throw notFound('Sessão ativa não encontrada.');

    const amounts = sessionAmounts(row);
    const restante = amounts.pendenteCentavos;
    const receberAgora = restante > 0 ? Boolean(input.pago) : true;
    if (restante > 0) assertPayment(input.forma_pagamento, receberAgora);

    const endedAt = new Date();
    const endedIso = endedAt.toISOString();
    const duration = Math.max(0, Math.round((endedAt.getTime() - new Date(row.iniciado_em).getTime()) / 1000));
    const now = nowIso();

    // Se não há restante (tudo foi adiantado), preserva a data/forma originais.
    const hasFinalPayment = restante > 0 && receberAgora;
    const nextPago = restante > 0 ? (receberAgora ? 1 : 0) : 1;
    const nextPagoEm = restante > 0
      ? (receberAgora ? endedIso : null)
      : row.pago_em || row.adiantado_em || endedIso;
    const nextForma = restante > 0
      ? (receberAgora ? input.forma_pagamento : null)
      : row.forma_pagamento || row.forma_adiantado || null;

    db.prepare(
      `UPDATE sessions SET status = 'encerrada', encerrado_em = ?, duracao_segundos = ?,
       pago = ?, forma_pagamento = ?, pago_em = ?, atualizado_em = ? WHERE id = ?`,
    ).run(
      endedIso,
      duration,
      nextPago,
      nextForma,
      nextPagoEm,
      now,
      id,
    );
    db.prepare("UPDATE carts SET status = 'disponivel', atualizado_em = ? WHERE id = ?").run(
      now,
      row.cart_id,
    );

    logEvent(db, id, 'encerramento', operator.id, {
      encerradoEm: endedIso,
      duracaoSegundos: duration,
      valorCentavos: row.valor_centavos,
      valorAdiantadoCentavos: amounts.adiantadoCentavos,
      valorRestanteCentavos: restante,
      pago: Boolean(nextPago),
      formaPagamento: nextForma,
    });
    if (hasFinalPayment) {
      logEvent(db, id, 'pagamento', operator.id, {
        valorCentavos: restante,
        formaPagamento: input.forma_pagamento,
        pagoEm: endedIso,
        origem: 'encerramento',
      });
    }
  });
  run();
  return getSessionById(db, id);
}

export function setPayment(db, id, input, operator) {
  const paid = Boolean(input.pago);
  assertPayment(input.forma_pagamento, paid);

  const run = db.transaction(() => {
    const row = db
      .prepare("SELECT * FROM sessions WHERE id = ? AND excluida_em IS NULL")
      .get(id);
    if (!row) throw notFound('Sessão não encontrada.');
    if (row.status !== 'encerrada') {
      throw conflict('Só é possível marcar pagamento de sessões encerradas.', 'sessao_nao_encerrada');
    }
    const amounts = sessionAmounts(row);
    if (!paid && amounts.adiantadoCentavos > 0 && amounts.adiantadoCentavos >= amounts.totalCentavos) {
      throw badRequest('Não há parcela final a desmarcar: todo o valor foi pago adiantado.');
    }
    const now = nowIso();
    const paidAt = paid ? row.pago_em || now : null;
    db.prepare(
      `UPDATE sessions SET pago = ?, forma_pagamento = ?, pago_em = ?, atualizado_em = ? WHERE id = ?`,
    ).run(paid ? 1 : 0, paid ? input.forma_pagamento : null, paidAt, now, id);
    logEvent(db, id, 'pagamento', operator.id, {
      pago: paid,
      valorCentavos: amounts.pendenteCentavos,
      valorAdiantadoCentavos: amounts.adiantadoCentavos,
      formaPagamento: paid ? input.forma_pagamento : null,
      pagoEm: paidAt,
    });
  });
  run();
  return getSessionById(db, id);
}

export function editSessionValue(db, id, input, operator) {
  if (!Number.isInteger(input.valor_centavos) || input.valor_centavos < 0 || input.valor_centavos > 1_000_000) {
    throw badRequest('Informe um valor válido.');
  }
  const run = db.transaction(() => {
    const row = db
      .prepare("SELECT * FROM sessions WHERE id = ? AND excluida_em IS NULL")
      .get(id);
    if (!row) throw notFound('Sessão não encontrada.');
    if (row.status !== 'encerrada') {
      throw conflict('O valor só pode ser editado em sessões encerradas.');
    }
    if (row.valor_centavos === input.valor_centavos) return;
    db.prepare('UPDATE sessions SET valor_centavos = ?, atualizado_em = ? WHERE id = ?').run(
      input.valor_centavos,
      nowIso(),
      id,
    );
    logEvent(db, id, 'edicao_valor', operator.id, {
      valorAnteriorCentavos: row.valor_centavos,
      valorNovoCentavos: input.valor_centavos,
    });
  });
  run();
  return getSessionById(db, id);
}

export function cancelSession(db, id, input, operator) {
  const motivo = String(input.motivo || '').trim();
  if (motivo.length < 3) throw badRequest('Informe o motivo do cancelamento.');

  const run = db.transaction(() => {
    const row = db
      .prepare("SELECT * FROM sessions WHERE id = ? AND excluida_em IS NULL")
      .get(id);
    if (!row) throw notFound('Sessão não encontrada.');
    if (row.status === 'cancelada') throw conflict('Sessão já está cancelada.');

    const now = new Date();
    const endedAt = row.encerrado_em || now.toISOString();
    const duration =
      row.duracao_segundos ??
      Math.max(0, Math.round((now.getTime() - new Date(row.iniciado_em).getTime()) / 1000));

    db.prepare(
      `UPDATE sessions SET status = 'cancelada', motivo_cancelamento = ?,
       encerrado_em = ?, duracao_segundos = ?, atualizado_em = ?, pago = 0,
       forma_pagamento = NULL, pago_em = NULL WHERE id = ?`,
    ).run(motivo, endedAt, duration, nowIso(), id);
    if (row.status === 'em_andamento') {
      db.prepare("UPDATE carts SET status = 'disponivel', atualizado_em = ? WHERE id = ?").run(
        nowIso(),
        row.cart_id,
      );
    }
    logEvent(db, id, 'cancelamento', operator.id, {
      motivo,
      valorCentavos: row.valor_centavos,
      valorAdiantadoCentavos: row.valor_adiantado_centavos || 0,
      statusAnterior: row.status,
      pagoAnterior: Boolean(row.pago),
      formaAnterior: row.forma_pagamento,
    });
  });
  run();
  return getSessionById(db, id);
}

export function deleteSession(db, id, input, operator) {
  const run = db.transaction(() => {
    const row = db
      .prepare("SELECT * FROM sessions WHERE id = ? AND excluida_em IS NULL")
      .get(id);
    if (!row) throw notFound('Sessão não encontrada.');
    if (row.status === 'em_andamento') {
      throw conflict('Encerre ou cancele a sessão antes de excluí-la.');
    }
    const now = nowIso();
    db.prepare(
      'UPDATE sessions SET excluida_em = ?, excluida_por = ?, atualizado_em = ? WHERE id = ?',
    ).run(now, operator.id, now, id);
    logEvent(db, id, 'exclusao', operator.id, {
      motivo: String(input?.motivo || '').trim() || 'Exclusão administrativa',
      cliente: row.cliente_nome,
      valorCentavos: row.valor_centavos,
      pago: Boolean(row.pago),
    });
  });
  run();
}

export function listSessions(db, filters) {
  const where = ['1 = 1'];
  const params = [];
  if (filters.from) {
    where.push('s.iniciado_em >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    where.push('s.iniciado_em < ?');
    params.push(filters.to);
  }
  if (filters.cartId) {
    where.push('s.cart_id = ?');
    params.push(filters.cartId);
  }
  if (filters.cliente) {
    where.push('s.cliente_nome LIKE ? COLLATE NOCASE');
    params.push(`%${filters.cliente}%`);
  }
  if (filters.pago === '1' || filters.pago === '0') {
    where.push('s.pago = ?');
    params.push(Number(filters.pago));
  }
  if (filters.status) {
    where.push('s.status = ?');
    params.push(filters.status);
  }
  if (filters.formaPagamento) {
    where.push('(s.forma_pagamento = ? OR s.forma_adiantado = ?)');
    params.push(filters.formaPagamento, filters.formaPagamento);
  }
  if (filters.operadorId) {
    where.push('s.operador_id = ?');
    params.push(filters.operadorId);
  }
  if (!filters.includeDeleted) where.push('s.excluida_em IS NULL');

  const whereSql = where.join(' AND ');

  const aggregate = db
    .prepare(
      `SELECT
         COUNT(*) AS qtd,
         COALESCE(SUM(
           CASE WHEN s.status != 'cancelada' THEN
             COALESCE(s.valor_adiantado_centavos, 0) +
             CASE WHEN s.pago = 1 THEN MAX(s.valor_centavos - COALESCE(s.valor_adiantado_centavos, 0), 0) ELSE 0 END
           ELSE 0 END
         ), 0) AS pago_centavos,
         COALESCE(SUM(
           CASE WHEN s.status = 'encerrada' AND s.pago = 0
             THEN MAX(s.valor_centavos - COALESCE(s.valor_adiantado_centavos, 0), 0)
           ELSE 0 END
         ), 0) AS pendente_centavos,
         COALESCE(SUM(CASE WHEN s.status = 'cancelada' THEN 1 ELSE 0 END), 0) AS canceladas,
         COALESCE(SUM(CASE WHEN s.status = 'em_andamento' THEN 1 ELSE 0 END), 0) AS em_andamento
       FROM sessions s WHERE ${whereSql}`,
    )
    .get(...params);

  const rows = db
    .prepare(
      `${SESSION_SELECT} WHERE ${whereSql} ORDER BY s.iniciado_em DESC, s.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, filters.limit, filters.offset);

  return {
    items: rows.map(serializeSession),
    page: filters.page,
    limit: filters.limit,
    total: aggregate.qtd,
    resumo: {
      qtd: aggregate.qtd,
      pagoCentavos: aggregate.pago_centavos,
      pendenteCentavos: aggregate.pendente_centavos,
      canceladas: aggregate.canceladas,
      emAndamento: aggregate.em_andamento,
    },
  };
}
