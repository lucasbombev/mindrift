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
import { badRequest, notFound } from '../utils/errors.js';

const signupSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome do negócio.').max(80),
  adminNome: z.string().trim().min(2, 'Informe o nome do administrador.').max(80),
  email: z.string().trim().email('E-mail inválido.').max(120),
  telefone: z.string().trim().min(1, 'Informe o telefone.'),
  senha: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.').max(72),
});


function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function maskedName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Cliente';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function createPublicRouter(db) {
  const router = Router();

  const statusLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        erro: {
          codigo: 'muitas_consultas',
          mensagem: 'Muitas consultas em pouco tempo. Aguarde um instante.',
        },
      }),
  });

  router.get('/status/:tenantSlug', statusLimiter, (req, res, next) => {
    try {
      const slug = String(req.params.tenantSlug || '').trim();
      const name = String(req.query.name || '').trim();
      if (!slug || name.length < 2 || name.length > 80) {
        throw badRequest('Informe o nome da criança.');
      }
      const tenant = db
        .prepare(
          `SELECT id, nome FROM tenants
           WHERE slug = ? AND ativo = 1 AND excluido_em IS NULL`,
        )
        .get(slug);
      if (!tenant) throw notFound('Estabelecimento não encontrado.');

      const active = db
        .prepare(
          `SELECT s.cliente_nome, s.iniciado_em, s.fim_previsto_em,
                  c.codigo AS cart_codigo, cat.nome AS equipamento
           FROM sessions s
           JOIN carts c ON c.id = s.cart_id
           JOIN categories cat ON cat.id = c.category_id
           WHERE s.tenant_id = ? AND s.status = 'em_andamento'
             AND s.excluida_em IS NULL AND s.cliente_nome IS NOT NULL
           ORDER BY s.iniciado_em ASC`,
        )
        .all(tenant.id);

      const target = normalizeName(name);
      const matches = active.filter((row) => {
        const full = normalizeName(row.cliente_nome);
        return full === target || full.startsWith(`${target} `);
      });
      res.setHeader('Cache-Control', 'no-store');

      if (matches.length > 1) {
        return res.json({
          estabelecimento: tenant.nome,
          ambiguo: true,
          mensagem:
            'Encontramos mais de uma criança com esse nome. Pergunte ao operador o código da sessão.',
        });
      }
      if (matches.length === 0) {
        return res.status(404).json({
          erro: {
            codigo: 'sessao_nao_encontrada',
            mensagem: 'Nenhum tempo ativo encontrado para esse nome.',
          },
        });
      }

      const session = matches[0];
      const remainingSeconds = session.fim_previsto_em
        ? Math.max(0, Math.floor((new Date(session.fim_previsto_em).getTime() - Date.now()) / 1000))
        : null;
      return res.json({
        estabelecimento: tenant.nome,
        nome: maskedName(session.cliente_nome),
        equipamento: session.equipamento || session.cart_codigo,
        segundosRestantes: remainingSeconds,
        tempoLivre: !session.fim_previsto_em,
      });
    } catch (err) {
      next(err);
    }
  });

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
