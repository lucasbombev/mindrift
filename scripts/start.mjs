#!/usr/bin/env node
/**
 * Sobe o Drift Rent com um único comando:
 *   npm start
 *
 * - cria backend/.env (com segredos aleatórios) se necessário;
 * - instala dependências se node_modules estiver ausente;
 * - builda o frontend quando necessário;
 * - inicia o servidor Express + Socket.IO em 0.0.0.0:3000.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const FRONTEND = path.join(ROOT, 'frontend');
const ENV_FILE = path.join(BACKEND, '.env');
const ENV_EXAMPLE = path.join(BACKEND, '.env.example');

function log(message) {
  console.log(`\x1b[38;5;208m[drift]\x1b[0m ${message}`);
}

function randomSecret() {
  return crypto.randomBytes(48).toString('hex');
}

function ensureEnv() {
  if (!fs.existsSync(ENV_FILE)) {
    if (!fs.existsSync(ENV_EXAMPLE)) {
      console.error('[drift] backend/.env.example não encontrado.');
      process.exit(1);
    }
    let content = fs.readFileSync(ENV_EXAMPLE, 'utf8');
    content = content
      .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${randomSecret()}`)
      .replace(/^JWT_REFRESH_SECRET=.*$/m, `JWT_REFRESH_SECRET=${randomSecret()}`);
    fs.writeFileSync(ENV_FILE, content, { mode: 0o600 });
    log('backend/.env criado com segredos aleatórios.');
    return;
  }

  let content = fs.readFileSync(ENV_FILE, 'utf8');
  let changed = false;
  if (/^JWT_SECRET=\s*$/m.test(content)) {
    content = content.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${randomSecret()}`);
    changed = true;
  }
  if (/^JWT_REFRESH_SECRET=\s*$/m.test(content)) {
    content = content.replace(/^JWT_REFRESH_SECRET=.*$/m, `JWT_REFRESH_SECRET=${randomSecret()}`);
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(ENV_FILE, content, { mode: 0o600 });
    log('Segredos JWT ausentes foram gerados no backend/.env.');
  }
}

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function latestMtime(dir, ignore = []) {
  let latest = 0;
  if (!fs.existsSync(dir)) return latest;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignore.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) latest = Math.max(latest, latestMtime(full, ignore));
    else latest = Math.max(latest, fs.statSync(full).mtimeMs);
  }
  return latest;
}

function frontendNeedsBuild() {
  const index = path.join(FRONTEND, 'dist', 'index.html');
  if (!fs.existsSync(index)) return true;
  const buildTime = fs.statSync(index).mtimeMs;
  const sourceTime = Math.max(
    latestMtime(path.join(FRONTEND, 'src')),
    latestMtime(path.join(FRONTEND, 'public')),
    fs.statSync(path.join(FRONTEND, 'index.html')).mtimeMs,
    fs.statSync(path.join(FRONTEND, 'vite.config.ts')).mtimeMs,
    fs.statSync(path.join(FRONTEND, 'package.json')).mtimeMs,
  );
  return sourceTime > buildTime + 500;
}

function ensureDependencies() {
  const hasBackend = fs.existsSync(path.join(ROOT, 'node_modules', 'express'));
  const hasFrontend = fs.existsSync(path.join(ROOT, 'node_modules', 'vite'));
  if (hasBackend && hasFrontend) return;
  log('Dependências ausentes. Rodando "npm install" (precisa de internet só nesta etapa)...');
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error('[drift] Falha ao instalar dependências.');
    process.exit(result.status || 1);
  }
}

function buildFrontend() {
  if (!frontendNeedsBuild()) return;
  log('Gerando build do frontend...');
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, NODE_ENV: 'production' },
  });
  if (result.status !== 0) {
    console.error('[drift] Falha no build do frontend.');
    process.exit(result.status || 1);
  }
}


ensureDependencies();
ensureEnv();
buildFrontend();

const env = parseEnvFile(ENV_FILE);
const childEnv = {
  ...process.env,
  ...env,
  TZ: env.TZ || process.env.TZ || 'America/Fortaleza',
  NODE_ENV: process.env.NODE_ENV || env.NODE_ENV || 'production',
};

if (env.HTTPS !== '0' && fs.existsSync(path.join(BACKEND, 'certs', 'server.crt'))) {
  log('Certificado local detectado: HTTPS também em https://IP:3443 (PWA).');
}

log(`Iniciando servidor em http://0.0.0.0:${env.PORT || 3000} ...`);

let child = null;
let shuttingDown = false;
let restartTimes = [];

function launch() {
  child = spawn(process.execPath, ['src/server.js'], {
    cwd: BACKEND,
    stdio: 'inherit',
    env: childEnv,
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      process.exit(signal ? 0 : (code ?? 0));
      return;
    }
    console.error(
      `\n[drift] O servidor encerrou inesperadamente (código ${code ?? '?'}${signal ? `, sinal ${signal}` : ''}).`,
    );
    const now = Date.now();
    restartTimes = restartTimes.filter((time) => now - time < 60_000);
    restartTimes.push(now);
    if (restartTimes.length > 8) {
      console.error('[drift] Muitas falhas em sequência. Verifique o log e rode novamente.');
      process.exit(1);
    }
    console.error('[drift] Reiniciando em 1,5 s... Os dados e timers continuam no SQLite.');
    setTimeout(launch, 1500);
  });

  child.on('error', (err) => {
    console.error('[drift] Erro ao iniciar o servidor:', err.message);
    if (!shuttingDown) setTimeout(launch, 1500);
  });
}

const forward = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[drift] Encerrando (${signal})...`);
  if (child && !child.killed) child.kill(signal);
  setTimeout(() => process.exit(0), 3500).unref();
};

process.on('SIGINT', () => forward('SIGINT'));
process.on('SIGTERM', () => forward('SIGTERM'));

launch();
