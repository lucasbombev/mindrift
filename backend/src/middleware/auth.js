import { forbidden, unauthorized } from '../utils/errors.js';
import {
  getUserWithTenant,
  publicUser,
  verifyAccessToken,
} from '../services/auth.js';

const PENDING_PASSWORD_ALLOWED = new Set([
  'GET /api/auth/me',
  'POST /api/auth/change-password',
  'POST /api/auth/logout',
]);

function readBearer(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export function authenticateToken(db, token) {
  const payload = verifyAccessToken(token);
  const row = getUserWithTenant(db, Number(payload.sub));
  if (!row || !row.ativo) throw unauthorized('Usuário inativo ou removido.');
  if (Number(payload.tv) !== Number(row.token_version)) {
    throw unauthorized('Sessão encerrada. Entre novamente.');
  }
  if (row.role !== 'superadmin') {
    if (!row.tenant_id || row.tenant_excluido_em) {
      throw forbidden('Negócio indisponível. Fale com o suporte.', 'negocio_indisponivel');
    }
    if (!row.tenant_ativo) {
      throw forbidden('Este negócio está suspenso. Fale com o suporte.', 'negocio_suspenso');
    }
  }
  const user = publicUser(row);
  if (payload.imp) {
    const audit = db
      .prepare(
        `SELECT a.*, s.ativo AS superadmin_ativo, s.role AS superadmin_role
         FROM audit_logs a JOIN users s ON s.id = a.superadmin_id
         WHERE a.id = ? AND a.finalizado_em IS NULL`,
      )
      .get(Number(payload.imp));
    if (
      !audit ||
      audit.superadmin_role !== 'superadmin' ||
      !audit.superadmin_ativo ||
      Number(audit.superadmin_id) !== Number(payload.by) ||
      Number(audit.tenant_id) !== Number(row.tenant_id)
    ) {
      throw unauthorized('Sessão de suporte encerrada. Entre novamente.');
    }
    user.impersonation = {
      id: audit.id,
      superadminId: audit.superadmin_id,
      motivo: audit.motivo,
      iniciadoEm: audit.iniciado_em,
    };
  }
  return user;
}

export function requireAuth(db) {
  return (req, _res, next) => {
    try {
      const token = readBearer(req);
      if (!token) throw unauthorized('Faça login para continuar.');
      const user = authenticateToken(db, token);
      req.user = user;
      req.tenantId = user.tenantId ?? null;

      if (
        user.mustChangePassword &&
        !PENDING_PASSWORD_ALLOWED.has(`${req.method} ${req.baseUrl}${req.path}`)
      ) {
        throw forbidden(
          'Troque a senha inicial antes de usar o sistema.',
          'senha_troca_obrigatoria',
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Bloqueia superadmin e garante que a rota é de um tenant. */
export function requireTenant(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role === 'superadmin' || !req.tenantId) {
    return next(
      forbidden(
        'Esta área é exclusiva dos negócios. Superadmin usa apenas o painel /superadmin.',
        'superadmin_sem_tenant',
      ),
    );
  }
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return next(forbidden('Apenas administradores podem acessar este recurso.'));
  }
  next();
}

export function requireSuperadmin(req, _res, next) {
  if (!req.user || req.user.role !== 'superadmin') {
    return next(forbidden('Apenas o superadmin pode acessar este recurso.'));
  }
  next();
}
