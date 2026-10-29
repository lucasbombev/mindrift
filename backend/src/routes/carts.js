import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { uploadCartPhoto, validateUploadedPhoto, uploadedPhotoUrl, removeUploadedByUrl } from '../services/upload.js';
import { requireCategory } from '../services/categories.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { nowIso } from '../utils/time.js';
import { serializeCart } from '../services/dashboard.js';

const STATUSES = ['disponivel', 'carregando', 'manutencao'];

const codigoSchema = z
  .string()
  .trim()
  .min(1, 'Informe o código do carrinho.')
  .max(12, 'O código deve ter no máximo 12 caracteres.')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Use apenas letras, números, hífen ou sublinhado.')
  .transform((value) => value.toUpperCase());

const createSchema = z.object({
  codigo: codigoSchema,
  category_id: z.coerce.number().int().positive('Escolha a categoria.'),
  status: z.enum(STATUSES).optional(),
  observacao: z.string().trim().max(200).optional(),
});

const updateSchema = z.object({
  codigo: codigoSchema.optional(),
  category_id: z.coerce.number().int().positive().optional(),
  status: z.enum(STATUSES).optional(),
  observacao: z.string().trim().max(200).nullable().optional(),
  remove_foto: z.enum(['0', '1']).optional(),
});

const checkinSchema = z.object({
  observacao: z.string().trim().max(300).optional().nullable(),
});

const CART_SELECT = `
  SELECT c.*, cat.nome AS category_nome, cat.slug AS category_slug,
         cat.icone AS category_icone, cat.cor AS category_cor, cat.ativo AS category_ativo
  FROM carts c
  JOIN categories cat ON cat.id = c.category_id
`;

function activeSessionForCart(db, tenantId, cartId) {
  return db
    .prepare(
      `SELECT id, cliente_nome FROM sessions
       WHERE tenant_id = ? AND cart_id = ? AND status = 'em_andamento' AND excluida_em IS NULL`,
    )
    .get(tenantId, cartId);
}

function getCart(db, tenantId, id) {
  return db
    .prepare(`${CART_SELECT} WHERE c.id = ? AND c.tenant_id = ? AND c.excluido_em IS NULL`)
    .get(id, tenantId);
}

function optionalPhoto(req) {
  return req.file ? uploadedPhotoUrl(req.file) : null;
}

