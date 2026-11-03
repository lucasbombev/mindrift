import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { auth, createTestContext } from './helpers.js';

const ctx = await createTestContext();
const api = request(ctx.app);
const admin = await ctx.loginAdmin();
const token = admin.token;
after(() => ctx.close());

test('equipamento coletivo aceita sessões paralelas, exige nome e respeita capacidade', async () => {
  const categories = await api.get('/api/categories').set(auth(token));
  const category = categories.body.items.find((item) => item.slug === 'drift');
  const plans = await api.get('/api/plans').set(auth(token));
  const plan = plans.body.items[0];

  const created = await api
    .post('/api/carts')
    .set(auth(token))
    .field('codigo', 'PP1')
    .field('category_id', String(category.id))
    .field('capacidade_maxima', '2');
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const cartId = created.body.item.id;
  assert.equal(created.body.item.capacidadeMaxima, 2);

  const noName = await api
    .post('/api/sessions')
    .set(auth(token))
    .send({ cart_id: cartId, plano_id: plan.id });
  assert.equal(noName.status, 400);

  const joao = await api
    .post('/api/sessions')
    .set(auth(token))
    .send({ cart_id: cartId, plano_id: plan.id, cliente_nome: 'João' });
  assert.equal(joao.status, 201, JSON.stringify(joao.body));

  let dashboard = await api.get('/api/dashboard').set(auth(token));
  let cart = dashboard.body.carts.find((item) => item.id === cartId);
  assert.equal(cart.status, 'em_uso');
  assert.equal(cart.ocupacaoAtual, 1);
  assert.equal(cart.capacidadeMaxima, 2);

  const maria = await api
    .post('/api/sessions')
    .set(auth(token))
    .send({ cart_id: cartId, plano_id: plan.id, cliente_nome: 'Maria' });
  assert.equal(maria.status, 201, JSON.stringify(maria.body));

  dashboard = await api.get('/api/dashboard').set(auth(token));
  cart = dashboard.body.carts.find((item) => item.id === cartId);
  assert.equal(cart.status, 'lotado');
  assert.equal(cart.ocupacaoAtual, 2);
  assert.equal(cart.sessoesAtivas.length, 2);

  const third = await api
    .post('/api/sessions')
    .set(auth(token))
    .send({ cart_id: cartId, plano_id: plan.id, cliente_nome: 'Pedro' });
  assert.equal(third.status, 409);
  assert.equal(third.body.erro.codigo, 'equipamento_lotado');

  const endJoao = await api
    .post(`/api/sessions/${joao.body.sessao.id}/end`)
    .set(auth(token))
    .send({ pago: false, cart_destino: 'disponivel' });
  assert.equal(endJoao.status, 200, JSON.stringify(endJoao.body));

  dashboard = await api.get('/api/dashboard').set(auth(token));
  cart = dashboard.body.carts.find((item) => item.id === cartId);
  assert.equal(cart.status, 'em_uso');
  assert.equal(cart.ocupacaoAtual, 1);

  const endMaria = await api
    .post(`/api/sessions/${maria.body.sessao.id}/end`)
    .set(auth(token))
    .send({ pago: false, cart_destino: 'disponivel' });
  assert.equal(endMaria.status, 200, JSON.stringify(endMaria.body));
  dashboard = await api.get('/api/dashboard').set(auth(token));
  cart = dashboard.body.carts.find((item) => item.id === cartId);
  assert.equal(cart.status, 'disponivel');
  assert.equal(cart.ocupacaoAtual, 0);
});
