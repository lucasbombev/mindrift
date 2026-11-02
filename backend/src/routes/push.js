import { Router } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../utils/errors.js';
import { nowIso } from '../utils/time.js';
import { publicKey, pushConfigured, sendToUser } from '../services/push.js';

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(200),
  }),
});

const payloadSchema = z.object({
  subscription: subscriptionSchema,
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(1000).optional(),
  subscription: subscriptionSchema.optional(),
}).refine((value) => value.endpoint || value.subscription, { message: 'Informe a inscrição.' });

export function createPushRouter(db) {
  const router = Router();

  router.get('/public-key', (req, res, next) => {
    try {
      if (!pushConfigured()) throw badRequest('Notificações push não estão configuradas no servidor. Verifique VAPID no backend/.env e reinicie com npm run vapid:generate.', 'push_indisponivel');
      res.json({ publicKey: publicKey() });
    } catch (err) {
      next(err);
    }
  });

  router.get('/status', (req, res) => {
    const endpoint = req.query.endpoint ? String(req.query.endpoint) : null;
    const row = endpoint
      ? db
          .prepare(
            `SELECT COUNT(*) AS n FROM push_subscriptions
             WHERE tenant_id = ? AND user_id = ? AND endpoint = ?`,
          )
          .get(req.tenantId, req.user.id, endpoint)
      : db
          .prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE tenant_id = ? AND user_id = ?')
          .get(req.tenantId, req.user.id);
    const count = row.n;
    res.json({
      ativo: count > 0,
      inscricoes: count,
      configurado: pushConfigured(),
      pushEnabled: Boolean(req.user.pushEnabled),
      endpoint: endpoint || null,
    });
  });

  router.patch('/preferences', (req, res, next) => {
    try {
      const schema = z.object({ enabled: z.boolean() });
      const body = schema.parse(req.body);
      db.prepare('UPDATE users SET push_enabled = ?, atualizado_em = ? WHERE id = ?')
        .run(body.enabled ? 1 : 0, nowIso(), req.user.id);
      res.json({ ok: true, pushEnabled: body.enabled });
    } catch (err) {
      next(err);
    }
  });

  router.post('/subscribe', (req, res, next) => {
    try {
      if (!pushConfigured()) throw badRequest('Notificações push não estão configuradas no servidor. Verifique VAPID no backend/.env e reinicie com npm run vapid:generate.', 'push_indisponivel');
      const body = payloadSchema.parse(req.body);
      const sub = body.subscription;
      db.prepare(
        `INSERT INTO push_subscriptions (user_id, tenant_id, endpoint, p256dh, auth, criado_em)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id,
           tenant_id = excluded.tenant_id, p256dh = excluded.p256dh, auth = excluded.auth`,
      ).run(req.user.id, req.tenantId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, nowIso());
      db.prepare('UPDATE users SET push_enabled = 1, atualizado_em = ? WHERE id = ?').run(nowIso(), req.user.id);
      res.status(201).json({ ok: true, mensagem: 'Notificações push ativadas neste dispositivo.' });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/unsubscribe', (req, res, next) => {
    try {
      const body = unsubscribeSchema.parse(req.body || {});
      const endpoint = body.endpoint || body.subscription.endpoint;
      db.prepare(
        'DELETE FROM push_subscriptions WHERE user_id = ? AND tenant_id = ? AND endpoint = ?',
      ).run(req.user.id, req.tenantId, endpoint);
      db.prepare('UPDATE users SET push_enabled = 0, atualizado_em = ? WHERE id = ?').run(nowIso(), req.user.id);
      res.json({ ok: true, mensagem: 'Notificações push desativadas neste dispositivo.' });
    } catch (err) {
      next(err);
    }
  });

  router.post('/test', async (req, res, next) => {
    try {
      if (!pushConfigured()) throw badRequest('Notificações push não estão configuradas no servidor. Verifique VAPID no backend/.env e reinicie com npm run vapid:generate.', 'push_indisponivel');
      const result = await sendToUser(db, req.tenantId, req.user.id, {
        title: 'Notificação de teste',
        body: 'Se você está vendo isto, o Web Push do Mindrift está funcionando.',
        url: '/em-uso',
        som: '/sounds/alarme.wav',
      });
      if (result.sent === 0) {
        throw badRequest('Nenhuma inscrição ativa. Ative as notificações push primeiro.', 'sem_inscricao');
      }
      res.json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
