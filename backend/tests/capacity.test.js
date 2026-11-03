import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { auth, createTestContext } from './helpers.js';

const ctx = await createTestContext();
const api = request(ctx.app);
const admin = await ctx.loginAdmin();
const token = admin.token;
after(() => ctx.close());

test('equipamento coletivo numera entradas sem nome e respeita a capacidade', async () => {
  const categories = await api.get('/api/categories').set(auth(token));
  const category = categories.body.items.find((item) => item.slug === 'drift');
  const plans = await api.get('/api/plans').set(auth(token));
  const plan = plans.body.items[0];

  const created = await api
    .post('/api/carts')
    .set(auth(token))
    .field('codigo', 'PP1')
    .field('category_id', String(category.id))
    .field('capacidade_maxima', '3');
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const cartId = created.body.item.id;
  assert.equal(created.body.item.capacidadeMaxima, 3);

  const blank1 = await api
    .post('/api/sessions')
    .set(auth(token))
    .send({ cart_id: cartId, plano_id: plan.id });
  assert.equal(blank1.status, 201, JSON.stringify(blank1.body));
  assert.equal(blank1.body.sessao.clienteNome, 'Criança 1');

  const blank2 = await api
    .post('/api/sessions')
    .set(auth(token))
    .send({ cart_id: cartId, plano_id: plan.id });
  assert.equal(blank2.status, 201, JSON.stringify(blank2.body));
  assert.equal(blank2.body.sessao.clienteNome, 'Criança 2');

  const joao = await api
    .post('/api/sessions')
    .set(auth(token))
    .send({ cart_id: cartId, plano_id: plan.id, cliente_nome: 'João' });
  assert.equal(joao.status, 201, JSON.stringify(joao.body));

  let dashboard = await api.get('/api/dashboard').set(auth(token));
  let cart = dashboard.body.carts.find((item) => item.id === cartId);
  assert.equal(cart.status, 'lotado');
  assert.equal(cart.ocupacaoAtual, 3);
  assert.equal(cart.sessoesAtivas.length, 3);

  const fourth = await api
    .post('/api/sessions')
    .set(auth(token))
    .send({ cart_id: cartId, plano_id: plan.id, cliente_nome: 'Pedro' });
  assert.equal(fourth.status, 409);
  assert.equal(fourth.body.erro.codigo, 'equipamento_lotado');

  const endBlank1 = await api
    .post(`/api/sessions/${blank1.body.sessao.id}/end`)
    .set(auth(token))
    .send({ pago: false, cart_destino: 'disponivel' });
  assert.equal(endBlank1.status, 200, JSON.stringify(endBlank1.body));

  dashboard = await api.get('/api/dashboard').set(auth(token));
  cart = dashboard.body.carts.find((item) => item.id === cartId);
  assert.equal(cart.status, 'em_uso');
  assert.equal(cart.ocupacaoAtual, 2);

  await api
    .post(`/api/sessions/${blank2.body.sessao.id}/end`)
    .set(auth(token))
    .send({ pago: false, cart_destino: 'disponivel' });
  await api
    .post(`/api/sessions/${joao.body.sessao.id}/end`)
    .set(auth(token))
    .send({ pago: false, cart_destino: 'disponivel' });

  dashboard = await api.get('/api/dashboard').set(auth(token));
  cart = dashboard.body.carts.find((item) => item.id === cartId);
  assert.equal(cart.status, 'disponivel');
  assert.equal(cart.ocupacaoAtual, 0);
});
