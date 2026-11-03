import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { auth, createTestContext } from './helpers.js';

const ctx = await createTestContext();
const api = request(ctx.app);
const admin = await ctx.loginAdmin();
const token = admin.token;
after(() => ctx.close());

test('portal público consulta apenas DTO seguro e trata nomes duplicados', async () => {
  const categories = await api.get('/api/categories').set(auth(token));
  const category = categories.body.items.find((item) => item.slug === 'drift');
  const plans = await api.get('/api/plans').set(auth(token));
  const plan = plans.body.items[0];
  const cart = await api
    .post('/api/carts')
    .set(auth(token))
    .field('codigo', 'PUB1')
    .field('category_id', String(category.id))
    .field('capacidade_maxima', '4');
  assert.equal(cart.status, 201, JSON.stringify(cart.body));

  const joao = await api
    .post('/api/sessions')
    .set(auth(token))
    .send({ cart_id: cart.body.item.id, plano_id: plan.id, cliente_nome: 'João Silva' });
  assert.equal(joao.status, 201);

  const found = await api.get('/api/public/status/default?name=joao');
  assert.equal(found.status, 200, JSON.stringify(found.body));
  assert.equal(found.body.nome, 'João S.');
  assert.equal(found.body.equipamento, 'Drift');
  assert.equal(typeof found.body.segundosRestantes, 'number');
  assert.ok(found.body.segundosRestantes > 0);
  assert.deepEqual(
    Object.keys(found.body).sort(),
    ['equipamento', 'estabelecimento', 'nome', 'segundosRestantes', 'tempoLivre'].sort(),
  );
  assert.equal('valorCentavos' in found.body, false);
  assert.equal('id' in found.body, false);

  const missing = await api.get('/api/public/status/default?name=inexistente');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.erro.codigo, 'sessao_nao_encontrada');

  const joao2 = await api
    .post('/api/sessions')
    .set(auth(token))
    .send({ cart_id: cart.body.item.id, plano_id: plan.id, cliente_nome: 'João Silva' });
  assert.equal(joao2.status, 201);
  const ambiguous = await api.get('/api/public/status/default?name=joao');
  assert.equal(ambiguous.status, 200);
  assert.equal(ambiguous.body.ambiguo, true);
  assert.match(ambiguous.body.mensagem, /mais de uma criança/i);
  assert.equal('nome' in ambiguous.body, false);
  assert.equal('equipamento' in ambiguous.body, false);

  let last;
  for (let i = 0; i < 25; i += 1) {
    last = await api.get('/api/public/status/default?name=joao');
    if (last.status === 429) break;
  }
  assert.equal(last.status, 429);
});
