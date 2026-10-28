import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { auth, createTestContext } from './helpers.js';

const ctx = await createTestContext();
const admin = await ctx.loginAdmin();
const adminToken = admin.token;
let plans;
let carts;
let supervisor;

after(() => ctx.close());

async function getDashboard() {
  const res = await request(ctx.app).get('/api/dashboard').set(auth(adminToken));
  assert.equal(res.status, 200);
  return res.body;
}

async function startSession(cartId, payload = {}) {
  return request(ctx.app)
    .post('/api/sessions')
    .set(auth(adminToken))
    .send({
      cart_id: cartId,
      cliente_nome: 'João da Silva',
      plano_id: plans[0].id,
      ...payload,
    });
}

test('carrinhos: lista, upload de foto, código único e validação de imagem', async () => {
  const list = await request(ctx.app).get('/api/carts').set(auth(adminToken));
  assert.equal(list.status, 200);
  assert.equal(list.body.items.length, 4);
  carts = list.body.items;

  const jpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AX//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/AX//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8Qf//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQ2ATA/8QAFBEBAAAAAAAAAAAAAAAAAAAAEP/aAAgBAQABPxB//9k=',
    'base64',
  );

  const created = await request(ctx.app)
    .post('/api/carts')
    .set(auth(adminToken))
    .field('codigo', 'C05')
    .field('status', 'disponivel')
    .attach('foto', jpeg, { filename: 'carrinho.jpg', contentType: 'image/jpeg' });
  assert.equal(created.status, 201);
  assert.match(created.body.item.fotoUrl, /^\/uploads\/.+\.jpg$/);

  const photo = await request(ctx.app).get(created.body.item.fotoUrl);
  assert.equal(photo.status, 200);

  const duplicate = await request(ctx.app)
    .post('/api/carts')
    .set(auth(adminToken))
    .field('codigo', 'C05');
  assert.equal(duplicate.status, 409);

  const invalid = await request(ctx.app)
    .post('/api/carts')
    .set(auth(adminToken))
    .field('codigo', 'C06')
    .attach('foto', Buffer.from('nao-e-imagem'), {
      filename: 'fake.jpg',
      contentType: 'image/jpeg',
    });
  assert.equal(invalid.status, 400);

  const removed = await request(ctx.app)
    .patch(`/api/carts/${created.body.item.id}`)
    .set(auth(adminToken))
    .field('remove_foto', '1');
  assert.equal(removed.status, 200);
  assert.equal(removed.body.item.fotoUrl, null);

  const deleted = await request(ctx.app)
    .delete(`/api/carts/${created.body.item.id}`)
    .set(auth(adminToken));
  assert.equal(deleted.status, 200);
});

test('planos e sessão: inicia no servidor, não duplica e renova somando tempo', async () => {
  const planRes = await request(ctx.app).get('/api/plans').set(auth(adminToken));
  assert.equal(planRes.status, 200);
  plans = planRes.body.items;
  assert.equal(plans.length, 3);

  const c01 = carts.find((cart) => cart.codigo === 'C01');
  const c04 = carts.find((cart) => cart.codigo === 'C04');

  const started = await startSession(c01.id);
  assert.equal(started.status, 201, JSON.stringify(started.body));
  const session = started.body.sessao;
  supervisor = session;
  assert.equal(session.status, 'em_andamento');
  assert.equal(session.cartCodigo, 'C01');
  assert.equal(session.pago, false);
  assert.ok(new Date(started.body.serverNow).getTime() >= new Date(session.iniciadoEm).getTime());

  const durationMs = new Date(session.fimPrevistoEm) - new Date(session.iniciadoEm);
  assert.ok(Math.abs(durationMs - 5 * 60_000) < 2000, 'fim previsto deve ser 5 min após o início');

  const duplicate = await startSession(c01.id);
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.erro.codigo, 'carrinho_indisponivel');

  const unavailable = await startSession(c04.id);
  assert.equal(unavailable.status, 409);

  let dashboard = await getDashboard();
  const cartOnDashboard = dashboard.carts.find((cart) => cart.id === c01.id);
  assert.equal(cartOnDashboard.status, 'em_uso');
  assert.equal(cartOnDashboard.sessaoAtiva.clienteNome, 'João da Silva');
  assert.equal(cartOnDashboard.sessaoAtiva.cartCodigo, 'C01');

  const renewed = await request(ctx.app)
    .post(`/api/sessions/${session.id}/renew`)
    .set(auth(adminToken))
    .send({ plano_id: plans[1].id });
  assert.equal(renewed.status, 200);
  const renewedSession = renewed.body.sessao;
  assert.equal(renewedSession.minutosContratados, 15);
  assert.equal(renewedSession.valorCentavos, 1300);
  const addedMs = new Date(renewedSession.fimPrevistoEm) - new Date(session.fimPrevistoEm);
  assert.ok(Math.abs(addedMs - 10 * 60_000) < 2000, 'renovação deve somar 10 min ao fim anterior');

  const active = await request(ctx.app).get('/api/sessions/active').set(auth(adminToken));
  assert.equal(active.status, 200);
  assert.equal(active.body.items.length, 1);

  // "Reinício do backend": nova conexão ao mesmo SQLite mantém o timer.
  const { openDb } = await import('../src/db.js');
  const { createApp } = await import('../src/app.js');
  const db2 = openDb(process.env.DB_PATH);
  const app2 = createApp({ db: db2 });
  const dashboard2 = await request(app2).get('/api/dashboard').set(auth(adminToken));
  assert.equal(dashboard2.status, 200);
  const persisted = dashboard2.body.sessoesAtivas.find((item) => item.id === session.id);
  assert.ok(persisted, 'sessão ativa deve persistir após "reiniciar" o backend');
  assert.equal(persisted.fimPrevistoEm, renewedSession.fimPrevistoEm);
  db2.close();
});

