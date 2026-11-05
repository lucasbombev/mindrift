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
        `SELECT ps.*, u.username AS user_username, u.nome AS user_nome
         FROM push_subscriptions ps
         JOIN users u ON u.id = ps.user_id
         WHERE ps.user_id = ? AND u.ativo = 1 AND u.tenant_id = ?`,
      )
      .all(userId, tenantId);
  }
  return db
    .prepare(
      `SELECT ps.*, u.username AS user_username, u.nome AS user_nome
       FROM push_subscriptions ps
       JOIN users u ON u.id = ps.user_id
       JOIN tenants t ON t.id = ps.tenant_id
       WHERE ps.tenant_id = ? AND u.ativo = 1
         AND t.ativo = 1 AND t.excluido_em IS NULL`,
    )
    .all(tenantId);
}

function endpointLabel(endpoint) {
  try {
    return new URL(endpoint).host || 'endpoint-sem-host';
  } catch {
    return 'endpoint-invalido';
  }
}

function short(value, max = 240) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function sendRows(db, rows, payload, context = {}) {
  if (!configure()) {
    console.error('[push] envio cancelado: VAPID não configurado.');
    return { sent: 0, failed: 0, skipped: true };
  }
  if (!rows.length) {
    console.warn(
      `[push] nenhuma inscrição encontrada (${context.scope || 'tenant'}=${context.scopeId ?? '?'}).`,
    );
    return { sent: 0, failed: 0, skipped: true };
  }

  const serialized = JSON.stringify(payload);
  const payloadBytes = Buffer.byteLength(serialized, 'utf8');
  if (payloadBytes > 4096) {
    console.error(`[push] payload acima do limite: ${payloadBytes} bytes.`);
  }
  console.log(
    `[push] envio iniciado: inscrições=${rows.length} payload=${payloadBytes}B ` +
      `escopo=${context.scope || 'tenant'} id=${context.scopeId ?? '?'}`,
  );

  let sent = 0;
  let failed = 0;
  await Promise.all(
    rows.map(async (row) => {
      const userLabel = `${row.user_id}${row.user_username ? `/${row.user_username}` : ''}`;
      const endpoint = endpointLabel(row.endpoint);
      console.log(`[push] tentando usuário=${userLabel} tenant=${row.tenant_id} endpoint=${endpoint}`);
      try {
        const response = await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          serialized,
          { TTL: 3600, urgency: 'high' },
        );
        sent += 1;
        console.log(
          `[push] enviado usuário=${userLabel} tenant=${row.tenant_id} endpoint=${endpoint} ` +
            `status=${response?.statusCode || 201}`,
        );
      } catch (err) {
        failed += 1;
        const statusCode = Number(err?.statusCode) || 0;
        console.error(
          `[push] falha usuário=${userLabel} tenant=${row.tenant_id} endpoint=${endpoint} ` +
            `status=${statusCode || 'sem-status'} erro=${short(err?.message || err?.body || err)}`,
        );
        if ([403, 404, 410].includes(statusCode)) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
          console.warn(
            `[push] inscrição removida (status ${statusCode}): usuário=${userLabel} endpoint=${endpoint}`,
          );
        }
      }
    }),
  );
  console.log(
    `[push] resumo: enviados=${sent} falhas=${failed} inscrições=${rows.length} ` +
      `escopo=${context.scope || 'tenant'} id=${context.scopeId ?? '?'}`,
  );
  return { sent, failed };
}

export function sendToUser(db, tenantId, userId, payload) {
  const rows = subscriptionsFor(db, { tenantId, userId });
  console.log(`[push] usuário ${userId}: inscrições encontradas=${rows.length}`);
  return sendRows(db, rows, payload, { scope: 'user', scopeId: userId });
}

export function sendToTenant(db, tenantId, payload) {
  const rows = subscriptionsFor(db, { tenantId });
  console.log(`[push] tenant ${tenantId}: inscrições encontradas=${rows.length}`);
  return sendRows(db, rows, payload, { scope: 'tenant', scopeId: tenantId });
}
