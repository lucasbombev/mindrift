import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  authPayload,
  clearRefreshCookie,
  getUserWithTenant,
  hashPassword,
  publicUser,
  setRefreshCookie,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyRefreshToken,
  USER_WITH_TENANT_SELECT,
} from '../services/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { badRequest, forbidden, unauthorized } from '../utils/errors.js';
import { nowIso } from '../utils/time.js';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Informe o usuário ou e-mail.').max(160),
  password: z.string().min(1, 'Informe a senha.').max(200),
});

const changePasswordSchema = z.object({
  senha_atual: z.string().min(1, 'Informe a senha atual.').max(200),
  senha_nova: z.string().min(8, 'A nova senha deve ter pelo menos 8 caracteres.').max(72),
});

const WEAK_PASSWORDS = new Set(['admin123', '12345678', 'senha123', 'password', 'admin1234']);

export function validateNewPassword(senhaNova, senhaAtual, username) {
  const value = String(senhaNova || '');
  if (value.length < 8) throw badRequest('A nova senha deve ter pelo menos 8 caracteres.');
  if (value.length > 72) throw badRequest('A senha deve ter no máximo 72 caracteres.');
  if (value === senhaAtual) throw badRequest('A nova senha deve ser diferente da atual.');
  if (WEAK_PASSWORDS.has(value.toLowerCase())) {
    throw badRequest('Esta senha é muito comum. Escolha uma senha diferente.');
  }
  if (username && value.toLowerCase() === String(username).toLowerCase()) {
    throw badRequest('A senha não pode ser igual ao nome de usuário.');
  }
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    throw badRequest('Use pelo menos uma letra e um número na nova senha.');
  }
}

function findLoginUser(db, identifier) {
  return db
    .prepare(
      `${USER_WITH_TENANT_SELECT}
       WHERE u.username = ? COLLATE NOCASE
          OR (u.email IS NOT NULL AND lower(u.email) = lower(?))
       LIMIT 1`,
    )
    .get(identifier, identifier);
}

function assertTenantCanLogin(row) {
  if (row.role === 'superadmin') return;
  if (!row.tenant_id || !row.tenant_ativo) {
    throw forbidden('Este negócio está inativo. Fale com o suporte.', 'negocio_inativo');
  }
}

export function createAuthRouter(db) {
  const router = Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        erro: {
          codigo: 'muitas_tentativas',
          mensagem: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.',
        },
      }),
  });

  router.post('/login', loginLimiter, async (req, res, next) => {
    try {
      const body = loginSchema.parse(req.body);
      const row = findLoginUser(db, body.username.trim());
      if (!row || !row.ativo) throw unauthorized('Usuário ou senha inválidos.');
      assertTenantCanLogin(row);
      const ok = await verifyPassword(body.password, row.senha_hash);
      if (!ok) throw unauthorized('Usuário ou senha inválidos.');

      db.prepare('UPDATE users SET ultimo_login_em = ? WHERE id = ?').run(nowIso(), row.id);
      const fresh = getUserWithTenant(db, row.id);
      const payload = authPayload(fresh);
      setRefreshCookie(res, payload.refreshToken);
      const { refreshToken, ...response } = payload;
      res.json({ ...response, mustChangePassword: Boolean(fresh.must_change_password) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/refresh', (req, res, next) => {
    try {
      const token = req.cookies?.drift_refresh;
      if (!token) throw unauthorized();
      const payload = verifyRefreshToken(token);
      const row = getUserWithTenant(db, Number(payload.sub));
      if (!row || !row.ativo || Number(payload.tv) !== Number(row.token_version)) {
        throw unauthorized();
      }
      assertTenantCanLogin(row);
      const newRefresh = signRefreshToken(row);
      setRefreshCookie(res, newRefresh);
      res.json({ accessToken: signAccessToken(row), user: publicUser(row) });
    } catch (err) {
      clearRefreshCookie(res);
      next(err);
    }
  });

  router.post('/logout', (req, res) => {
    clearRefreshCookie(res);
    res.json({ ok: true });
  });

  router.get('/me', requireAuth(db), (req, res) => {
    res.json({ user: req.user });
  });

  router.post('/change-password', requireAuth(db), async (req, res, next) => {
    try {
      const body = changePasswordSchema.parse(req.body);
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      if (!row) throw unauthorized();
      const ok = await verifyPassword(body.senha_atual, row.senha_hash);
      if (!ok) throw badRequest('Senha atual incorreta.', 'senha_atual_incorreta');
      validateNewPassword(body.senha_nova, body.senha_atual, row.username);

      const hash = await hashPassword(body.senha_nova);
      const now = nowIso();
      db.prepare(
        `UPDATE users SET senha_hash = ?, must_change_password = 0,
         token_version = token_version + 1, atualizado_em = ? WHERE id = ?`,
      ).run(hash, now, row.id);

      const fresh = getUserWithTenant(db, row.id);
      setRefreshCookie(res, signRefreshToken(fresh));
      res.json({
        accessToken: signAccessToken(fresh),
        user: publicUser(fresh),
        mensagem: 'Senha alterada com sucesso.',
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
