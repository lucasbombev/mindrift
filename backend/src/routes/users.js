import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { hashPassword, publicUser } from '../services/auth.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { nowIso } from '../utils/time.js';
import { validateNewPassword } from './auth.js';

const usernameSchema = z
  .string()
  .trim()
  .min(3, 'O usuário deve ter pelo menos 3 caracteres.')
  .max(40)
  .regex(/^[a-zA-Z0-9._-]+$/, 'Use apenas letras, números, ponto, hífen ou sublinhado.');

const createSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome.').max(80),
  username: usernameSchema,
  email: z.string().trim().email('E-mail inválido.').max(120).optional().or(z.literal('')),
  senha: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(72),
  role: z.enum(['admin', 'operador']),
});

const updateSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome.').max(80).optional(),
  username: usernameSchema.optional(),
  email: z.string().trim().email('E-mail inválido.').max(120).nullable().optional().or(z.literal('')),
  senha: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(72).optional(),
  role: z.enum(['admin', 'operador']).optional(),
  ativo: z.boolean().optional(),
});

function activeAdminCount(db, tenantId) {
  return db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE tenant_id = ? AND role = 'admin' AND ativo = 1")
    .get(tenantId).n;
}

function getUser(db, tenantId, id) {
  return db.prepare('SELECT * FROM users WHERE id = ? AND tenant_id = ?').get(id, tenantId);
}

function assertEmailFree(db, email, ignoreId = 0) {
  if (!email) return;
  const found = db
    .prepare('SELECT id FROM users WHERE email IS NOT NULL AND lower(email) = lower(?) AND id != ?')
    .get(email, ignoreId);
  if (found) throw conflict('Este e-mail já está cadastrado.');
}

export function createUsersRouter(db) {
  const router = Router();
  router.use(requireAdmin);

  router.get('/', (req, res) => {
    const rows = db
      .prepare('SELECT * FROM users WHERE tenant_id = ? ORDER BY ativo DESC, nome COLLATE NOCASE')
      .all(req.tenantId);
    res.json({ items: rows.map(publicUser) });
  });

  router.get('/:id', (req, res, next) => {
    try {
      const row = getUser(db, req.tenantId, Number(req.params.id));
      if (!row) throw notFound('Usuário não encontrado.');
      res.json({ item: publicUser(row) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const body = createSchema.parse(req.body);
      validateNewPassword(body.senha, '', body.username);
      const exists = db
        .prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE')
        .get(body.username);
      if (exists) throw conflict('Este nome de usuário já está em uso.');
      if (body.email) assertEmailFree(db, body.email.toLowerCase());
      const hash = await hashPassword(body.senha);
      const now = nowIso();
      const info = db
        .prepare(
          `INSERT INTO users (tenant_id, nome, username, email, senha_hash, role, ativo,
             must_change_password, token_version, criado_em, atualizado_em)
           VALUES (?, ?, ?, ?, ?, ?, 1, 1, 1, ?, ?)`,
        )
        .run(
          req.tenantId,
          body.nome,
          body.username,
          body.email ? body.email.toLowerCase() : null,
          hash,
          body.role,
          now,
          now,
        );
      const row = getUser(db, req.tenantId, Number(info.lastInsertRowid));
      res.status(201).json({ item: publicUser(row) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = getUser(db, req.tenantId, id);
      if (!row) throw notFound('Usuário não encontrado.');
      const body = updateSchema.parse(req.body);

      if (body.ativo === false && id === req.user.id) {
        throw badRequest('Você não pode desativar a própria conta.');
      }
      if (body.ativo === false && row.role === 'admin' && row.ativo && activeAdminCount(db, req.tenantId) <= 1) {
        throw conflict('Não é possível desativar o último administrador ativo.');
      }
      if (body.role === 'operador' && row.role === 'admin' && row.ativo && activeAdminCount(db, req.tenantId) <= 1) {
        throw conflict('Não é possível rebaixar o último administrador ativo.');
      }
      if (body.username && body.username !== row.username) {
        const exists = db
          .prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?')
          .get(body.username, id);
        if (exists) throw conflict('Este nome de usuário já está em uso.');
      }
      if (body.email !== undefined) assertEmailFree(db, body.email ? body.email.toLowerCase() : null, id);
      if (body.senha) {
        validateNewPassword(body.senha, '', body.username || row.username);
      }

      const fields = [];
      const params = [];
      const push = (sql, value) => {
        fields.push(sql);
        params.push(value);
      };
      if (body.nome !== undefined) push('nome = ?', body.nome);
      if (body.username !== undefined) push('username = ?', body.username);
      if (body.email !== undefined) {
        push('email = ?', body.email ? String(body.email).toLowerCase() : null);
      }
      if (body.role !== undefined) push('role = ?', body.role);
      if (body.ativo !== undefined) push('ativo = ?', body.ativo ? 1 : 0);
      if (body.senha) {
        push('senha_hash = ?', await hashPassword(body.senha));
        fields.push('must_change_password = 1');
      }
      if (body.senha || body.ativo === false) {
        fields.push('token_version = token_version + 1');
      }
      if (!fields.length) return res.json({ item: publicUser(row) });

      push('atualizado_em = ?', nowIso());
      db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`).run(
        ...params,
        id,
        req.tenantId,
      );
      const fresh = getUser(db, req.tenantId, id);
      res.json({ item: publicUser(fresh) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = getUser(db, req.tenantId, id);
      if (!row) throw notFound('Usuário não encontrado.');
      if (id === req.user.id) throw badRequest('Você não pode desativar a própria conta.');
      if (row.role === 'admin' && row.ativo && activeAdminCount(db, req.tenantId) <= 1) {
        throw conflict('Não é possível desativar o último administrador ativo.');
      }
      db.prepare(
        `UPDATE users SET ativo = 0, token_version = token_version + 1,
         atualizado_em = ? WHERE id = ? AND tenant_id = ?`,
      ).run(nowIso(), id, req.tenantId);
      res.json({ item: publicUser(getUser(db, req.tenantId, id)) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
