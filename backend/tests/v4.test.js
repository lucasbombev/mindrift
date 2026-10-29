import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { auth, createTestContext } from './helpers.js';

const ctx = await createTestContext();
const api = request(ctx.app);
const admin = await ctx.loginAdmin();
const tokenA = admin.token;
let superToken;
let tenantB;
let tokenB;

after(() => ctx.close());

async function loginSuper() {
  const login = await api.post('/api/auth/login').send({ username: 'superadmin', password: 'superadmin123' });
  const changed = await api
    .post('/api/auth/change-password')
    .set(auth(login.body.accessToken))
    .send({ senha_atual: 'superadmin123', senha_nova: 'SuperNova123' });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  superToken = changed.body.accessToken;
}

async function signupB(email = 'tenantb@example.com', telefone = '(11) 91234-5678') {
  return api.post('/api/public/signup').send({
    nome: 'Tenant B', adminNome: 'Admin B', email, telefone, senha: 'SenhaB1234',
  });
}

test('telefone é obrigatório no signup do admin e métricas globais funcionam', async () => {
  const missing = await signupB('semtelefone@example.com', '');
  assert.equal(missing.status, 400);
  assert.equal(missing.body.erro.campo, 'telefone');

  const ok = await signupB();
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.user.telefone, '+5511912345678');
  tenantB = ok.body.tenant;
  tokenB = ok.body.accessToken;

  await loginSuper();
  const metrics = await api.get('/api/superadmin/metrics').set(auth(superToken));
  assert.equal(metrics.status, 200);
  assert.ok(metrics.body.tenantsAtivos >= 2);
  assert.ok(metrics.body.carrinhos >= 4);
  assert.equal(typeof metrics.body.sessoesHoje, 'number');

  const banned = await api.get('/api/superadmin/metrics').set(auth(tokenA));
  assert.equal(banned.status, 403);
});

test('suspender tenant bloqueia login de admin e operador com mensagem de suspensão', async () => {
  const op = await api
    .post('/api/users')
    .set(auth(tokenB))
    .send({ nome: 'Operador B', username: 'opb', senha: 'Operador123', role: 'operador' });
  assert.equal(op.status, 201, JSON.stringify(op.body));

  const suspend = await api
    .patch(`/api/superadmin/tenants/${tenantB.id}`)
    .set(auth(superToken))
    .send({ ativo: false });
  assert.equal(suspend.status, 200);

  const loginAdmin = await api.post('/api/auth/login').send({ username: 'tenantb@example.com', password: 'SenhaB1234' });
  assert.equal(loginAdmin.status, 403);
  assert.match(loginAdmin.body.erro.mensagem, /suspenso/i);
  const loginOp = await api.post('/api/auth/login').send({ username: 'opb', password: 'Operador123' });
  assert.equal(loginOp.status, 403);
  assert.match(loginOp.body.erro.mensagem, /suspenso/i);

  const reactivate = await api
    .patch(`/api/superadmin/tenants/${tenantB.id}`)
    .set(auth(superToken))
    .send({ ativo: true });
  assert.equal(reactivate.status, 200);
  const relogin = await api.post('/api/auth/login').send({ username: 'tenantb@example.com', password: 'SenhaB1234' });
  assert.equal(relogin.status, 200);
  tokenB = relogin.body.accessToken;
});

test('impersonação exige motivo, gera audit log e é encerrada', async () => {
  const noReason = await api
    .post(`/api/superadmin/tenants/${tenantB.id}/impersonate`)
    .set(auth(superToken))
    .send({ motivo: '' });
  assert.equal(noReason.status, 400);

  const started = await api
    .post(`/api/superadmin/tenants/${tenantB.id}/impersonate`)
    .set(auth(superToken))
    .send({ motivo: 'Apoiar cliente no encerramento' });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.user.role, 'admin');
  assert.equal(started.body.user.impersonation.motivo, 'Apoiar cliente no encerramento');
  const impToken = started.body.accessToken;
  const dashboard = await api.get('/api/dashboard').set(auth(impToken));
  assert.equal(dashboard.status, 200);

  const direct = await api.get('/api/dashboard').set(auth(superToken));
  assert.equal(direct.status, 403);

  const audits = await api.get('/api/superadmin/impersonations').set(auth(superToken));
  assert.equal(audits.status, 200);
  const audit = audits.body.items.find((item) => item.id === started.body.impersonation.id);
  assert.ok(audit);
  assert.equal(audit.motivo, 'Apoiar cliente no encerramento');
  assert.equal(audit.finalizadoEm, null);

  const ended = await api
    .post(`/api/impersonation/${started.body.impersonation.id}/end`)
    .set(auth(impToken));
  assert.equal(ended.status, 200);
  const afterEnd = await api.get('/api/dashboard').set(auth(impToken));
  assert.equal(afterEnd.status, 401);
});

