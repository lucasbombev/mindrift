import { Router } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../utils/errors.js';
import { nowIso } from '../utils/time.js';
import { createTenantWithAdmin, serializeTenant } from '../services/tenants.js';

const updateTenantSchema = z.object({
  ativo: z.boolean(),
});

const createTenantSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome do negócio.').max(80),
  adminNome: z.string().trim().min(2, 'Informe o nome do administrador.').max(80),
  email: z.string().trim().email('E-mail inválido.').max(120),
  senha: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(72),
});

function tenantRows(db) {
  return db
    .prepare(
      `SELECT t.*,
        (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.ativo = 1) AS usuarios,
        (SELECT GROUP_CONCAT(u.email, ', ') FROM users u
          WHERE u.tenant_id = t.id AND u.role = 'admin' AND u.email IS NOT NULL) AS admins_email
       FROM tenants t ORDER BY t.criado_em DESC, t.id DESC`,
    )
    .all();
}

export function createSuperadminRouter(db) {
  const router = Router();

  router.post('/tenants', async (req, res, next) => {
    try {
      const body = createTenantSchema.parse(req.body);
      const { tenant } = await createTenantWithAdmin(db, body);
      const row = tenantRows(db).find((item) => item.id === tenant.id);
      res.status(201).json({
        item: { ...serializeTenant(row), usuarios: row.usuarios, adminsEmail: row.admins_email || null },
        mensagem: 'Negócio criado.',
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/tenants', (_req, res) => {
    const items = tenantRows(db).map((row) => ({
      ...serializeTenant(row),
      usuarios: row.usuarios,
      adminsEmail: row.admins_email || null,
    }));
    res.json({ items });
  });

  router.patch('/tenants/:id', (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) throw badRequest('Negócio inválido.');
      const body = updateTenantSchema.parse(req.body);
      const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
      if (!tenant) throw notFound('Negócio não encontrado.');
      const now = nowIso();
      db.prepare('UPDATE tenants SET ativo = ? WHERE id = ?').run(body.ativo ? 1 : 0, id);
      if (!body.ativo) {
        // Invalida tokens e derruba sockets deste tenant imediatamente.
        db.prepare(
          'UPDATE users SET token_version = token_version + 1, atualizado_em = ? WHERE tenant_id = ?',
        ).run(now, id);
        req.app.locals.disconnectTenant?.(id);
      }
      const row = tenantRows(db).find((item) => item.id === id);
      res.json({ item: serializeTenant(row), mensagem: body.ativo ? 'Negócio reativado.' : 'Negócio desativado.' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
