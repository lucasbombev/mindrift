import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { unauthorized } from '../utils/errors.js';

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    username: row.username,
    email: row.email || null,
    role: row.role,
    ativo: Boolean(row.ativo),
    mustChangePassword: Boolean(row.must_change_password),
    ultimoLoginEm: row.ultimo_login_em || null,
    criadoEm: row.criado_em,
  };
}

export function hashPassword(password) {
  return bcrypt.hash(password, config.bcryptRounds);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user.id), role: user.role, tv: user.token_version, type: 'access' },
    config.jwtSecret,
    { expiresIn: config.accessTokenTtl, issuer: 'drift-rent' },
  );
}

export function signRefreshToken(user) {
  return jwt.sign(
    { sub: String(user.id), tv: user.token_version, type: 'refresh' },
    config.refreshSecret,
    { expiresIn: config.refreshTokenTtl, issuer: 'drift-rent' },
  );
}

function verifyToken(token, secret, expectedType) {
  let payload;
  try {
    payload = jwt.verify(token, secret, { issuer: 'drift-rent' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw unauthorized('Sessão expirada. Entre novamente.');
    }
    throw unauthorized();
  }
  if (!payload || payload.type !== expectedType) throw unauthorized();
  return payload;
}

export function verifyAccessToken(token) {
  return verifyToken(token, config.jwtSecret, 'access');
}

export function verifyRefreshToken(token) {
  return verifyToken(token, config.refreshSecret, 'refresh');
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: false, // a rede local roda em HTTP; coloque atrás de HTTPS para usar true
    path: '/api/auth',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
}

export function setRefreshCookie(res, token) {
  res.cookie('drift_refresh', token, refreshCookieOptions());
  // Marcador legível pelo JS apenas para evitar uma tentativa de refresh no primeiro acesso.
  res.cookie('drift_has_session', '1', {
    httpOnly: false,
    sameSite: 'strict',
    secure: false,
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res) {
  res.clearCookie('drift_refresh', { ...refreshCookieOptions(), maxAge: undefined });
  res.clearCookie('drift_has_session', { path: '/' });
}

export function authPayload(user) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
    user: publicUser(user),
  };
}
