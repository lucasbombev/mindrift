import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { auth, createTestContext } from './helpers.js';

const ctx = await createTestContext();
const admin = await ctx.loginAdmin();
const token = admin.token;

after(() => ctx.close());

async function dashboard() {
  const res = await request(ctx.app).get('/api/dashboard').set(auth(token));
  assert.equal(res.status, 200);
  return res.body;
}

async function cash() {
  const res = await request(ctx.app).get('/api/cash/summary').set(auth(token));
  assert.equal(res.status, 200);
  return res.body;
}

async function report() {
  const res = await request(ctx.app).get('/api/reports/summary').set(auth(token));
  assert.equal(res.status, 200);
  return res.body;
}

let plans;
let carts;
let prepaid;

test('pagamento adiantado quita o início e entra no caixa na hora', async () => {
  plans = (await request(ctx.app).get('/api/plans').set(auth(token))).body.items;
  carts = (await request(ctx.app).get('/api/carts').set(auth(token))).body.items;
  const c01 = carts.find((cart) => cart.codigo === 'C01');

  const missingMethod = await request(ctx.app)
    .post('/api/sessions')
    .set(auth(token))
    .send({
      cart_id: c01.id,
      cliente_nome: 'Cliente Adiantado',
      plano_id: plans[0].id,
      pagamento_adiantado: true,
    });
  assert.equal(missingMethod.status, 400);

  const started = await request(ctx.app)
    .post('/api/sessions')
    .set(auth(token))
    .send({
      cart_id: c01.id,
      cliente_nome: 'Cliente Adiantado',
      plano_id: plans[0].id,
      pagamento_adiantado: true,
      forma_pagamento: 'pix',
    });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  prepaid = started.body.sessao;
  assert.equal(prepaid.pago, true);
  assert.equal(prepaid.pagamentoAdiantado, true);
  assert.equal(prepaid.valorAdiantadoCentavos, 500);
  assert.equal(prepaid.valorPagoCentavos, 500);
  assert.equal(prepaid.valorPendenteCentavos, 0);
  assert.equal(prepaid.formaAdiantado, 'pix');
  assert.ok(prepaid.adiantadoEm);

  const dash = await dashboard();
  assert.equal(dash.summary.faturamentoHojeCentavos, 500);
  assert.equal(dash.summary.pagamentosHoje, 1);
  const active = dash.sessoesAtivas.find((session) => session.id === prepaid.id);
  assert.equal(active.pago, true);
  assert.equal(active.valorPendenteCentavos, 0);
  assert.equal(dash.carts.find((cart) => cart.codigo === 'C01').sessaoAtiva.cartCodigo, 'C01');

  const cashToday = await cash();
  assert.equal(cashToday.totais.pixCentavos, 500);
  assert.equal(cashToday.totais.totalCentavos, 500);
  assert.equal(cashToday.pagamentos.length, 1);
  assert.equal(cashToday.pagamentos[0].tipo, 'adiantado');
  assert.equal(cashToday.pendentes.totalCentavos, 0);

  const reportToday = await report();
  assert.equal(reportToday.faturamentoCentavos, 500);
  assert.equal(reportToday.recebidos, 1);
  assert.equal(reportToday.sessoesPagas, 1);
  assert.equal(reportToday.ticketMedioCentavos, 500);
});

test('renovação de sessão adiantada deixa somente o adicional pendente', async () => {
  const renewed = await request(ctx.app)
    .post(`/api/sessions/${prepaid.id}/renew`)
    .set(auth(token))
    .send({ plano_id: plans[1].id });
  assert.equal(renewed.status, 200);
  const session = renewed.body.sessao;
  assert.equal(session.valorCentavos, 1300);
  assert.equal(session.valorAdiantadoCentavos, 500);
  assert.equal(session.valorPagoCentavos, 500);
  assert.equal(session.valorPendenteCentavos, 800);
  assert.equal(session.pago, false);

  // O adiantado continua no caixa de hoje; o adicional ainda não.
  const dash = await dashboard();
  assert.equal(dash.summary.faturamentoHojeCentavos, 500);
  const cashToday = await cash();
  assert.equal(cashToday.totais.totalCentavos, 500);
  assert.equal(cashToday.pendentes.totalCentavos, 0); // ainda está em andamento
});

