import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { auth, createTestContext } from './helpers.js';

const ctx = await createTestContext();
after(() => ctx.close());

test('health é público e responde ok', async () => {
  const res = await request(ctx.app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('rota protegida sem token retorna 401', async () => {
  const res = await request(ctx.app).get('/api/dashboard');
  assert.equal(res.status, 401);
});

test('login inválido retorna 401', async () => {
  const res = await ctx.login('admin', 'senha-errada');
  assert.equal(res.status, 401);
});

test('primeiro login exige troca de senha (403 nas demais rotas)', async () => {
  const login = await ctx.login('admin', 'admin123');
  assert.equal(login.status, 200);
  assert.equal(login.body.mustChangePassword, true);
  assert.equal(login.body.user.mustChangePassword, true);

  const token = login.body.accessToken;
  const blocked = await request(ctx.app).get('/api/dashboard').set(auth(token));
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.erro.codigo, 'senha_troca_obrigatoria');

  const weak = await request(ctx.app)
    .post('/api/auth/change-password')
    .set(auth(token))
    .send({ senha_atual: 'admin123', senha_nova: '12345678' });
  assert.equal(weak.status, 400);

  const ok = await request(ctx.app)
    .post('/api/auth/change-password')
    .set(auth(token))
    .send({ senha_atual: 'admin123', senha_nova: 'adminSegura123' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.mustChangePassword, false);

  const dash = await request(ctx.app).get('/api/dashboard').set(auth(ok.body.accessToken));
  assert.equal(dash.status, 200);
  assert.equal(dash.body.summary.totalCarrinhos, 4);
});

test('access token expirado/inválido é rejeitado', async () => {
  const res = await request(ctx.app).get('/api/dashboard').set(auth('token.invalido.aqui'));
  assert.equal(res.status, 401);
});

test('refresh token via cookie renova o acesso', async () => {
  const login = await ctx.login('admin', 'adminSegura123');
  assert.equal(login.status, 200);
  const refresh = await ctx.agent.post('/api/auth/refresh');
  assert.equal(refresh.status, 200);
  assert.ok(refresh.body.accessToken);

  const me = await request(ctx.app)
    .get('/api/auth/me')
    .set(auth(refresh.body.accessToken));
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, 'admin');
});

test('operador recebe 403 em todas as rotas administrativas', async () => {
  const adminLogin = await ctx.login('admin', 'adminSegura123');
  const adminToken = adminLogin.body.accessToken;

  const created = await ctx.createOperator(adminToken);
  assert.equal(created.status, 201);

  const opAgent = request.agent(ctx.app);
  const opLogin = await opAgent
    .post('/api/auth/login')
    .send({ username: 'operador1', password: 'operador123' });
  assert.equal(opLogin.status, 200);
  assert.equal(opLogin.body.mustChangePassword, true);

  const changed = await opAgent
    .post('/api/auth/change-password')
    .set(auth(opLogin.body.accessToken))
    .send({ senha_atual: 'operador123', senha_nova: 'operadorNova123' });
  assert.equal(changed.status, 200);
  const opToken = changed.body.accessToken;

  const allowed = await request(ctx.app).get('/api/dashboard').set(auth(opToken));
  assert.equal(allowed.status, 200);

  const blockedRoutes = [
    ['get', '/api/users'],
    ['get', '/api/reports/summary'],
    ['get', '/api/cash/summary'],
    ['get', '/api/settings'],
    ['post', '/api/carts'],
    ['post', '/api/plans'],
  ];
  for (const [method, path] of blockedRoutes) {
    const res = await request(ctx.app)[method](path).set(auth(opToken)).send({});
    assert.equal(res.status, 403, `${method.toUpperCase()} ${path} deveria ser 403`);
  }

  const deleteSession = await request(ctx.app)
    .delete('/api/sessions/9999')
    .set(auth(opToken));
  assert.equal(deleteSession.status, 403);

  const cancel = await request(ctx.app)
    .post('/api/sessions/9999/cancel')
    .set(auth(opToken))
    .send({ motivo: 'teste' });
  assert.equal(cancel.status, 403);

  const editValue = await request(ctx.app)
    .patch('/api/sessions/9999/value')
    .set(auth(opToken))
    .send({ valor_centavos: 100 });
  assert.equal(editValue.status, 403);

  // Operador pode usar o histórico e iniciar sessões.
  const history = await request(ctx.app).get('/api/sessions').set(auth(opToken));
  assert.equal(history.status, 200);
  const plans = await request(ctx.app).get('/api/plans').set(auth(opToken));
  assert.equal(plans.status, 200);
});

test('admin não pode desativar a própria conta nem o último admin', async () => {
  const login = await ctx.login('admin', 'adminSegura123');
  const token = login.body.accessToken;
  const me = await request(ctx.app).get('/api/auth/me').set(auth(token));
  const self = await request(ctx.app)
    .delete(`/api/users/${me.body.user.id}`)
    .set(auth(token));
  assert.equal(self.status, 400);
});

test('usuário desativado perde o acesso', async () => {
  const login = await ctx.login('admin', 'adminSegura123');
  const adminToken = login.body.accessToken;
  const created = await ctx.createOperator(adminToken, 'operador2');
  assert.equal(created.status, 201);

  const opLogin = await request(ctx.app)
    .post('/api/auth/login')
    .send({ username: 'operador2', password: 'operador123' });
  assert.equal(opLogin.status, 200);

  const deactivated = await request(ctx.app)
    .delete(`/api/users/${created.body.item.id}`)
    .set(auth(adminToken));
  assert.equal(deactivated.status, 200);
  assert.equal(deactivated.body.item.ativo, false);

  const afterLogin = await request(ctx.app)
    .post('/api/auth/login')
    .send({ username: 'operador2', password: 'operador123' });
  assert.equal(afterLogin.status, 401);
});

test('rate limit bloqueia excesso de tentativas de login', async () => {
  let lastStatus = 0;
  for (let i = 0; i < 12; i += 1) {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'errada' });
    lastStatus = res.status;
    if (lastStatus === 429) break;
  }
  assert.equal(lastStatus, 429);
});