test('encerrar sem pagamento deixa pendente e libera o carrinho', async () => {
  const ended = await request(ctx.app)
    .post(`/api/sessions/${supervisor.id}/end`)
    .set(auth(adminToken))
    .send({ pago: false });
  assert.equal(ended.status, 200, JSON.stringify(ended.body));
  assert.equal(ended.body.sessao.status, 'encerrada');
  assert.equal(ended.body.sessao.pago, false);
  assert.ok(ended.body.sessao.duracaoSegundos >= 0);

  const duplicateEnd = await request(ctx.app)
    .post(`/api/sessions/${supervisor.id}/end`)
    .set(auth(adminToken))
    .send({ pago: false });
  assert.equal(duplicateEnd.status, 404);

  const dashboard = await getDashboard();
  const c01 = dashboard.carts.find((cart) => cart.codigo === 'C01');
  assert.equal(c01.status, 'disponivel');
  assert.ok(dashboard.summary.pendenteHojeCentavos >= 1300);
});

test('operador marca pagamento; não pode desmarcar; admin edita valor com auditoria', async () => {
  const created = await ctx.createOperator(adminToken, 'operadorPag');
  assert.equal(created.status, 201);

  const opAgent = request.agent(ctx.app);
  const opLogin = await opAgent
    .post('/api/auth/login')
    .send({ username: 'operadorPag', password: 'operador123' });
  const changed = await opAgent
    .post('/api/auth/change-password')
    .set(auth(opLogin.body.accessToken))
    .send({ senha_atual: 'operador123', senha_nova: 'operadorNova123' });
  const opToken = changed.body.accessToken;

  const paid = await request(ctx.app)
    .post(`/api/sessions/${supervisor.id}/payment`)
    .set(auth(opToken))
    .send({ pago: true, forma_pagamento: 'pix' });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.sessao.pago, true);

  const unpay = await request(ctx.app)
    .post(`/api/sessions/${supervisor.id}/payment`)
    .set(auth(opToken))
    .send({ pago: false });
  assert.equal(unpay.status, 403);

  const edited = await request(ctx.app)
    .patch(`/api/sessions/${supervisor.id}/value`)
    .set(auth(adminToken))
    .send({ valor_centavos: 2000, motivo: 'Ajuste combinado' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.sessao.valorCentavos, 2000);

  const details = await request(ctx.app)
    .get(`/api/sessions/${supervisor.id}`)
    .set(auth(adminToken));
  assert.equal(details.status, 200);
  const types = details.body.eventos.map((event) => event.tipo);
  assert.ok(types.includes('inicio'));
  assert.ok(types.includes('renovacao'));
  assert.ok(types.includes('encerramento'));
  assert.ok(types.includes('pagamento'));
  assert.ok(types.includes('edicao_valor'));

  const history = await request(ctx.app)
    .get('/api/sessions?pago=1&limit=10')
    .set(auth(adminToken));
  assert.equal(history.status, 200);
  assert.ok(history.body.items.some((item) => item.id === supervisor.id));
  assert.ok(history.body.resumo.pagoCentavos >= 2000);
});

test('timer resiliente: sessão vencida continua ativa e pode ser encerrada', async () => {
  const c02 = (await getDashboard()).carts.find((cart) => cart.codigo === 'C02');
  const started = await startSession(c02.id, {
    plano_id: null,
    minutos: 1,
    valor_centavos: 300,
    cliente_nome: 'Cliente Atrasado',
  });
  assert.equal(started.status, 201);

  const past = new Date(Date.now() - 60_000).toISOString();
  ctx.db
    .prepare('UPDATE sessions SET fim_previsto_em = ? WHERE id = ?')
    .run(past, started.body.sessao.id);

  const dash = await getDashboard();
  const session = dash.sessoesAtivas.find((item) => item.id === started.body.sessao.id);
  assert.ok(session);
  assert.equal(session.fimPrevistoEm, past);
  assert.ok(new Date(session.fimPrevistoEm).getTime() < Date.now());

  const ended = await request(ctx.app)
    .post(`/api/sessions/${started.body.sessao.id}/end`)
    .set(auth(adminToken))
    .send({ pago: true, forma_pagamento: 'dinheiro' });
  assert.equal(ended.status, 200);
  assert.equal(ended.body.sessao.status, 'encerrada');
});

