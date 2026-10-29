import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { config } from '../config.js';
import { listBackups } from './backup.js';

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

/** Dados de infraestrutura para o painel Sistema (somente superadmin). */
function detectTailscaleUrl() {
  if (config.tailscaleUrl) return config.tailscaleUrl;
  try {
    const raw = execFileSync('tailscale', ['status', '--json'], {
      timeout: 1500,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const dns = JSON.parse(raw)?.Self?.DNSName;
    if (dns) return `https://${String(dns).replace(/\.$/, '')}`;
  } catch {
    /* Tailscale não instalado/ativo */
  }
  return null;
}

export function getPlatformSystemInfo(db) {
  let dbSize = 0;
  try {
    dbSize = fs.statSync(config.dbPath).size;
  } catch {
    dbSize = 0;
  }
  let diskFreeBytes = null;
  try {
    const stat = fs.statfsSync(path.dirname(config.dbPath));
    diskFreeBytes = Number(stat.bavail) * Number(stat.bsize);
  } catch {
    diskFreeBytes = null;
  }
  const backups = listBackups();
  const lastBackup = backups[0] || null;
  let logSizeBytes = 0;
  try {
    logSizeBytes = fs.statSync(config.logPath).size;
  } catch {
    logSizeBytes = 0;
  }
  return {
    hostname: os.hostname(),
    plataforma: `${os.type()} ${os.release()}`,
    node: process.version,
    ips: getLanUrls(),
    uptimeSegundos: Math.round(process.uptime()),
    fuso: config.tz,
    porta: config.port,
    httpsPort: config.httpsPort,
    httpsAtivo: fs.existsSync(config.certPath) && fs.existsSync(config.keyPath),
    versao: config.version,
    dbPath: config.dbPath,
    dbSizeBytes: dbSize,
    backupDir: config.backupDir,
    lastBackup,
    diskFreeBytes,
    logPath: config.logPath,
    logSizeBytes,
    backupHour: config.backupHour,
    backupRetentionDays: config.backupRetentionDays,
    tailscaleUrl: detectTailscaleUrl(),
  };
}

/** Indicador simples permitido ao tenant. */
export function getTenantHealth() {
  return { ok: true, versao: config.version, horarioServidor: new Date().toISOString() };
}
