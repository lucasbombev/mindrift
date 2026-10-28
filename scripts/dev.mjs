#!/usr/bin/env node
/**
 * Modo desenvolvimento: backend (porta 3000) + Vite com HMR (porta 5173).
 * Uso: npm run dev
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');

if (!fs.existsSync(path.join(BACKEND, '.env'))) {
  console.error('[dev] backend/.env não existe. Rode "npm start" uma vez para criá-lo.');
  process.exit(1);
}

const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';
const children = [];

function run(label, command, args, cwd, env = {}) {
  const child = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.on('exit', (code) => {
    console.log(`[dev] ${label} encerrou (${code ?? 0}).`);
    children.forEach((item) => {
      if (item !== child && !item.killed) item.kill('SIGTERM');
    });
    process.exit(code ?? 0);
  });
  return child;
}

run('backend', process.execPath, ['--watch', 'src/server.js'], BACKEND, {
  NODE_ENV: 'development',
  TZ: process.env.TZ || 'America/Fortaleza',
});
run('frontend', npm, ['run', 'dev', '--workspace', 'frontend'], ROOT);

process.on('SIGINT', () => {
  children.forEach((child) => !child.killed && child.kill('SIGINT'));
  setTimeout(() => process.exit(0), 300);
});