test('cancelamento e exclusão são exclusivos de admin e ficam no histórico', async () => {
  const c01 = (await getDashboard()).carts.find((cart) => cart.codigo === 'C01');
  const started = await startSession(c01.id, {
    plano_id: null,
    minutos: 2,
    valor_centavos: 400,
    cliente_nome: 'Cliente Cancelado',
  });
  assert.equal(started.status, 201);

  const cancelled = await request(ctx.app)
    .post(`/api/sessions/${started.body.sessao.id}/cancel`)
    .set(auth(adminToken))
    .send({ motivo: 'Cliente desistiu' });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.sessao.status, 'cancelada');
  assert.equal(cancelled.body.sessao.motivoCancelamento, 'Cliente desistiu');

  const dash = await getDashboard();
  assert.equal(dash.carts.find((cart) => cart.codigo === 'C01').status, 'disponivel');
  assert.equal(dash.summary.emUso, 0);

  const list = await request(ctx.app)
    .get('/api/sessions?status=cancelada')
    .set(auth(adminToken));
  assert.equal(list.status, 200);
  assert.ok(list.body.items.some((item) => item.id === started.body.sessao.id));

  const deleted = await request(ctx.app)
    .delete(`/api/sessions/${started.body.sessao.id}`)
    .set(auth(adminToken));
  assert.equal(deleted.status, 200);

  const listAfter = await request(ctx.app)
    .get('/api/sessions?status=cancelada')
    .set(auth(adminToken));
  assert.ok(!listAfter.body.items.some((item) => item.id === started.body.sessao.id));
});

test('relatórios, caixa, fechamento e backup', async () => {
  const dash = await getDashboard();
  assert.ok(dash.summary.faturamentoHojeCentavos >= 2300);

  const report = await request(ctx.app)
    .get('/api/reports/summary')
    .set(auth(adminToken));
  assert.equal(report.status, 200);
  assert.ok(report.body.faturamentoCentavos >= 2300);
  assert.ok(report.body.recebidos >= 1);
  assert.ok(report.body.porDia.length >= 1);
  assert.ok(report.body.horarios.length === 24);

  const cash = await request(ctx.app).get('/api/cash/summary').set(auth(adminToken));
  assert.equal(cash.status, 200);
  assert.ok(cash.body.totais.totalCentavos >= 2300);

  const closed = await request(ctx.app)
    .post('/api/cash/close')
    .set(auth(adminToken))
    .send({ observacao: 'Fechamento de teste' });
  assert.equal(closed.status, 201, JSON.stringify(closed.body));
  assert.equal(closed.body.fechamento.payload.fechado, true);

  const closedAgain = await request(ctx.app)
    .post('/api/cash/close')
    .set(auth(adminToken))
    .send({});
  assert.equal(closedAgain.status, 409);

  const closures = await request(ctx.app)
    .get('/api/cash/closures')
    .set(auth(adminToken));
  assert.equal(closures.status, 200);
  assert.ok(closures.body.items.length >= 1);

  const backup = await request(ctx.app)
    .post('/api/settings/backups')
    .set(auth(adminToken));
  assert.equal(backup.status, 201);
  const filePath = path.join(ctx.dir, 'backups', backup.body.backup.filename);
  assert.ok(fs.existsSync(filePath));

  const download = await request(ctx.app)
    .get(`/api/settings/backups/${backup.body.backup.filename}/download`)
    .set(auth(adminToken));
  assert.equal(download.status, 200);

  const settings = await request(ctx.app)
    .patch('/api/settings')
    .set(auth(adminToken))
    .send({ alert_lead_seconds: 45, nome_estabelecimento: 'Pista Teste' });
  assert.equal(settings.status, 200);

  const dash2 = await getDashboard();
  assert.equal(dash2.alertLeadSeconds, 45);
  assert.equal(dash2.nomeEstabelecimento, 'Pista Teste');
});

test('relatórios exigem admin e histórico filtra por cliente/pagamento', async () => {
  const created = await ctx.createOperator(adminToken, 'operadorDash');
  assert.equal(created.status, 201);
  const opAgent = request.agent(ctx.app);
  const opLogin = await opAgent
    .post('/api/auth/login')
    .send({ username: 'operadorDash', password: 'operador123' });
  const changed = await opAgent
    .post('/api/auth/change-password')
    .set(auth(opLogin.body.accessToken))
    .send({ senha_atual: 'operador123', senha_nova: 'operadorNova123' });
  const opToken = changed.body.accessToken;

  const forbidden = await request(ctx.app)
    .get('/api/reports/summary')
    .set(auth(opToken));
  assert.equal(forbidden.status, 403);

  const filtered = await request(ctx.app)
    .get('/api/sessions?cliente=Jo%C3%A3o&pago=1')
    .set(auth(opToken));
  assert.equal(filtered.status, 200);
  assert.ok(filtered.body.items.length >= 1);
  assert.ok(filtered.body.items.every((item) => item.clienteNome.includes('João')));
});
