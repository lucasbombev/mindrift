import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { auth, createTestContext } from './helpers.js';

const ctx = await createTestContext();
const api = request(ctx.app);
const admin = await ctx.loginAdmin();
const token = admin.token;

after(() => ctx.close());

test('timer livre inicia sem fim_previsto, não renova e encerra com valor manual', async () => {
  const carts = await api.get('/api/carts').set(auth(token));
  const cart = carts.body.items.find((item) => item.status === 'disponivel');
  assert.ok(cart);

  const started = await api
    .post('/api/sessions')
    .set(auth(token))
    .send({ cart_id: cart.id, cliente_nome: 'Timer Livre', minutos: 0, valor_centavos: 0 });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  const session = started.body.sessao;
  assert.equal(session.minutosContratados, 0);
  assert.equal(session.fimPrevistoEm, null);
  assert.equal(session.valorCentavos, 0);

  const active = await api.get('/api/sessions/active').set(auth(token));
  assert.equal(active.status, 200);
  assert.equal(active.body.items.find((item) => item.id === session.id).fimPrevistoEm, null);
  const dashboard = await api.get('/api/dashboard').set(auth(token));
  assert.equal(dashboard.body.carts.find((item) => item.id === cart.id).sessaoAtiva.fimPrevistoEm, null);

  const renew = await api
    .post(`/api/sessions/${session.id}/renew`)
    .set(auth(token))
    .send({ minutos: 5, valor_centavos: 500 });
  assert.equal(renew.status, 409);
  assert.match(renew.body.erro.mensagem, /Timer livre/i);

  const end = await api
    .post(`/api/sessions/${session.id}/end`)
    .set(auth(token))
    .send({ valor_final_centavos: 1200, pago: true, forma_pagamento: 'pix', cart_destino: 'disponivel' });
  assert.equal(end.status, 200, JSON.stringify(end.body));
  assert.equal(end.body.sessao.valorCentavos, 1200);
  assert.equal(end.body.sessao.pago, true);
  assert.equal(end.body.sessao.fimPrevistoEm, null);
  assert.ok(end.body.sessao.duracaoSegundos >= 0);

  const details = await api.get(`/api/sessions/${session.id}`).set(auth(token));
  assert.ok(details.body.eventos.some((event) => event.tipo === 'edicao_valor'));
});

test('timer livre rejeita pagamento adiantado', async () => {
  const carts = await api.get('/api/carts').set(auth(token));
  const cart = carts.body.items.find((item) => item.status === 'disponivel');
  const res = await api
    .post('/api/sessions')
    .set(auth(token))
    .send({
      cart_id: cart.id,
      minutos: 0,
      valor_centavos: 0,
      pagamento_adiantado: true,
      forma_pagamento: 'pix',
    });
  assert.equal(res.status, 400);
});

test('push nasce habilitado, status é por dispositivo e preferência persiste', async () => {
  const key = await api.get('/api/push/public-key').set(auth(token));
  assert.equal(key.status, 200);
  assert.ok(key.body.publicKey);
  const me = await api.get('/api/auth/me').set(auth(token));
  assert.equal(me.body.user.pushEnabled, true);

  const endpoint = 'https://example.com/push/test-endpoint';
  const sub = { endpoint, keys: { p256dh: 'abc', auth: 'def' } };
  const before = await api.get(`/api/push/status?endpoint=${encodeURIComponent(endpoint)}`).set(auth(token));
  assert.equal(before.status, 200);
  assert.equal(before.body.ativo, false);

  const saved = await api.post('/api/push/subscribe').set(auth(token)).send({ subscription: sub });
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  const savedStatus = await api.get(`/api/push/status?endpoint=${encodeURIComponent(endpoint)}`).set(auth(token));
  assert.equal(savedStatus.body.ativo, true);
  assert.equal(savedStatus.body.pushEnabled, true);

  const otherStatus = await api.get('/api/push/status?endpoint=https://example.com/outro').set(auth(token));
  assert.equal(otherStatus.body.ativo, false);

  const pref = await api.patch('/api/push/preferences').set(auth(token)).send({ enabled: false });
  assert.equal(pref.status, 200);
  assert.equal(pref.body.pushEnabled, false);
  const meOff = await api.get('/api/auth/me').set(auth(token));
  assert.equal(meOff.body.user.pushEnabled, false);

  const removed = await api
    .delete('/api/push/unsubscribe')
    .set(auth(token))
    .send({ endpoint });
  assert.equal(removed.status, 200);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n, 0);
});
