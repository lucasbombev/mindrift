import { Router } from 'express';
import { notFound } from '../utils/errors.js';
import { nowIso } from '../utils/time.js';

export function createImpersonationRouter(db) {
  const router = Router();

  // Encerra uma sessão de suporte. Pode ser chamado pelo superadmin ou pelo
  // próprio token de impersonação (para o botão "Sair do modo suporte").
  router.post('/:id/end', (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const audit = db.prepare('SELECT * FROM audit_logs WHERE id = ?').get(id);
      if (!audit) throw notFound('Sessão de suporte não encontrada.');
      const allowed =
        req.user?.role === 'superadmin' || Number(req.user?.impersonation?.id) === id;
      if (!allowed) throw notFound('Sessão de suporte não encontrada.');
      if (!audit.finalizado_em) {
        db.prepare('UPDATE audit_logs SET finalizado_em = ? WHERE id = ?').run(nowIso(), id);
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
