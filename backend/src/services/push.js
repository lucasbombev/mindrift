import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import webpush from 'web-push';
import { BACKEND_ROOT, config } from '../config.js';

let configured = false;

/**
 * Relê as chaves do backend/.env se o processo tiver iniciado antes delas.
 * Isso corrige o caso clássico de servidor aberto antes de configurar VAPID:
 * a próxima chamada de /api/push/public-key passa a funcionar sem reiniciar.
 */
function reloadVapidFromDisk(force = false) {
  const envPath = path.join(BACKEND_ROOT, '.env');
  if (!fs.existsSync(envPath)) return false;
  try {
    const parsed = dotenv.parse(fs.readFileSync(envPath));
    let changed = false;
    if ((force || !config.vapidPublicKey) && parsed.VAPID_PUBLIC_KEY) {
      config.vapidPublicKey = parsed.VAPID_PUBLIC_KEY.trim();
      changed = true;
    }
    if ((force || !config.vapidPrivateKey) && parsed.VAPID_PRIVATE_KEY) {
      config.vapidPrivateKey = parsed.VAPID_PRIVATE_KEY.trim();
      changed = true;
    }
    if ((!config.vapidSubject || config.vapidSubject === 'mailto:contato@leaobrinquedos.local') && parsed.VAPID_SUBJECT) {
      config.vapidSubject = parsed.VAPID_SUBJECT.trim();
      changed = true;
    }
    if (changed) {
      configured = false;
      console.log('[push] Chaves VAPID recarregadas de backend/.env.');
    }
    return changed;
  } catch (err) {
    console.warn('[push] Falha ao reler backend/.env:', err.message);
    return false;
  }
}

function configure() {
  if (configured) return true;
  if (!config.vapidPublicKey || !config.vapidPrivateKey) reloadVapidFromDisk();
  if (!config.vapidPublicKey || !config.vapidPrivateKey) {
    console.warn(
      '[push] VAPID ausente: rode "npm run vapid:generate" e reinicie. Push desativado.',
    );
    return false;
  }
  try {
    webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
    configured = true;
    console.log('[push] VAPID configurado; Web Push habilitado.');
    return true;
  } catch (err) {
    console.error('[push] Chaves VAPID inválidas:', err.message);
    reloadVapidFromDisk(true);
    try {
      webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
      configured = true;
      console.log('[push] VAPID recarregado do .env e habilitado.');
      return true;
    } catch (secondErr) {
      console.error('[push] VAPID continua inválido; rode "npm run vapid:generate -- --force".', secondErr.message);
      return false;
    }
  }
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
       WHERE ps.tenant_id = ? AND u.ativo = 1
         AND t.ativo = 1 AND t.excluido_em IS NULL`,
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
