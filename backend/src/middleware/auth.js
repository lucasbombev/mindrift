import { forbidden, unauthorized } from '../utils/errors.js';
import { publicUser, verifyAccessToken } from '../services/auth.js';

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
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(payload.sub));
  if (!row || !row.ativo) throw unauthorized('Usuário inativo ou removido.');
  if (Number(payload.tv) !== Number(row.token_version)) {
    throw unauthorized('Sessão encerrada. Entre novamente.');
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

export function requireAdmin(req, _res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return next(forbidden('Apenas administradores podem acessar este recurso.'));
  }
  next();
}