test('reset de senha, transferência de admin e ciclo de vida com hard delete confirmado', async () => {
  const reset = await api
    .post(`/api/superadmin/tenants/${tenantB.id}/reset-admin`)
    .set(auth(superToken));
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.ok(reset.body.senhaTemporaria.length >= 8);
  const tempLogin = await api.post('/api/auth/login').send({
    username: reset.body.admin.email,
    password: reset.body.senhaTemporaria,
  });
  assert.equal(tempLogin.status, 200);
  assert.equal(tempLogin.body.mustChangePassword, true);
  const changedTemp = await api
    .post('/api/auth/change-password')
    .set(auth(tempLogin.body.accessToken))
    .send({ senha_atual: reset.body.senhaTemporaria, senha_nova: 'BAdminNova123' });
  assert.equal(changedTemp.status, 200, JSON.stringify(changedTemp.body));
  tokenB = changedTemp.body.accessToken;

  const op = await api
    .post('/api/users')
    .set(auth(tokenB))
    .send({ nome: 'Novo Admin', username: 'novoadmin', email: 'novoadmin@example.com', senha: 'NovoAdmin123', role: 'operador' });
  assert.equal(op.status, 201, JSON.stringify(op.body));
  const transfer = await api
    .post(`/api/superadmin/tenants/${tenantB.id}/transfer-admin`)
    .set(auth(superToken))
    .send({ email: 'novoadmin@example.com' });
  assert.equal(transfer.status, 200, JSON.stringify(transfer.body));
  const newLogin = await api.post('/api/auth/login').send({ username: 'novoadmin', password: 'NovoAdmin123' });
  assert.equal(newLogin.status, 200);
  const me = await api.get('/api/auth/me').set(auth(newLogin.body.accessToken));
  assert.equal(me.body.user.role, 'admin');

  const created = await api
    .post('/api/superadmin/tenants')
    .set(auth(superToken))
    .send({ nome: 'Tenant Descartável', adminNome: 'Desc Admin', email: 'desc@example.com', telefone: '(11) 99876-5432', senha: 'DescAdmin123' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const tempId = created.body.item.id;
  const soft = await api
    .patch(`/api/superadmin/tenants/${tempId}`)
    .set(auth(superToken))
    .send({ excluido: true });
  assert.equal(soft.status, 200);
  assert.equal(soft.body.item.excluido, true);
  const loginDeleted = await api.post('/api/auth/login').send({ username: 'desc@example.com', password: 'DescAdmin123' });
  assert.equal(loginDeleted.status, 403);

  const wrong = await api
    .delete(`/api/superadmin/tenants/${tempId}`)
    .set(auth(superToken))
    .send({ confirmacao: 'errado' });
  assert.equal(wrong.status, 400);
  const hard = await api
    .delete(`/api/superadmin/tenants/${tempId}`)
    .set(auth(superToken))
    .send({ confirmacao: 'tenant-descartavel' });
  assert.equal(hard.status, 200, JSON.stringify(hard.body));
  const list = await api.get('/api/superadmin/tenants').set(auth(superToken));
  assert.ok(!list.body.items.some((tenant) => tenant.id === tempId));
});

test('preferências de som persistem e comunicado global aparece no dashboard', async () => {
  const initial = await api.get('/api/preferences/sound').set(auth(tokenA));
  assert.equal(initial.status, 200);
  assert.equal(initial.body.volume, 70);
  assert.equal(initial.body.tenant.somFim, 'alarme');
  const changed = await api
    .patch('/api/preferences/sound')
    .set(auth(tokenA))
    .send({ som_nome: 'sino', volume: 35, vibrar: false });
  assert.equal(changed.status, 200);
  const fetched = await api.get('/api/preferences/sound').set(auth(tokenA));
  assert.equal(fetched.body.somNome, 'sino');
  assert.equal(fetched.body.volume, 35);
  assert.equal(fetched.body.vibrar, false);

  const settings = await api
    .patch('/api/settings')
    .set(auth(tokenA))
    .send({ som_fim: 'campainha', som_repetir: false, alert_lead_seconds: 30 });
  assert.equal(settings.status, 200);
  const prefs = await api.get('/api/preferences/sound').set(auth(tokenA));
  assert.equal(prefs.body.tenant.somFim, 'campainha');
  assert.equal(prefs.body.tenant.repetir, false);

  const ann = await api
    .patch('/api/superadmin/announcement')
    .set(auth(superToken))
    .send({ mensagem: 'Manutenção programada às 22h', tipo: 'warning', ativo: true });
  assert.equal(ann.status, 200);
  const dashboard = await api.get('/api/dashboard').set(auth(tokenA));
  assert.equal(dashboard.body.globalBanner.mensagem, 'Manutenção programada às 22h');
  const metrics = await api.get('/api/superadmin/system').set(auth(superToken));
  assert.equal(metrics.status, 200);
  assert.ok(metrics.body.hostname);
  assert.ok('webSocketConnections' in metrics.body);
  const tenantSystem = await api.get('/api/settings/system').set(auth(tokenA));
  assert.equal(tenantSystem.status, 404);
});

test('operador muda status com evento, manutenção exige motivo e em uso bloqueia', async () => {
  const op = await api
    .post('/api/users')
    .set(auth(tokenA))
    .send({ nome: 'Operador Status', username: 'opstatus', senha: 'Operador123', role: 'operador' });
  assert.equal(op.status, 201, JSON.stringify(op.body));
  const login = await api.post('/api/auth/login').send({ username: 'opstatus', password: 'Operador123' });
  const changed = await api
    .post('/api/auth/change-password')
    .set(auth(login.body.accessToken))
    .send({ senha_atual: 'Operador123', senha_nova: 'OperadorNova123' });
  const opToken = changed.body.accessToken;

  const carts = await api.get('/api/carts').set(auth(opToken));
  const c02 = carts.body.items.find((cart) => cart.codigo === 'C02');
  const toCharging = await api
    .post(`/api/carts/${c02.id}/status`)
    .set(auth(opToken))
    .send({ status: 'carregando' });
  assert.equal(toCharging.status, 200);
  const noReason = await api
    .post(`/api/carts/${c02.id}/status`)
    .set(auth(opToken))
    .send({ status: 'manutencao' });
  assert.equal(noReason.status, 400);
  const toMaintenance = await api
    .post(`/api/carts/${c02.id}/status`)
    .set(auth(opToken))
    .send({ status: 'manutencao', motivo: 'pneu', observacao: 'Pneu traseiro furado' });
  assert.equal(toMaintenance.status, 200);
  const events = await api.get(`/api/carts/${c02.id}/status-events`).set(auth(opToken));
  assert.ok(events.body.items.some((event) => event.para === 'manutencao' && event.motivo === 'pneu'));

  const c01 = carts.body.items.find((cart) => cart.codigo === 'C01');
  const plans = await api.get('/api/plans').set(auth(tokenA));
  const start = await api
    .post('/api/sessions')
    .set(auth(tokenA))
    .send({ cart_id: c01.id, plano_id: plans.body.items[0].id });
  assert.equal(start.status, 201);
  const blocked = await api
    .post(`/api/carts/${c01.id}/status`)
    .set(auth(opToken))
    .send({ status: 'carregando' });
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.erro.mensagem, /Encerre a sessão primeiro/);
  await api.post(`/api/sessions/${start.body.sessao.id}/end`).set(auth(tokenA)).send({ pago: false, cart_destino: 'disponivel' });
});
