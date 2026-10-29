import fs from 'node:fs';
import os from 'node:os';
import { config } from '../config.js';

export function getLanUrls(port = config.port) {
  const urls = [];
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        urls.push(`http://${entry.address}:${port}`);
      }
    }
  }
  return [...new Set(urls)];
}

export function getSystemInfo(db, tenantId) {
  let dbSize = 0;
  try {
    dbSize = fs.statSync(config.dbPath).size;
  } catch {
    dbSize = 0;
  }
  const counts = {
    carrinhos: db
      .prepare('SELECT COUNT(*) AS n FROM carts WHERE tenant_id = ? AND excluido_em IS NULL')
      .get(tenantId).n,
    usuarios: db
      .prepare('SELECT COUNT(*) AS n FROM users WHERE tenant_id = ? AND ativo = 1')
      .get(tenantId).n,
    sessoes: db
      .prepare('SELECT COUNT(*) AS n FROM sessions WHERE tenant_id = ? AND excluida_em IS NULL')
      .get(tenantId).n,
  };
  return {
    versao: config.version,
    ambiente: config.nodeEnv,
    hostname: os.hostname(),
    plataforma: `${os.type()} ${os.release()}`,
    node: process.version,
    fuso: config.tz,
    porta: config.port,
    urls: getLanUrls(),
    httpsPort: config.httpsPort,
    httpsAtivo: fs.existsSync(config.certPath) && fs.existsSync(config.keyPath),
    uptimeSegundos: Math.round(process.uptime()),
    dbPath: config.dbPath,
    dbSizeBytes: dbSize,
    uploadDir: config.uploadDir,
    backupDir: config.backupDir,
    backupHour: config.backupHour,
    backupRetentionDays: config.backupRetentionDays,
    contagens: counts,
  };
}