test('encerrar sem receber mantém o adicional pendente sem cobrar o adiantado de novo', async () => {
  const ended = await request(ctx.app)
    .post(`/api/sessions/${prepaid.id}/end`)
    .set(auth(token))
    .send({ pago: false });
  assert.equal(ended.status, 200, JSON.stringify(ended.body));
  assert.equal(ended.body.sessao.status, 'encerrada');
  assert.equal(ended.body.sessao.pago, false);
  assert.equal(ended.body.sessao.valorAdiantadoCentavos, 500);
  assert.equal(ended.body.sessao.valorPendenteCentavos, 800);

  const cashToday = await cash();
  assert.equal(cashToday.totais.totalCentavos, 500); // só o adiantado
  assert.equal(cashToday.pendentes.totalCentavos, 800);
  assert.equal(cashToday.pendentes.itens[0].valorAdiantadoCentavos, 500);

  const dash = await dashboard();
  assert.equal(dash.summary.pendenteHojeCentavos, 800);

  const reportToday = await report();
  assert.equal(reportToday.faturamentoCentavos, 500);
  assert.equal(reportToday.pendenteCentavos, 800);

  const history = await request(ctx.app).get('/api/sessions').set(auth(token));
  assert.equal(history.status, 200);
  assert.equal(history.body.resumo.pagoCentavos, 500);
  assert.equal(history.body.resumo.pendenteCentavos, 800);
});

test('receber o restante registra só a diferença e quita a sessão', async () => {
  const paid = await request(ctx.app)
    .post(`/api/sessions/${prepaid.id}/payment`)
    .set(auth(token))
    .send({ pago: true, forma_pagamento: 'dinheiro' });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.sessao.pago, true);
  assert.equal(paid.body.sessao.valorPagoCentavos, 1300);
  assert.equal(paid.body.sessao.valorPendenteCentavos, 0);

  const cashToday = await cash();
  assert.equal(cashToday.totais.pixCentavos, 500);
  assert.equal(cashToday.totais.dinheiroCentavos, 800);
  assert.equal(cashToday.totais.totalCentavos, 1300);
  assert.equal(cashToday.pagamentos.length, 2);
  assert.deepEqual(
    cashToday.pagamentos.map((payment) => payment.tipo).sort(),
    ['adiantado', 'final'],
  );
  assert.equal(cashToday.pendentes.totalCentavos, 0);

  const dash = await dashboard();
  assert.equal(dash.summary.faturamentoHojeCentavos, 1300);
  assert.equal(dash.summary.pagamentosHoje, 2);

  const reportToday = await report();
  assert.equal(reportToday.faturamentoCentavos, 1300);
  assert.equal(reportToday.recebidos, 2);
  assert.equal(reportToday.sessoesPagas, 1);
  assert.equal(reportToday.ticketMedioCentavos, 1300);
  assert.equal(reportToday.pendenteCentavos, 0);

  const details = await request(ctx.app)
    .get(`/api/sessions/${prepaid.id}`)
    .set(auth(token));
  const paymentEvents = details.body.eventos.filter((event) => event.tipo === 'pagamento');
  assert.ok(paymentEvents.length >= 2);
  assert.ok(details.body.eventos.some((event) => event.tipo === 'renovacao'));
});

test('encerrar uma sessão totalmente adiantada não gera cobrança duplicada', async () => {
  const c02 = carts.find((cart) => cart.codigo === 'C02');
  const started = await request(ctx.app)
    .post('/api/sessions')
    .set(auth(token))
    .send({
      cart_id: c02.id,
      cliente_nome: 'Cliente Totalmente Adiantado',
      plano_id: plans[0].id,
      pagamento_adiantado: true,
      forma_pagamento: 'cartao',
    });
  assert.equal(started.status, 201);
  const id = started.body.sessao.id;

  const beforeEnd = await cash();
  assert.equal(beforeEnd.totais.totalCentavos, 1800);

  const ended = await request(ctx.app)
    .post(`/api/sessions/${id}/end`)
    .set(auth(token))
    .send({ pago: true, forma_pagamento: 'cartao' });
  assert.equal(ended.status, 200);
  assert.equal(ended.body.sessao.pago, true);
  assert.equal(ended.body.sessao.valorPagoCentavos, 500);

  const afterEnd = await cash();
  assert.equal(afterEnd.totais.totalCentavos, 1800);
  assert.equal(afterEnd.totais.cartaoCentavos, 500);
  assert.equal(afterEnd.pagamentos.length, 3);

  const ledger = await request(ctx.app).get('/api/sessions').set(auth(token));
  assert.equal(ledger.body.resumo.pagoCentavos, 1800);
  assert.equal(ledger.body.resumo.pendenteCentavos, 0);
});
