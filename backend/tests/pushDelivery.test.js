import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestContext } from './helpers.js';

const ctx = await createTestContext();
const admin = await ctx.loginAdmin();
const webpush = (await import('web-push')).default;
const { sendToUser } = await import('../src/services/push.js');
const originalSend = webpush.sendNotification;

after(() => {
  webpush.sendNotification = originalSend;
  ctx.close();
});

function addSubscription(label) {
  const endpoint = `https://push.example.test/${label}-${crypto.randomUUID()}`;
  const id = ctx.db
    .prepare(
      `INSERT INTO push_subscriptions (user_id, tenant_id, endpoint, p256dh, auth, criado_em)
       VALUES (?, ?, ?, 'p256dh-test', 'auth-test', ?)`,
    )
    .run(admin.user.id, admin.user.tenantId, endpoint, new Date().toISOString()).lastInsertRowid;
  return { id, endpoint };
}

function subscriptionCount() {
  return ctx.db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n;
}

async function expectRemoval(statusCode) {
  const sub = addSubscription(String(statusCode));
  webpush.sendNotification = async () => {
    const err = new Error(`push ${statusCode}`);
    err.statusCode = statusCode;
    throw err;
  };
  const result = await sendToUser(ctx.db, admin.user.tenantId, admin.user.id, {
    title: 'Tempo Esgotado!',
    body: 'O tempo no brinquedo de teste acabou.',
    url: '/em-uso',
  });
  assert.equal(result.failed, 1);
  assert.equal(ctx.db.prepare('SELECT id FROM push_subscriptions WHERE id = ?').get(sub.id), undefined);
}

test('remove inscrições 403, 404 e 410', async () => {
  await expectRemoval(403);
  await expectRemoval(404);
  await expectRemoval(410);
  assert.equal(subscriptionCount(), 0);
});

test('mantém inscrição em erro transitório e conta envio com sucesso', async () => {
  const sub = addSubscription('retry');
  webpush.sendNotification = async () => {
    const err = new Error('serviço indisponível');
    err.statusCode = 503;
    throw err;
  };
  const failed = await sendToUser(ctx.db, admin.user.tenantId, admin.user.id, {
    title: 'Tempo Esgotado!',
    body: 'O tempo no brinquedo de teste acabou.',
    url: '/em-uso',
  });
  assert.equal(failed.failed, 1);
  assert.ok(ctx.db.prepare('SELECT id FROM push_subscriptions WHERE id = ?').get(sub.id));

  webpush.sendNotification = async () => ({ statusCode: 201 });
  const ok = await sendToUser(ctx.db, admin.user.tenantId, admin.user.id, {
    title: 'Tempo Esgotado!',
    body: 'O tempo no brinquedo de teste acabou.',
    url: '/em-uso',
  });
  assert.equal(ok.sent, 1);
  assert.equal(ok.failed, 0);
});
