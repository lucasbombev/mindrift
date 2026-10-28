import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { uploadCartPhoto, validateUploadedPhoto, uploadedPhotoUrl, removeUploadedByUrl } from '../services/upload.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
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
  status: z.enum(STATUSES).optional(),
  observacao: z.string().trim().max(200).optional(),
});

const updateSchema = z.object({
  codigo: codigoSchema.optional(),
  status: z.enum(STATUSES).optional(),
  observacao: z.string().trim().max(200).nullable().optional(),
  remove_foto: z.enum(['0', '1']).optional(),
});

function activeSessionForCart(db, cartId) {
  return db
    .prepare(
      "SELECT id, cliente_nome FROM sessions WHERE cart_id = ? AND status = 'em_andamento' AND excluida_em IS NULL",
    )
    .get(cartId);
}

function getCart(db, id) {
  return db.prepare('SELECT * FROM carts WHERE id = ? AND excluido_em IS NULL').get(id);
}

export function createCartsRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const includeDeleted = req.query.incluirExcluidos === '1' && req.user.role === 'admin';
    const rows = db
      .prepare(
        `SELECT * FROM carts ${includeDeleted ? '' : 'WHERE excluido_em IS NULL'}
         ORDER BY codigo COLLATE NOCASE`,
      )
      .all();
    const active = db
      .prepare("SELECT * FROM sessions WHERE status = 'em_andamento' AND excluida_em IS NULL")
      .all();
    const byCart = new Map(active.map((s) => [s.cart_id, s]));
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
      const exists = db
        .prepare('SELECT id FROM carts WHERE codigo = ? COLLATE NOCASE AND excluido_em IS NULL')
        .get(body.codigo);
      if (exists) {
        removeUploadedByUrl(uploadedPhotoUrl(req.file));
        throw conflict('Já existe um carrinho com este código.');
      }
      const now = nowIso();
      const info = db
        .prepare(
          `INSERT INTO carts (codigo, foto_url, status, observacao, criado_em, atualizado_em)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          body.codigo,
          uploadedPhotoUrl(req.file),
          body.status || 'disponivel',
          body.observacao || null,
          now,
          now,
        );
      const row = getCart(db, Number(info.lastInsertRowid));
      req.app.locals.broadcast?.();
      res.status(201).json({ item: serializeCart(row) });
    } catch (err) {
      if (req.file) removeUploadedByUrl(uploadedPhotoUrl(req.file));
      next(err);
    }
  });

  router.patch('/:id', requireAdmin, uploadCartPhoto, (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = getCart(db, id);
      if (!row) {
        if (req.file) removeUploadedByUrl(uploadedPhotoUrl(req.file));
        throw notFound('Carrinho não encontrado.');
      }
      validateUploadedPhoto(req.file);
      const body = updateSchema.parse(req.body);
      const active = activeSessionForCart(db, id);

      if (body.status && body.status !== row.status) {
        if (active) {
          throw conflict('Não altere o status de um carrinho com sessão em andamento.');
        }
        if (row.status === 'em_uso' && body.status === 'disponivel') {
          // Permite corrigir um estado inconsistente sem sessão ativa.
        }
      }
      if (body.codigo && body.codigo !== row.codigo) {
        const exists = db
          .prepare(
            'SELECT id FROM carts WHERE codigo = ? COLLATE NOCASE AND excluido_em IS NULL AND id != ?',
          )
          .get(body.codigo, id);
        if (exists) throw conflict('Já existe um carrinho com este código.');
      }

      const fields = [];
      const params = [];
      if (body.codigo !== undefined) {
        fields.push('codigo = ?');
        params.push(body.codigo);
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

      db.prepare(`UPDATE carts SET ${fields.join(', ')} WHERE id = ?`).run(...params, id);
      if (oldPhotoToRemove) removeUploadedByUrl(oldPhotoToRemove);
      const fresh = getCart(db, id);
      req.app.locals.broadcast?.();
      res.json({ item: serializeCart(fresh) });
    } catch (err) {
      if (req.file) removeUploadedByUrl(uploadedPhotoUrl(req.file));
      next(err);
    }
  });

  router.delete('/:id', requireAdmin, (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = getCart(db, id);
      if (!row) throw notFound('Carrinho não encontrado.');
      if (activeSessionForCart(db, id)) {
        throw conflict('Encerre ou cancele a sessão antes de excluir o carrinho.');
      }
      db.prepare(
        'UPDATE carts SET excluido_em = ?, atualizado_em = ? WHERE id = ?',
      ).run(nowIso(), nowIso(), id);
      req.app.locals.broadcast?.();
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
