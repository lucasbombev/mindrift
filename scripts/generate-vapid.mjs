#!/usr/bin/env node
/**
 * Gera/repara as chaves VAPID no backend/.env.
 * Uso: npm run vapid:generate [-- --force]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, 'backend', '.env');
const force = process.argv.includes('--force');

if (!fs.existsSync(envPath)) {
  console.error('backend/.env não encontrado. Rode "npm start" uma vez para criá-lo.');
  process.exit(1);
}

let content = fs.readFileSync(envPath, 'utf8');
const publicMatch = content.match(/^VAPID_PUBLIC_KEY=(.*)$/m);
const privateMatch = content.match(/^VAPID_PRIVATE_KEY=(.*)$/m);
const hasKeys = Boolean(publicMatch?.[1]?.trim() && privateMatch?.[1]?.trim());

if (hasKeys && !force) {
  console.log('VAPID já configurado em backend/.env.');
  console.log('Use "npm run vapid:generate -- --force" para substituir (invalida inscrições antigas).');
  process.exit(0);
}

const keys = webpush.generateVAPIDKeys();
if (publicMatch) content = content.replace(/^VAPID_PUBLIC_KEY=.*$/m, `VAPID_PUBLIC_KEY=${keys.publicKey}`);
else content += `\nVAPID_PUBLIC_KEY=${keys.publicKey}`;
if (privateMatch) content = content.replace(/^VAPID_PRIVATE_KEY=.*$/m, `VAPID_PRIVATE_KEY=${keys.privateKey}`);
else content += `\nVAPID_PRIVATE_KEY=${keys.privateKey}`;
if (!/^VAPID_SUBJECT=/m.test(content)) content += '\nVAPID_SUBJECT=mailto:contato@mindrift.local';
fs.writeFileSync(envPath, content, { mode: 0o600 });

console.log('Chaves VAPID gravadas em backend/.env.');
console.log('Chave pública:', keys.publicKey);
console.log('Reinicie o servidor para aplicar (npm start).');
if (force) console.log('Atenção: inscrições push existentes podem precisar ser refeitas.');
