import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND_ROOT = path.resolve(__dirname, '..');
export const PROJECT_ROOT = path.resolve(BACKEND_ROOT, '..');

dotenv.config({ path: path.join(BACKEND_ROOT, '.env'), quiet: true });

// O fuso é aplicado antes das datas serem usadas. O script de start também
// injeta TZ no processo filho, o que garante o fuso correto em produção.
if (process.env.TZ) process.env.TZ = process.env.TZ;

const nodeEnv = process.env.NODE_ENV || 'development';

function resolvePath(value, fallback) {
  const target = value || fallback;
  return path.isAbsolute(target) ? target : path.resolve(BACKEND_ROOT, target);
}

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error(
    'JWT_SECRET ausente ou curto. Rode "npm start" na raiz para gerar o backend/.env automaticamente.',
  );
}

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  tz: process.env.TZ || 'America/Fortaleza',
  dbPath: resolvePath(process.env.DB_PATH, 'data/drift.db'),
  uploadDir: resolvePath(process.env.UPLOAD_DIR, 'uploads'),
  backupDir: resolvePath(process.env.BACKUP_DIR, 'backups'),
  jwtSecret,
  refreshSecret: process.env.JWT_REFRESH_SECRET || `${jwtSecret}:refresh`,
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '12h',
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL || '30d',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),
  trustProxy: process.env.TRUST_PROXY === '1',
  backupHour: Math.min(23, Math.max(0, Number(process.env.BACKUP_HOUR ?? 3))),
  backupRetentionDays: Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS || 30)),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 6) * 1024 * 1024,
  frontendDist: path.resolve(PROJECT_ROOT, 'frontend', 'dist'),
  httpsPort: Number(process.env.HTTPS_PORT || 3443),
  certPath: process.env.HTTPS_CERT || path.resolve(BACKEND_ROOT, 'certs', 'server.crt'),
  keyPath: process.env.HTTPS_KEY || path.resolve(BACKEND_ROOT, 'certs', 'server.key'),
  caCertPath: path.resolve(BACKEND_ROOT, 'certs', 'local-ca.crt'),
  version: '1.0.0',
};

export function assertRuntimeDirs() {
  for (const dir of [path.dirname(config.dbPath), config.uploadDir, config.backupDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
