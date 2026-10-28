import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import request from 'supertest';

/**
 * Cria um banco temporário + app Express isolado para os testes.
 * As variáveis precisam ser definidas antes do import dinâmico da config.
 */
export async function createTestContext({ seed = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-test-'));
  process.env.NODE_ENV = 'test';
  process.env.TZ = 'America/Fortaleza';
  process.env.DB_PATH = path.join(dir, 'drift-test.db');
  process.env.UPLOAD_DIR = path.join(dir, 'uploads');
  process.env.BACKUP_DIR = path.join(dir, 'backups');
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.JWT_REFRESH_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.BCRYPT_ROUNDS = '4';
  process.env.BACKUP_HOUR = '3';
  process.env.BACKUP_RETENTION_DAYS = '7';

  const { openDb } = await import('../src/db.js');
  const { createApp } = await import('../src/app.js');
  const { seedDatabase } = await import('../src/seed.js');

  const db = openDb(process.env.DB_PATH);
  if (seed) {
    await seedDatabase(db, { log: { info() {}, error() {} } });
  }
  const app = createApp({ db });
  const agent = request.agent(app);

  async function login(username, password) {
    const res = await agent.post('/api/auth/login').send({ username, password });
    return res;
  }

  async function loginAdmin() {
    const first = await login('admin', 'admin123');
    if (first.status === 200 && first.body.mustChangePassword) {
      const changed = await agent
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${first.body.accessToken}`)
        .send({ senha_atual: 'admin123', senha_nova: 'adminSegura123' });
      if (changed.status !== 200) throw new Error(`Falha ao trocar senha: ${JSON.stringify(changed.body)}`);
      return { token: changed.body.accessToken, user: changed.body.user, agent };
    }
    if (first.status === 200) {
      return { token: first.body.accessToken, user: first.body.user, agent };
    }
    throw new Error(`Login admin falhou: ${first.status} ${JSON.stringify(first.body)}`);
  }

  async function createOperator(adminToken, username = 'operador1') {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nome: 'Operador de Teste',
        username,
        senha: 'operador123',
        role: 'operador',
      });
    return res;
  }

  async function loginOperator(username = 'operador1', password = 'operador123') {
    const res = await login(username, password);
    if (res.status === 200 && res.body.mustChangePassword) {
      const changed = await agent
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .send({ senha_atual: password, senha_nova: 'operadorNova123' });
      return { token: changed.body.accessToken, user: changed.body.user };
    }
    return { token: res.body.accessToken, user: res.body.user };
  }

  function close() {
    try {
      db.close();
    } catch {
      /* noop */
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }

  return { dir, db, app, agent, login, loginAdmin, createOperator, loginOperator, close };
}

export function auth(token) {
  return { Authorization: `Bearer ${token}` };
}
