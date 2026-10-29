import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { auth, createTestContext } from './helpers.js';

const ctx = await createTestContext();
const api = request(ctx.app);
const admin = await ctx.loginAdmin();
const tokenA = admin.token;
let tenantA;
let categoriesA;
let cartsA;
let plansA;
let signupB;
let tokenB;

after(() => ctx.close());

async function createOperator(adminToken, username) {
  const res = await api
    .post('/api/users')
    .set(auth(adminToken))
    .send({ nome: username, username, senha: 'operador123', role: 'operador' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const login = await api.post('/api/auth/login').send({ username, password: 'operador123' });
  const changed = await api
    .post('/api/auth/change-password')
    .set(auth(login.body.accessToken))
    .send({ senha_atual: 'operador123', senha_nova: 'operadorNova123' });
  assert.equal(changed.status, 200);
  return changed.body.accessToken;
}

test('tenant A e tenant B ficam isolados; signup cria categorias e planos padrão', async () => {
  const cats = await api.get('/api/categories').set(auth(tokenA));
  assert.equal(cats.status, 200);
  categoriesA = cats.body.items;
  assert.deepEqual(categoriesA.map((c) => c.slug).sort(), ['drift', 'kart', 'patinete', 'quadriciclo']);

  cartsA = (await api.get('/api/carts').set(auth(tokenA))).body.items;
  plansA = (await api.get('/api/plans').set(auth(tokenA))).body.items;
  assert.equal(plansA.length, 3);

  signupB = await api.post('/api/public/signup').send({
    nome: 'Praça B',
    adminNome: 'Admin B',
    email: 'adminb@example.com',
    senha: 'SenhaB1234',
  });
  assert.equal(signupB.status, 201, JSON.stringify(signupB.body));
  tokenB = signupB.body.accessToken;
  assert.equal(signupB.body.user.role, 'admin');
  assert.equal(signupB.body.user.tenantSlug, 'praca-b');
  assert.equal(signupB.body.tenant.nome, 'Praça B');

  const catsB = await api.get('/api/categories').set(auth(tokenB));
  assert.equal(catsB.status, 200);
  assert.equal(catsB.body.items.length, 4);
  const plansB = await api.get('/api/plans').set(auth(tokenB));
  assert.equal(plansB.body.items.length, 3);
  const cartsB = await api.get('/api/carts').set(auth(tokenB));
  assert.equal(cartsB.body.items.length, 0);

  // IDs de A não podem ser acessados por B: 404, nunca 403.
  const crossCart = await api
    .patch(`/api/carts/${cartsA[0].id}`)
    .set(auth(tokenB))
    .send({ status: 'carregando' });
  assert.equal(crossCart.status, 404);
  const crossSession = await api.get(`/api/sessions/1`).set(auth(tokenB));
  assert.equal(crossSession.status, 404);
  const crossUser = await api.get(`/api/users/${admin.user.id}`).set(auth(tokenB));
  assert.equal(crossUser.status, 404);
  const superAsAdmin = await api.get('/api/superadmin/tenants').set(auth(tokenA));
  assert.equal(superAsAdmin.status, 403);
  const superCreateAsAdmin = await api
    .post('/api/superadmin/tenants')
    .set(auth(tokenA))
    .send({ nome: 'Invasor', adminNome: 'Invasor', email: 'invasor@example.com', senha: 'Invasor123' });
  assert.equal(superCreateAsAdmin.status, 403);
  const usersB = await api.get('/api/users').set(auth(tokenB));
  assert.ok(usersB.body.items.every((u) => u.tenantId === signupB.body.tenant.id));
  assert.ok(!usersB.body.items.some((u) => u.username === 'admin'));

  const operatorB = await createOperator(tokenB, 'opb');
  const opCarts = await api.get('/api/carts').set(auth(operatorB));
  assert.equal(opCarts.status, 200);
  assert.equal(opCarts.body.items.length, 0);
  const opUsers = await api.get('/api/users').set(auth(operatorB));
  assert.equal(opUsers.status, 403);
});

test('superadmin lista/desativa tenants, mas não acessa dados operacionais', async () => {
  const login = await api.post('/api/auth/login').send({
    username: 'superadmin',
    password: 'superadmin123',
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.mustChangePassword, true);
  const changed = await api
    .post('/api/auth/change-password')
    .set(auth(login.body.accessToken))
    .send({ senha_atual: 'superadmin123', senha_nova: 'SuperNova123' });
  assert.equal(changed.status, 200);
  const superToken = changed.body.accessToken;

  const tenants = await api.get('/api/superadmin/tenants').set(auth(superToken));
  assert.equal(tenants.status, 200);
  assert.ok(tenants.body.items.length >= 2);
  assert.ok(tenants.body.items.every((t) => !('sessoesDetalhes' in t)));

  const dashboard = await api.get('/api/dashboard').set(auth(superToken));
  assert.equal(dashboard.status, 403);
  const sessions = await api.get('/api/sessions').set(auth(superToken));
  assert.equal(sessions.status, 403);

  const createdTenant = await api
    .post('/api/superadmin/tenants')
    .set(auth(superToken))
    .send({ nome: 'Terceiro Negócio', adminNome: 'Terceiro Admin', email: 'terceiro@example.com', senha: 'Terceiro123' });
  assert.equal(createdTenant.status, 201, JSON.stringify(createdTenant.body));
  assert.equal(createdTenant.body.item.nome, 'Terceiro Negócio');
  const createdLogin = await api.post('/api/auth/login').send({
    username: 'terceiro@example.com',
    password: 'Terceiro123',
  });
  assert.equal(createdLogin.status, 200);
  const createdCarts = await api.get('/api/carts').set(auth(createdLogin.body.accessToken));
  assert.equal(createdCarts.body.items.length, 0);

  const tenantB = tenants.body.items.find((t) => t.id === signupB.body.tenant.id);
  const deactivate = await api
    .patch(`/api/superadmin/tenants/${tenantB.id}`)
    .set(auth(superToken))
    .send({ ativo: false });
  assert.equal(deactivate.status, 200);
  assert.equal(deactivate.body.item.ativo, false);

  const blockedB = await api.get('/api/dashboard').set(auth(tokenB));
  assert.ok([401, 403].includes(blockedB.status), `token do tenant inativo: ${blockedB.status}`);
  const blockedLogin = await api.post('/api/auth/login').send({
    username: 'adminb@example.com',
    password: 'SenhaB1234',
  });
  assert.equal(blockedLogin.status, 403);

  const reactivate = await api
    .patch(`/api/superadmin/tenants/${tenantB.id}`)
    .set(auth(superToken))
    .send({ ativo: true });
  assert.equal(reactivate.status, 200);
  const loginAgain = await api.post('/api/auth/login').send({
    username: 'adminb@example.com',
    password: 'SenhaB1234',
  });
  assert.equal(loginAgain.status, 200);
  tokenB = loginAgain.body.accessToken;
});

test('categoria nova aparece no carrinho e filtra planos por categoria', async () => {
  const newCategory = await api
    .post('/api/categories')
    .set(auth(tokenB))
    .send({ nome: 'Bicicleta', icone: '🚲', cor: '#0891b2' });
  assert.equal(newCategory.status, 201, JSON.stringify(newCategory.body));
  const category = newCategory.body.item;
  assert.equal(category.slug, 'bicicleta');

  const cart = await api
    .post('/api/carts')
    .set(auth(tokenB))
    .field('codigo', 'B01')
    .field('category_id', String(category.id))
    .field('status', 'disponivel');
  assert.equal(cart.status, 201, JSON.stringify(cart.body));
  assert.equal(cart.body.item.category.nome, 'Bicicleta');

  const drift = (await api.get('/api/categories').set(auth(tokenB))).body.items.find(
    (c) => c.slug === 'drift',
  );
  const specific = await api
    .post('/api/plans')
    .set(auth(tokenB))
    .send({ nome: 'Bike 8 min', minutos: 8, valor_centavos: 700, category_id: category.id });
  assert.equal(specific.status, 201, JSON.stringify(specific.body));
  const other = await api
    .post('/api/plans')
    .set(auth(tokenB))
    .send({ nome: 'Drift 8 min', minutos: 8, valor_centavos: 800, category_id: drift.id });
  assert.equal(other.status, 201);

  const filtered = await api
    .get(`/api/plans?categoryId=${category.id}`)
    .set(auth(tokenB));
  assert.equal(filtered.status, 200);
  assert.ok(filtered.body.items.some((p) => p.id === specific.body.item.id));
  assert.ok(filtered.body.items.every((p) => p.categoryId === null || p.categoryId === category.id));

  const wrongPlan = await api
    .post('/api/sessions')
    .set(auth(tokenB))
    .send({ cart_id: cart.body.item.id, plano_id: other.body.item.id });
  assert.equal(wrongPlan.status, 400);

  const started = await api
    .post('/api/sessions')
    .set(auth(tokenB))
    .send({ cart_id: cart.body.item.id, plano_id: specific.body.item.id });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  assert.equal(started.body.sessao.cartCategoryNome, 'Bicicleta');

  const dashboard = await api.get('/api/dashboard').set(auth(tokenB));
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.categories.length, 5);
  assert.ok(dashboard.body.carts.some((c) => c.categoryId === category.id));
});

test('scan por QR/código respeita tenant; PDF; check-in e destino', async () => {
  const cartA = cartsA.find((c) => c.codigo === 'C01');
  const own = await api.get(`/api/scan/${cartA.qrToken}`).set(auth(tokenA));
  assert.equal(own.status, 200);
  assert.equal(own.body.cart.codigo, 'C01');

  const otherTenant = await api.get(`/api/scan/${cartA.qrToken}`).set(auth(tokenB));
  assert.equal(otherTenant.status, 404);
  assert.match(otherTenant.body.erro.mensagem, /não reconhecido/i);

  const byCode = await api.get('/api/scan/code/C01').set(auth(tokenA));
  assert.equal(byCode.status, 200);
  const byCodeB = await api.get('/api/scan/code/C01').set(auth(tokenB));
  assert.equal(byCodeB.status, 404);

  const pdf = await api
    .get('/api/qrcodes/pdf?baseUrl=https://exemplo.tailnet.ts.net')
    .set(auth(tokenA));
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers['content-type'], /application\/pdf/);
  assert.equal(pdf.body.subarray(0, 4).toString(), '%PDF');

  const opToken = await createOperator(tokenA, 'opa');
  const charging = cartsA.find((c) => c.codigo === 'C03');
  const checkinOp = await api.post(`/api/carts/${charging.id}/checkin`).set(auth(opToken));
  assert.equal(checkinOp.status, 200);

  const maintenance = cartsA.find((c) => c.codigo === 'C04');
  const checkinOpBlocked = await api
    .post(`/api/carts/${maintenance.id}/checkin`)
    .set(auth(opToken))
    .send({ observacao: 'tentativa' });
  assert.equal(checkinOpBlocked.status, 403);
  const checkinAdmin = await api
    .post(`/api/carts/${maintenance.id}/checkin`)
    .set(auth(tokenA))
    .send({ observacao: 'Bateria trocada' });
  assert.equal(checkinAdmin.status, 200);

  const start = await api
    .post('/api/sessions')
    .set(auth(tokenA))
    .send({ cart_id: cartA.id, plano_id: plansA[0].id });
  assert.equal(start.status, 201);
  const end = await api
    .post(`/api/sessions/${start.body.sessao.id}/end`)
    .set(auth(tokenA))
    .send({ pago: false, cart_destino: 'carregando' });
  assert.equal(end.status, 200);
  const list = await api.get('/api/carts').set(auth(tokenA));
  assert.equal(list.body.items.find((c) => c.id === cartA.id).status, 'carregando');
});

test('cliente opcional, edição posterior e relatório sem identificação', async () => {
  const cart = (await api.get('/api/carts').set(auth(tokenA))).body.items.find(
    (c) => c.status === 'disponivel',
  );
  assert.ok(cart);
  const started = await api
    .post('/api/sessions')
    .set(auth(tokenA))
    .send({ cart_id: cart.id, plano_id: plansA[0].id, cliente_nome: null });
  assert.equal(started.status, 201, JSON.stringify(started.body));
  const session = started.body.sessao;
  assert.equal(session.clienteNome, null);

  const dashboard = await api.get('/api/dashboard').set(auth(tokenA));
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.carts.find((c) => c.id === cart.id).sessaoAtiva.clienteNome, null);

  const paidNow = await api
    .post(`/api/sessions/${session.id}/pay-active`)
    .set(auth(tokenA))
    .send({ forma_pagamento: 'pix' });
  assert.equal(paidNow.status, 200, JSON.stringify(paidNow.body));
  assert.equal(paidNow.body.sessao.pago, true);
  assert.equal(paidNow.body.sessao.valorPendenteCentavos, 0);

  const updated = await api
    .patch(`/api/sessions/${session.id}/client`)
    .set(auth(tokenA))
    .send({ cliente_nome: 'Cliente Identificado' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.sessao.clienteNome, 'Cliente Identificado');

  const events = await api.get(`/api/sessions/${session.id}/events`).set(auth(tokenA));
  assert.ok(events.body.items.some((event) => event.tipo === 'edicao_cliente'));

  await api
    .post(`/api/sessions/${session.id}/end`)
    .set(auth(tokenA))
    .send({ pago: false, cart_destino: 'disponivel' });

  const second = await api
    .post('/api/sessions')
    .set(auth(tokenA))
    .send({ cart_id: cart.id, plano_id: plansA[0].id });
  assert.equal(second.status, 201);
  await api
    .post(`/api/sessions/${second.body.sessao.id}/end`)
    .set(auth(tokenA))
    .send({ pago: false, cart_destino: 'disponivel' });

  const report = await api.get('/api/reports/summary').set(auth(tokenA));
  assert.equal(report.status, 200);
  assert.ok(
    report.body.devedores.some((debtor) => debtor.clienteNome === 'Sem identificação'),
    'relatório deve agrupar cliente nulo como Sem identificação',
  );
});
