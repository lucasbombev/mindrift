import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  authPayload,
  getUserWithTenant,
  publicUser,
  setRefreshCookie,
} from '../services/auth.js';
import { createTenantWithAdmin, getTenantById } from '../services/tenants.js';

const signupSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome do negócio.').max(80),
  adminNome: z.string().trim().min(2, 'Informe o nome do administrador.').max(80),
  email: z.string().trim().email('E-mail inválido.').max(120),
  senha: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(72),
});

export function createPublicRouter(db) {
  const router = Router();

  const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 8,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        erro: {
          codigo: 'muitas_tentativas',
          mensagem: 'Muitos cadastros neste horário. Tente novamente mais tarde.',
        },
      }),
  });

  router.post('/signup', signupLimiter, async (req, res, next) => {
    try {
      const body = signupSchema.parse(req.body);
      const { tenant, user } = await createTenantWithAdmin(db, body);
      const fullUser = getUserWithTenant(db, user.id);
      const payload = authPayload(fullUser);
      setRefreshCookie(res, payload.refreshToken);
      const { refreshToken, ...response } = payload;
      res.status(201).json({
        ...response,
        tenant: getTenantById(db, tenant.id),
        mensagem: `Negócio ${tenant.nome} criado com sucesso.`,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
