import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { auth, createTestContext } from './helpers.js';

const ctx = await createTestContext();
const api = request(ctx.app);
after(() => ctx.close());

test('superadmin altera a própria senha com bcrypt, mínimo 6 e AuditLog', async () => {
  const login = await api.post('/api/auth/login').send({ username: 'superadmin', password: 'superadmin123' });
  assert.equal(login.status, 200);
  const changed = await api
    .post('/api/auth/change-password')
    .set(auth(login.body.accessToken))
    .send({ senha_atual: 'superadmin123', senha_nova: 'SuperNova123' });
  assert.equal(changed.status, 200);
  let token = changed.body.accessToken;

  const wrong = await api
    .put('/api/superadmin/password')
    .set(auth(token))
    .send({ senha_atual: 'errada', nova_senha: 'NovaSenha1' });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.erro.mensagem, /atual incorreta/i);

  const short = await api
    .put('/api/superadmin/password')
    .set(auth(token))
    .send({ senha_atual: 'SuperNova123', nova_senha: '12345' });
  assert.equal(short.status, 400);

  const ok = await api
    .put('/api/superadmin/password')
    .set(auth(token))
    .send({ senha_atual: 'SuperNova123', nova_senha: 'NovaSenha1' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(ok.body.accessToken);
  token = ok.body.accessToken;
  const me = await api.get('/api/auth/me').set(auth(token));
  assert.equal(me.status, 200);

  const audit = ctx.db
    .prepare("SELECT * FROM audit_logs WHERE tipo = 'password_change' AND superadmin_id = ?")
    .get(me.body.user.id);
  assert.ok(audit);
  assert.equal(audit.tenant_id, null);
  assert.ok(audit.iniciado_em);
  assert.ok(audit.finalizado_em);

  const oldLogin = await api.post('/api/auth/login').send({ username: 'superadmin', password: 'SuperNova123' });
  assert.equal(oldLogin.status, 401);
  const newLogin = await api.post('/api/auth/login').send({ username: 'superadmin', password: 'NovaSenha1' });
  assert.equal(newLogin.status, 200);
});
