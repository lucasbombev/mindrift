import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

let timer = null;

function stamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export async function createBackup(db, { prefix = 'drift' } = {}) {
  fs.mkdirSync(config.backupDir, { recursive: true });
  let filename = `${prefix}-${stamp()}.db`;
  let target = path.join(config.backupDir, filename);
  let suffix = 1;
  while (fs.existsSync(target)) {
    filename = `${prefix}-${stamp()}-${suffix}.db`;
    target = path.join(config.backupDir, filename);
    suffix += 1;
  }
  await db.backup(target);
  const stat = fs.statSync(target);
  cleanupOldBackups();
  return {
    filename,
    path: target,
    sizeBytes: stat.size,
    createdAt: stat.birthtime.toISOString(),
  };
}

export function listBackups() {
  if (!fs.existsSync(config.backupDir)) return [];
  return fs
    .readdirSync(config.backupDir)
    .filter((name) => name.endsWith('.db'))
    .map((name) => {
      const stat = fs.statSync(path.join(config.backupDir, name));
      return {
        filename: name,
        sizeBytes: stat.size,
        createdAt: stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.filename.localeCompare(a.filename));
}

export function cleanupOldBackups() {
  const cutoff = Date.now() - config.backupRetentionDays * 24 * 60 * 60 * 1000;
  for (const backup of listBackups()) {
    const full = path.join(config.backupDir, backup.filename);
    try {
      if (fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full, { force: true });
    } catch {
      /* arquivo em uso ou removido: ignora */
    }
  }
}

export function resolveBackupPath(filename) {
  const safe = path.basename(filename);
  if (safe !== filename || !safe.endsWith('.db')) return null;
  const full = path.resolve(config.backupDir, safe);
  if (!full.startsWith(path.resolve(config.backupDir) + path.sep)) return null;
  return fs.existsSync(full) ? full : null;
}

function nextRunDate(now = new Date()) {
  const next = new Date(now);
  next.setHours(config.backupHour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

export function startBackupScheduler(db, log = console) {
  const schedule = () => {
    const next = nextRunDate();
    const delay = Math.max(1000, next.getTime() - Date.now());
    timer = setTimeout(async () => {
      try {
        const backup = await createBackup(db, { prefix: 'auto' });
        log.info?.(`[backup] automático criado: ${backup.filename}`);
      } catch (err) {
        log.error?.('[backup] falhou:', err.message);
      }
      schedule();
    }, delay);
    timer.unref?.();
  };
  schedule();
  log.info?.(`[backup] próximo backup automático às ${String(config.backupHour).padStart(2, '0')}:00 (${config.tz}).`);
}

export function stopBackupScheduler() {
  if (timer) clearTimeout(timer);
  timer = null;
}

export async function startupBackupIfNeeded(db, log = console) {
  const backups = listBackups();
  const newest = backups[0] ? new Date(backups[0].modifiedAt).getTime() : 0;
  if (Date.now() - newest > 24 * 60 * 60 * 1000) {
    try {
      const backup = await createBackup(db, { prefix: 'auto' });
      log.info?.(`[backup] cópia inicial criada: ${backup.filename}`);
    } catch (err) {
      log.error?.('[backup] cópia inicial falhou:', err.message);
    }
  }
}
