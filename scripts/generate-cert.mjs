#!/usr/bin/env node
/**
 * Gera uma CA local + certificado do servidor para o PWA funcionar no celular
 * via HTTPS (navegadores exigem contexto seguro para service worker/instalação).
 *
 * Uso: npm run cert
 * Saída: backend/certs/local-ca.crt (instale no celular), server.crt, server.key
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CERT_DIR = path.join(ROOT, 'backend', 'certs');
const FORCE = process.argv.includes('--force');
const NEW_CA = process.argv.includes('--new-ca');

function sh(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    throw new Error(`Comando falhou: ${command} ${args.join(' ')}`);
  }
}

const version = spawnSync('openssl', ['version'], { stdio: 'ignore' });
if (version.status !== 0) {
  console.error('[cert] OpenSSL não encontrado. No Windows, use Git Bash ou WSL.');
  process.exit(1);
}

fs.mkdirSync(CERT_DIR, { recursive: true });
const serverKey = path.join(CERT_DIR, 'server.key');
const serverCrt = path.join(CERT_DIR, 'server.crt');
const caKey = path.join(CERT_DIR, 'local-ca.key');
const caCrt = path.join(CERT_DIR, 'local-ca.crt');

if (fs.existsSync(serverCrt) && fs.existsSync(serverKey) && !FORCE && !NEW_CA) {
  console.log('[cert] Certificado já existe em backend/certs. Use --force para regenerar (mantendo a CA).');
  process.exit(0);
}

const ips = ['127.0.0.1'];
for (const entries of Object.values(os.networkInterfaces())) {
  for (const entry of entries || []) {
    if (entry.family === 'IPv4' && !entry.internal) ips.push(entry.address);
  }
}
const san = ['DNS:localhost', ...new Set(ips.map((ip) => `IP:${ip}`))].join(',');
const extFile = path.join(CERT_DIR, 'san.cnf');
fs.writeFileSync(
  extFile,
  `basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=${san}\n`,
);

const hasCA = fs.existsSync(caKey) && fs.existsSync(caCrt);
if (NEW_CA || !hasCA) {
  console.log('[cert] Gerando nova CA local (será preciso confiar nela nos celulares)...');
  sh('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    caKey,
    '-out',
    caCrt,
    '-days',
    '3650',
    '-subj',
    '/CN=Drift Rent CA',
  ]);
} else {
  console.log('[cert] Reutilizando a CA local existente (a confiança dos celulares é preservada).');
}

console.log('[cert] Gerando certificado do servidor...');
sh('openssl', [
  'req',
  '-newkey',
  'rsa:2048',
  '-nodes',
  '-keyout',
  serverKey,
  '-out',
  path.join(CERT_DIR, 'server.csr'),
  '-subj',
  '/CN=drift-rent.local',
]);
sh('openssl', [
  'x509',
  '-req',
  '-in',
  path.join(CERT_DIR, 'server.csr'),
  '-CA',
  caCrt,
  '-CAkey',
  caKey,
  ...(fs.existsSync(path.join(CERT_DIR, 'local-ca.srl'))
    ? ['-CAserial', path.join(CERT_DIR, 'local-ca.srl')]
    : ['-CAcreateserial']),
  '-out',
  serverCrt,
  '-days',
  '825',
  '-extfile',
  extFile,
]);

try {
  fs.chmodSync(serverKey, 0o600);
  fs.chmodSync(caKey, 0o600);
} catch {
  /* Windows */
}

console.log('');
console.log('  ✅ Certificado criado!');
console.log(`  IPs no certificado: ${ips.join(', ')}`);
console.log('');
console.log('  Reinicie com "npm start" e acesse no celular:');
for (const ip of ips.filter((ip) => ip !== '127.0.0.1')) {
  console.log(`    https://${ip}:3443`);
}
console.log('');
console.log('  Para o navegador confiar (necessário no celular):');
console.log(`    Android: Configurações → Segurança → Criptografia e credenciais →`);
console.log(`             Instalar certificado → CA → baixe/instale ${path.relative(ROOT, caCrt)}`);
console.log('    iPhone: envie o local-ca.crt por AirDrop/arquivo, instale o perfil em Ajustes →');
console.log('            Geral → VPN e Gerenciamento de Dispositivos e ative em');
console.log('            Ajustes → Geral → Sobre → Ajustes de Confiança de Certificado.');
console.log('');
console.log('  Se o IP mudar, rode "npm run cert -- --force" (reutiliza a CA já confiada).');
console.log('  Avançado (se não puder instalar a CA): abra o endereço HTTPS e aceite o aviso.');
console.log('  O service worker/PWA pode exigir a CA confiada para funcionar plenamente.');
