import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../utils/errors.js';
import { nowIso, dayBounds } from '../utils/time.js';
import { hashPassword, publicUser, getUserWithTenant, signAccessToken } from '../services/auth.js';
import { createTenantWithAdmin, serializeTenant } from '../services/tenants.js';
import { createBackup, listBackups, resolveBackupPath } from '../services/backup.js';
import { getPlatformSystemInfo } from '../services/system.js';
import { config } from '../config.js';

const createTenantSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome do negócio.').max(80),
  adminNome: z.string().trim().min(2, 'Informe o nome do administrador.').max(80),
  email: z.string().trim().email('E-mail inválido.').max(120),
  telefone: z.string().trim().min(1, 'Informe o telefone.'),
  senha: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(72),
});

const updateTenantSchema = z.object({
  ativo: z.boolean().optional(),
  excluido: z.boolean().optional(),
});

const transferSchema = z.object({
  email: z.string().trim().min(1, 'Informe o e-mail do novo admin.'),
});

const impersonateSchema = z.object({
  motivo: z.string().trim().min(5, 'Informe o motivo do suporte (mínimo 5 caracteres).').max(300),
});

const announcementSchema = z.object({
  mensagem: z.string().trim().max(300).optional().default(''),
  tipo: z.enum(['info', 'warning', 'success']).optional().default('info'),
  ativo: z.boolean().optional().default(true),
});

function tenantRows(db) {
  return db
    .prepare(
      `SELECT t.*,
        (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.ativo = 1) AS usuarios,
        (SELECT GROUP_CONCAT(u.email, ', ') FROM users u
          WHERE u.tenant_id = t.id AND u.role = 'admin' AND u.email IS NOT NULL) AS admins_email,
        (SELECT GROUP_CONCAT(u.telefone, ', ') FROM users u
          WHERE u.tenant_id = t.id AND u.role = 'admin' AND u.telefone IS NOT NULL) AS admins_telefone
       FROM tenants t ORDER BY t.excluido_em IS NOT NULL, t.criado_em DESC, t.id DESC`,
    )
    .all();
}

function serializeItem(row) {
  return {
    ...serializeTenant(row),
    usuarios: row.usuarios,
    adminsEmail: row.admins_email || null,
    adminsTelefone: row.admins_telefone || null,
  };
}

function getTenant(db, id) {
  return db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
}

function invalidateTenantSessions(db, tenantId, now) {
  db.prepare(
    'UPDATE users SET token_version = token_version + 1, atualizado_em = ? WHERE tenant_id = ?',
  ).run(now, tenantId);
  db.prepare(
    'UPDATE audit_logs SET finalizado_em = ? WHERE tenant_id = ? AND finalizado_em IS NULL',
  ).run(now, tenantId);
}

function generateTempPassword() {
  const random = crypto.randomBytes(9).toString('base64url').replace(/[^a-zA-Z0-9]/g, '');
  return `Tmp${random.slice(0, 7)}9a`;
}