export function createCartsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const includeDeleted = req.query.incluirExcluidos === '1' && req.user.role === 'admin';
    const rows = db
      .prepare(
        `${CART_SELECT}
         WHERE c.tenant_id = ? ${includeDeleted ? '' : 'AND c.excluido_em IS NULL'}
         ORDER BY cat.nome COLLATE NOCASE, c.codigo COLLATE NOCASE`,
      )
      .all(req.tenantId);
    const active = db
      .prepare(
        `SELECT * FROM sessions
         WHERE tenant_id = ? AND status = 'em_andamento' AND excluida_em IS NULL`,
      )
      .all(req.tenantId);
    const byCart = new Map(active.map((session) => [session.cart_id, session]));
    res.json({
      items: rows.map((row) => {
        const session = byCart.get(row.id);
        return {
          ...serializeCart(row),
          excluidoEm: row.excluido_em || null,
          sessaoAtiva: session
            ? {
                id: session.id,
                clienteNome: session.cliente_nome,
                fimPrevistoEm: session.fim_previsto_em,
                valorCentavos: session.valor_centavos,
              }
            : null,
        };
      }),
    });
  });

  router.post('/', requireAdmin, uploadCartPhoto, (req, res, next) => {
    try {
      validateUploadedPhoto(req.file);
      const body = createSchema.parse(req.body);
      const category = requireCategory(db, req.tenantId, body.category_id, { activeOnly: true });
      const exists = db
        .prepare(
          `SELECT id FROM carts WHERE tenant_id = ? AND codigo = ? COLLATE NOCASE
             AND excluido_em IS NULL`,
        )
        .get(req.tenantId, body.codigo);
      if (exists) {
        throw conflict('Já existe um carrinho com este código.');
      }
      const now = nowIso();
      const info = db
        .prepare(
          `INSERT INTO carts
            (tenant_id, category_id, codigo, qr_token, foto_url, status, observacao, criado_em, atualizado_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          req.tenantId,
          category.id,
          body.codigo,
          crypto.randomUUID(),
          optionalPhoto(req),
          body.status || 'disponivel',
          body.observacao || null,
          now,
          now,
        );
      const row = getCart(db, req.tenantId, Number(info.lastInsertRowid));
      req.app.locals.broadcast?.(req.tenantId);
      res.status(201).json({ item: serializeCart(row) });
    } catch (err) {
      if (req.file) removeUploadedByUrl(uploadedPhotoUrl(req.file));
      next(err);
    }
  });

  router.patch('/:id', requireAdmin, uploadCartPhoto, (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = getCart(db, req.tenantId, id);
      if (!row) throw notFound('Carrinho não encontrado.');
      validateUploadedPhoto(req.file);
      const body = updateSchema.parse(req.body);
      const active = activeSessionForCart(db, req.tenantId, id);

      if (body.status && body.status !== row.status && active) {
        throw conflict('Não altere o status de um carrinho com sessão em andamento.');
      }
      if (body.codigo && body.codigo !== row.codigo) {
        const exists = db
          .prepare(
            `SELECT id FROM carts WHERE tenant_id = ? AND codigo = ? COLLATE NOCASE
               AND excluido_em IS NULL AND id != ?`,
          )
          .get(req.tenantId, body.codigo, id);
        if (exists) throw conflict('Já existe um carrinho com este código.');
      }
      if (body.category_id !== undefined) {
        const category = requireCategory(db, req.tenantId, body.category_id);
        const changedCategory = Number(body.category_id) !== Number(row.category_id);
        if (changedCategory && !category.ativo) {
          throw badRequest('Escolha uma categoria ativa.');
        }
        if (active && changedCategory) {
          throw conflict('Não altere a categoria de um carrinho com sessão em andamento.');
        }
      }

      const fields = [];
      const params = [];
      if (body.codigo !== undefined) {
        fields.push('codigo = ?');
        params.push(body.codigo);
      }
      if (body.category_id !== undefined) {
        fields.push('category_id = ?');
        params.push(body.category_id);
      }
      if (body.status !== undefined) {
        fields.push('status = ?');
        params.push(body.status);
      }
      if (body.observacao !== undefined) {
        fields.push('observacao = ?');
        params.push(body.observacao || null);
      }
      let oldPhotoToRemove = null;
      if (req.file) {
        fields.push('foto_url = ?');
        params.push(uploadedPhotoUrl(req.file));
        oldPhotoToRemove = row.foto_url;
      } else if (body.remove_foto === '1') {
        fields.push('foto_url = NULL');
        oldPhotoToRemove = row.foto_url;
      }
      fields.push('atualizado_em = ?');
      params.push(nowIso());

      db.prepare(`UPDATE carts SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`).run(
        ...params,
        id,
        req.tenantId,
      );
      if (oldPhotoToRemove) removeUploadedByUrl(oldPhotoToRemove);
      const fresh = getCart(db, req.tenantId, id);
      req.app.locals.broadcast?.(req.tenantId);
      res.json({ item: serializeCart(fresh) });
    } catch (err) {
      if (req.file) removeUploadedByUrl(uploadedPhotoUrl(req.file));
      next(err);
    }
  });

  // Check-in rápido pelo scan: devolve o carrinho à operação.
  router.post('/:id/checkin', (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = getCart(db, req.tenantId, id);
      if (!row) throw notFound('Carrinho não encontrado.');
      if (activeSessionForCart(db, req.tenantId, id)) {
        throw conflict('Encerre a sessão ativa antes de fazer check-in.');
      }
      const body = checkinSchema.parse(req.body || {});
      if (row.status === 'manutencao' && req.user.role !== 'admin') {
        throw forbidden('Apenas administradores liberam carrinho da manutenção.');
      }
      if (row.status === 'em_uso') {
        throw conflict('Carrinho está em uso. Encerre a sessão primeiro.');
      }
      if (row.status === 'disponivel') {
        return res.json({ item: serializeCart(row), mensagem: 'Carrinho já está disponível.' });
      }
      const observacao =
        body.observacao !== undefined && body.observacao !== null && body.observacao !== ''
          ? body.observacao
          : row.observacao;
      db.prepare(
        `UPDATE carts SET status = 'disponivel', observacao = ?, atualizado_em = ?
         WHERE id = ? AND tenant_id = ?`,
      ).run(observacao, nowIso(), id, req.tenantId);
      req.app.locals.broadcast?.(req.tenantId);
      res.json({ item: serializeCart(getCart(db, req.tenantId, id)), mensagem: 'Check-in concluído.' });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', requireAdmin, (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = getCart(db, req.tenantId, id);
      if (!row) throw notFound('Carrinho não encontrado.');
      if (activeSessionForCart(db, req.tenantId, id)) {
        throw conflict('Encerre ou cancele a sessão antes de excluir o carrinho.');
      }
      const now = nowIso();
      db.prepare(
        'UPDATE carts SET excluido_em = ?, atualizado_em = ? WHERE id = ? AND tenant_id = ?',
      ).run(now, now, id, req.tenantId);
      req.app.locals.broadcast?.(req.tenantId);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
