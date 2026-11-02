import webpush from 'web-push';
import { config } from '../config.js';

let configured = false;
function configure() {
  if (configured) return Boolean(config.vapidPublicKey && config.vapidPrivateKey);
  configured = true;
  if (!config.vapidPublicKey || !config.vapidPrivateKey) {
    console.warn('[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ausentes; push desativado.');
    return false;
  }
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  return true;
}

export function pushConfigured() {
  return configure();
}

export function publicKey() {
  return config.vapidPublicKey || null;
}

function subscriptionsFor(db, { tenantId, userId }) {
  if (userId) {
    return db
      .prepare(
        `SELECT ps.* FROM push_subscriptions ps
         JOIN users u ON u.id = ps.user_id
         WHERE ps.user_id = ? AND u.ativo = 1 AND u.tenant_id = ?`,
      )
      .all(userId, tenantId);
  }
  return db
    .prepare(
      `SELECT ps.* FROM push_subscriptions ps
       JOIN users u ON u.id = ps.user_id
       JOIN tenants t ON t.id = ps.tenant_id
       WHERE ps.tenant_id = ? AND u.ativo = 1 AND t.ativo = 1 AND t.excluido_em IS NULL`,
    )
    .all(tenantId);
}

async function sendRows(db, rows, payload) {
  if (!rows.length || !configure()) return { sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          JSON.stringify(payload),
          { TTL: 3600, urgency: 'high' },
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
        } else {
          console.warn('[push] falha ao enviar:', err?.statusCode || err?.message);
        }
      }
    }),
  );
  return { sent, failed };
}

export function sendToUser(db, tenantId, userId, payload) {
  return sendRows(db, subscriptionsFor(db, { tenantId, userId }), payload);
}

export function sendToTenant(db, tenantId, payload) {
  return sendRows(db, subscriptionsFor(db, { tenantId }), payload);
}