export function createSuperadminRouter(db) {
  const router = Router();

  router.get('/tenants', (_req, res) => {
    res.json({ items: tenantRows(db).map(serializeItem) });
  });

  router.get('/metrics', (_req, res) => {
    const { start, end } = dayBounds();
    const tenantsAtivos = db
      .prepare('SELECT COUNT(*) AS n FROM tenants WHERE ativo = 1 AND excluido_em IS NULL')
      .get().n;
    const carrinhos = db
      .prepare(
        `SELECT COUNT(*) AS n FROM carts c JOIN tenants t ON t.id = c.tenant_id
         WHERE c.excluido_em IS NULL AND t.ativo = 1 AND t.excluido_em IS NULL`,
      )
      .get().n;
    const sessoesHoje = db
      .prepare(
        `SELECT COUNT(*) AS n FROM sessions s JOIN tenants t ON t.id = s.tenant_id
         WHERE s.iniciado_em >= ? AND s.iniciado_em < ? AND s.excluida_em IS NULL
           AND t.ativo = 1 AND t.excluido_em IS NULL`,
      )
      .get(start, end).n;
    res.json({ tenantsAtivos, carrinhos, sessoesHoje });
  });

  router.post('/tenants', async (req, res, next) => {
    try {
      const body = createTenantSchema.parse(req.body);
      const { tenant } = await createTenantWithAdmin(db, body);
      const row = tenantRows(db).find((item) => item.id === tenant.id);
      res.status(201).json({ item: serializeItem(row), mensagem: 'Negócio criado.' });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/tenants/:id', (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) throw badRequest('Negócio inválido.');
      const body = updateTenantSchema.parse(req.body);
      const tenant = getTenant(db, id);
      if (!tenant) throw notFound('Negócio não encontrado.');
      const now = nowIso();
      let message = 'Negócio atualizado.';

      if (body.excluido === true) {
        db.prepare('UPDATE tenants SET ativo = 0, excluido_em = ? WHERE id = ?').run(now, id);
        invalidateTenantSessions(db, id, now);
        req.app.locals.disconnectTenant?.(id);
        message = 'Negócio excluído (soft delete). Os dados foram preservados para restauração.';
      } else if (body.excluido === false) {
        db.prepare('UPDATE tenants SET ativo = 1, excluido_em = NULL WHERE id = ?').run(id);
        invalidateTenantSessions(db, id, now);
        message = 'Negócio restaurado e reativado.';
      } else if (body.ativo !== undefined) {
        if (tenant.excluido_em) throw badRequest('Restaure o negócio antes de ativá-lo.');
        db.prepare('UPDATE tenants SET ativo = ? WHERE id = ?').run(body.ativo ? 1 : 0, id);
        if (!body.ativo) {
          invalidateTenantSessions(db, id, now);
          req.app.locals.disconnectTenant?.(id);
          message = 'Negócio suspenso. Acessos bloqueados.';
        } else {
          message = 'Negócio reativado. Usuários devem entrar novamente.';
        }
      } else {
        throw badRequest('Informe a operação do ciclo de vida.');
      }

      const row = tenantRows(db).find((item) => item.id === id);
      res.json({ item: serializeItem(row), mensagem: message });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/tenants/:id', (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const tenant = getTenant(db, id);
      if (!tenant) throw notFound('Negócio não encontrado.');
      const confirmation = String(req.body?.confirmacao || '').trim();
      if (confirmation !== tenant.slug && confirmation !== tenant.nome) {
        throw badRequest(
          'Confirmação inválida. Digite exatamente o slug ou o nome do negócio para excluir definitivamente.',
          'confirmacao_invalida',
        );
      }
      const now = nowIso();
      req.app.locals.disconnectTenant?.(id);
      const run = db.transaction(() => {
        db.prepare('UPDATE audit_logs SET finalizado_em = ? WHERE tenant_id = ? AND finalizado_em IS NULL').run(now, id);
        db.prepare('DELETE FROM session_events WHERE tenant_id = ?').run(id);
        db.prepare('DELETE FROM sessions WHERE tenant_id = ?').run(id);
        db.prepare('DELETE FROM cart_status_events WHERE tenant_id = ?').run(id);
        db.prepare('DELETE FROM carts WHERE tenant_id = ?').run(id);
        db.prepare('DELETE FROM pricing_plans WHERE tenant_id = ?').run(id);
        db.prepare('DELETE FROM categories WHERE tenant_id = ?').run(id);
        db.prepare('DELETE FROM settings WHERE tenant_id = ?').run(id);
        db.prepare('DELETE FROM cash_closures WHERE tenant_id = ?').run(id);
        db.prepare('DELETE FROM audit_logs WHERE tenant_id = ?').run(id);
        db.prepare(
          'DELETE FROM user_sound_preferences WHERE user_id IN (SELECT id FROM users WHERE tenant_id = ?)',
        ).run(id);
        db.prepare('DELETE FROM users WHERE tenant_id = ?').run(id);
        db.prepare('DELETE FROM tenants WHERE id = ?').run(id);
      });
      run();
      res.json({ ok: true, mensagem: 'Negócio excluído definitivamente.' });
    } catch (err) {
      next(err);
    }
  });

  router.post('/tenants/:id/transfer-admin', (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const tenant = getTenant(db, id);
      if (!tenant || tenant.excluido_em) throw notFound('Negócio não encontrado.');
      const body = transferSchema.parse(req.body);
      const email = body.email.trim().toLowerCase();
      const target = db
        .prepare(
          `SELECT * FROM users WHERE tenant_id = ? AND lower(email) = lower(?) AND ativo = 1`,
        )
        .get(id, email);
      if (!target) throw notFound('Usuário ativo com este e-mail não encontrado neste negócio.');
      const now = nowIso();
      const run = db.transaction(() => {
        db.prepare(
          "UPDATE users SET role = 'operador', token_version = token_version + 1, atualizado_em = ? WHERE tenant_id = ? AND role = 'admin' AND id != ?",
        ).run(now, id, target.id);
        db.prepare(
          "UPDATE users SET role = 'admin', ativo = 1, token_version = token_version + 1, atualizado_em = ? WHERE id = ? AND tenant_id = ?",
        ).run(now, target.id, id);
        db.prepare('UPDATE users SET token_version = token_version + 1, atualizado_em = ? WHERE tenant_id = ?').run(now, id);
      });
      run();
      req.app.locals.disconnectTenant?.(id);
      res.json({ ok: true, mensagem: `Admin transferido para ${target.nome}.` });
    } catch (err) {
      next(err);
    }
  });

  router.post('/tenants/:id/reset-admin', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const tenant = getTenant(db, id);
      if (!tenant || tenant.excluido_em) throw notFound('Negócio não encontrado.');
      const admin = db
        .prepare(
          `SELECT * FROM users WHERE tenant_id = ? AND role = 'admin' AND ativo = 1
           ORDER BY id LIMIT 1`,
        )
        .get(id);
      if (!admin) throw notFound('Este negócio não possui administrador ativo.');
      const senhaTemporaria = generateTempPassword();
      const hash = await hashPassword(senhaTemporaria);
      db.prepare(
        `UPDATE users SET senha_hash = ?, must_change_password = 1,
         token_version = token_version + 1, atualizado_em = ? WHERE id = ? AND tenant_id = ?`,
      ).run(hash, nowIso(), admin.id, id);
      res.json({
        ok: true,
        senhaTemporaria,
        admin: { id: admin.id, nome: admin.nome, email: admin.email, telefone: admin.telefone },
        mensagem: 'Senha temporária gerada. O admin deverá trocá-la no próximo login.',
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/tenants/:id/impersonate', (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const tenant = getTenant(db, id);
      if (!tenant || tenant.excluido_em) throw notFound('Negócio não encontrado.');
      if (!tenant.ativo) throw badRequest('Reative o negócio antes de iniciar o suporte.');
      const body = impersonateSchema.parse(req.body);
      const admin = db
        .prepare(
          `SELECT * FROM users WHERE tenant_id = ? AND role = 'admin' AND ativo = 1
           ORDER BY id LIMIT 1`,
        )
        .get(id);
      if (!admin) throw notFound('Este negócio não possui administrador ativo.');
      const now = nowIso();
      const info = db
        .prepare(
          `INSERT INTO audit_logs
            (tenant_id, superadmin_id, admin_id, motivo, iniciado_em, ip, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          req.user.id,
          admin.id,
          body.motivo,
          now,
          req.ip || null,
          String(req.headers['user-agent'] || '').slice(0, 300) || null,
        );
      const auditId = Number(info.lastInsertRowid);
      const fresh = getUserWithTenant(db, admin.id);
      const accessToken = signAccessToken(fresh, { imp: auditId, by: req.user.id });
      const impersonation = {
        id: auditId,
        superadminId: req.user.id,
        motivo: body.motivo,
        iniciadoEm: now,
      };
      res.json({
        accessToken,
        user: { ...publicUser(fresh), impersonation },
        impersonation,
        tenant: { id, nome: tenant.nome, slug: tenant.slug },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/impersonations', (_req, res) => {
    const items = db
      .prepare(
        `SELECT a.*, t.nome AS tenant_nome, t.slug AS tenant_slug,
                s.nome AS superadmin_nome, u.nome AS admin_nome, u.email AS admin_email
         FROM audit_logs a
         JOIN tenants t ON t.id = a.tenant_id
         JOIN users s ON s.id = a.superadmin_id
         LEFT JOIN users u ON u.id = a.admin_id
         ORDER BY a.iniciado_em DESC LIMIT 50`,
      )
      .all()
      .map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        tenantNome: row.tenant_nome,
        tenantSlug: row.tenant_slug,
        superadminNome: row.superadmin_nome,
        adminNome: row.admin_nome,
        adminEmail: row.admin_email,
        motivo: row.motivo,
        iniciadoEm: row.iniciado_em,
        finalizadoEm: row.finalizado_em,
      }));
    res.json({ items });
  });

  router.get('/announcement', (_req, res) => {
    const row = db
      .prepare('SELECT * FROM global_announcements WHERE id = 1 AND ativo = 1')
      .get();
    res.json({
      item: row
        ? {
            mensagem: row.mensagem,
            tipo: row.tipo,
            ativo: Boolean(row.ativo),
            atualizadoEm: row.atualizado_em,
          }
        : { mensagem: '', tipo: 'info', ativo: false, atualizadoEm: null },
    });
  });

  router.patch('/announcement', (req, res, next) => {
    try {
      const body = announcementSchema.parse(req.body);
      const now = nowIso();
      const ativo = body.ativo && body.mensagem.trim() ? 1 : 0;
      db.prepare(
        `INSERT INTO global_announcements
          (id, mensagem, tipo, ativo, criado_por, criado_em, atualizado_em)
         VALUES (1, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET mensagem = excluded.mensagem, tipo = excluded.tipo,
           ativo = excluded.ativo, atualizado_em = excluded.atualizado_em`,
      ).run(body.mensagem.trim(), body.tipo, ativo, req.user.id, now, now);
      req.app.locals.broadcastAll?.();
      res.json({ item: { mensagem: body.mensagem.trim(), tipo: body.tipo, ativo: Boolean(ativo) } });
    } catch (err) {
      next(err);
    }
  });

  router.get('/system', (req, res) => {
    const io = req.app.locals.io;
    res.json({
      ...getPlatformSystemInfo(db),
      webSocketConnections: io?.engine?.clientsCount ?? 0,
    });
  });

  router.get('/system/logs', (req, res, next) => {
    try {
      const filePath = config.logPath;
      if (!fs.existsSync(filePath)) return res.json({ conteudo: '', caminho: filePath });
      const stat = fs.statSync(filePath);
      const max = 512 * 1024;
      const start = Math.max(0, stat.size - max);
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      fs.closeSync(fd);
      const lines = buffer.toString('utf8').split('\n');
      const tail = Math.min(500, Math.max(20, Number(req.query.tail) || 200));
      res.json({
        conteudo: lines.slice(-tail).join('\n'),
        caminho: filePath,
        tamanhoBytes: stat.size,
        atualizadoEm: stat.mtime.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/system/logs/download', (req, res, next) => {
    try {
      if (!fs.existsSync(config.logPath)) throw notFound('Arquivo de log ainda não existe.');
      res.download(config.logPath, 'drift-rent.log');
    } catch (err) {
      next(err);
    }
  });

  router.get('/system/backups', (_req, res) => {
    res.json({ items: listBackups() });
  });

  router.post('/system/backups', async (req, res, next) => {
    try {
      const backup = await createBackup(db, { prefix: 'manual-superadmin' });
      res.status(201).json({ backup });
    } catch (err) {
      next(err);
    }
  });

  router.get('/system/backups/:filename/download', (req, res, next) => {
    try {
      const filePath = resolveBackupPath(String(req.params.filename));
      if (!filePath) throw notFound('Backup não encontrado.');
      res.download(filePath, path.basename(filePath));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
