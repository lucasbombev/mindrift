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
    if (!row.tenant_id || !row.tenant_ativo) {
      throw forbidden('Negócio inativo ou indisponível.', 'negocio_inativo');
    }
  }
  return publicUser(row);
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
