import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { listSessionEvents } from '../services/audit.js';
import {
  CART_DESTINATIONS,
  PAYMENT_METHODS,
  SESSION_SELECT,
  cancelSession,
  deleteSession,
  editSessionClient,
  editSessionValue,
  endSession,
  getSessionById,
  listSessions,
  payActiveSession,
  renewSession,
  serializeSession,
  setPayment,
  startSession,
} from '../services/sessions.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { parsePagination } from '../utils/errors.js';
import { parseDateKey, rangeBounds } from '../utils/time.js';

const pricingShape = {
  plano_id: z.coerce.number().int().positive().nullable().optional(),
  minutos: z.coerce.number().int().min(1).max(1440).optional(),
  valor_centavos: z.coerce.number().int().min(0).max(1_000_000).optional(),
};

const startSchema = z.object({
  cart_id: z.coerce.number().int().positive(),
  cliente_nome: z.string().trim().max(80, 'O nome deve ter no máximo 80 caracteres.').optional().nullable(),
  observacao: z.string().trim().max(200).optional().nullable(),
  pagamento_adiantado: z.boolean().optional().default(false),
  forma_pagamento: z.enum(PAYMENT_METHODS).nullable().optional(),
  ...pricingShape,
});

const renewSchema = z.object(pricingShape);

const endSchema = z.object({
  pago: z.boolean().optional().default(false),
  forma_pagamento: z.enum(PAYMENT_METHODS).nullable().optional(),
  cart_destino: z.enum(CART_DESTINATIONS).optional().default('disponivel'),
});

const paymentSchema = z.object({
  pago: z.boolean(),
  forma_pagamento: z.enum(PAYMENT_METHODS).nullable().optional(),
});

const payActiveSchema = z.object({
  forma_pagamento: z.enum(PAYMENT_METHODS),
});

const clientSchema = z.object({
  cliente_nome: z.string().trim().max(80, 'O nome deve ter no máximo 80 caracteres.').nullable(),
});

const cancelSchema = z.object({
  motivo: z.string().trim().min(3, 'Informe o motivo do cancelamento.').max(300),
});

const valueSchema = z.object({
  valor_centavos: z.coerce.number().int().min(0).max(1_000_000),
  motivo: z.string().trim().max(200).optional(),
});

function broadcast(req) {
  req.app.locals.broadcast?.(req.tenantId);
}

export function createSessionsRouter(db) {
  const router = Router();

  router.get('/', (req, res, next) => {
    try {
      const filters = {};
      if (req.query.from || req.query.to) {
        const from = req.query.from ? String(req.query.from) : String(req.query.to);
        const to = req.query.to ? String(req.query.to) : String(req.query.from);
        if (!parseDateKey(from) || !parseDateKey(to)) throw badRequest('Data inválida.');
        const bounds = rangeBounds(from, to);
        filters.from = bounds.start;
        filters.to = bounds.end;
      }
      if (req.query.cartId) {
        const id = Number(req.query.cartId);
        if (!Number.isInteger(id) || id <= 0) throw badRequest('Carrinho inválido.');
        filters.cartId = id;
      }
      if (req.query.operadorId) filters.operadorId = Number(req.query.operadorId);
      if (req.query.cliente) filters.cliente = String(req.query.cliente).slice(0, 80);
      if (req.query.pago === '1' || req.query.pago === '0') filters.pago = req.query.pago;
      if (['em_andamento', 'encerrada', 'cancelada'].includes(String(req.query.status))) {
        filters.status = String(req.query.status);
      }
      if (PAYMENT_METHODS.includes(String(req.query.formaPagamento))) {
        filters.formaPagamento = String(req.query.formaPagamento);
      }
      const { page, limit, offset } = parsePagination(req.query);
      filters.page = page;
      filters.limit = limit;
      filters.offset = offset;
      filters.includeDeleted = false;

      res.json(listSessions(db, req.tenantId, filters));
    } catch (err) {
      next(err);
    }
  });

  router.get('/active', (req, res) => {
    const rows = db
      .prepare(
        `${SESSION_SELECT}
         WHERE s.tenant_id = ? AND s.status = 'em_andamento' AND s.excluida_em IS NULL
         ORDER BY s.fim_previsto_em ASC`,
      )
      .all(req.tenantId);
    res.json({
      items: rows.map(serializeSession),
      serverNow: new Date().toISOString(),
    });
  });

  router.get('/:id', (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const includeDeleted = req.query.incluirExcluidas === '1' && req.user.role === 'admin';
      const session = getSessionById(db, req.tenantId, id, { includeDeleted });
      if (!session) throw notFound('Sessão não encontrada.');
      res.json({
        item: session,
        eventos: listSessionEvents(db, req.tenantId, id),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id/events', (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const exists = db
        .prepare(
          'SELECT id FROM sessions WHERE id = ? AND tenant_id = ? AND excluida_em IS NULL',
        )
        .get(id, req.tenantId);
      if (!exists) throw notFound('Sessão não encontrada.');
      res.json({ items: listSessionEvents(db, req.tenantId, id) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', (req, res, next) => {
    try {
      const body = startSchema.parse(req.body);
      if (!body.plano_id && (!body.minutos || body.valor_centavos === undefined)) {
        throw badRequest('Escolha um plano ou informe minutos e valor avulso.');
      }
      const session = startSession(db, req.tenantId, body, req.user);
      broadcast(req);
      res.status(201).json({ sessao: session, serverNow: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/renew', (req, res, next) => {
    try {
      const body = renewSchema.parse(req.body);
      if (!body.plano_id && (!body.minutos || body.valor_centavos === undefined)) {
        throw badRequest('Escolha um plano ou informe minutos e valor avulso.');
      }
      const session = renewSession(db, req.tenantId, Number(req.params.id), body, req.user);
      broadcast(req);
      res.json({ sessao: session, serverNow: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/end', (req, res, next) => {
    try {
      const body = endSchema.parse(req.body ?? {});
      const session = endSession(db, req.tenantId, Number(req.params.id), body, req.user);
      broadcast(req);
      res.json({ sessao: session, serverNow: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/payment', (req, res, next) => {
    try {
      const body = paymentSchema.parse(req.body);
      if (!body.pago && req.user.role !== 'admin') {
        throw forbidden('Apenas administradores podem desmarcar um pagamento.');
      }
      const session = setPayment(db, req.tenantId, Number(req.params.id), body, req.user);
      broadcast(req);
      res.json({ sessao: session, serverNow: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/pay-active', (req, res, next) => {
    try {
      const body = payActiveSchema.parse(req.body);
      const session = payActiveSession(db, req.tenantId, Number(req.params.id), body, req.user);
      broadcast(req);
      res.json({ sessao: session, serverNow: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id/client', (req, res, next) => {
    try {
      const body = clientSchema.parse(req.body);
      const session = editSessionClient(db, req.tenantId, Number(req.params.id), body, req.user);
      broadcast(req);
      res.json({ sessao: session, serverNow: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id/value', requireAdmin, (req, res, next) => {
    try {
      const body = valueSchema.parse(req.body);
      const session = editSessionValue(db, req.tenantId, Number(req.params.id), body, req.user);
      broadcast(req);
      res.json({ sessao: session, serverNow: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/cancel', requireAdmin, (req, res, next) => {
    try {
      const body = cancelSchema.parse(req.body);
      const session = cancelSession(db, req.tenantId, Number(req.params.id), body, req.user);
      broadcast(req);
      res.json({ sessao: session, serverNow: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', requireAdmin, (req, res, next) => {
    try {
      deleteSession(db, req.tenantId, Number(req.params.id), req.body, req.user);
      broadcast(req);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
