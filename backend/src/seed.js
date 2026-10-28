import { openDb, setSetting } from './db.js';
import { config } from './config.js';
import { hashPassword } from './services/auth.js';
import { nowIso } from './utils/time.js';

const CARTS = [
  { codigo: 'C01', status: 'disponivel' },
  { codigo: 'C02', status: 'disponivel' },
  { codigo: 'C03', status: 'carregando' },
  { codigo: 'C04', status: 'manutencao' },
];

const PLANS = [
  { nome: '5 min', minutos: 5, valor_centavos: 500 },
  { nome: '10 min', minutos: 10, valor_centavos: 800 },
  { nome: '15 min', minutos: 15, valor_centavos: 1000 },
];

export async function seedDatabase(db, { log = console } = {}) {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (existing > 0) {
    return { created: false, reason: 'Banco já possui usuários.' };
  }

  const now = nowIso();
  const senhaHash = await hashPassword('admin123');

  const run = db.transaction(() => {
    const admin = db
      .prepare(
        `INSERT INTO users (nome, username, email, senha_hash, role, ativo, must_change_password,
           token_version, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, 'admin', 1, 1, 1, ?, ?)`,
      )
      .run('Administrador', 'admin', null, senhaHash, now, now);

    const insertCart = db.prepare(
      `INSERT INTO carts (codigo, foto_url, status, observacao, criado_em, atualizado_em)
       VALUES (?, NULL, ?, NULL, ?, ?)`,
    );
    for (const cart of CARTS) insertCart.run(cart.codigo, cart.status, now, now);

    const insertPlan = db.prepare(
      `INSERT INTO pricing_plans (nome, minutos, valor_centavos, ativo, criado_em, atualizado_em)
       VALUES (?, ?, ?, 1, ?, ?)`,
    );
    for (const plan of PLANS) insertPlan.run(plan.nome, plan.minutos, plan.valor_centavos, now, now);

    setSetting(db, 'nome_estabelecimento', 'Drift Rent');
    setSetting(db, 'alert_lead_seconds', '60');

    return { adminId: Number(admin.lastInsertRowid) };
  });

  const result = run();
  log.info?.('[seed] Dados iniciais criados.');
  log.info?.('[seed] Login: admin / admin123 (troca de senha obrigatória no primeiro acesso).');
  return {
    created: true,
    adminId: result.adminId,
    credentials: { username: 'admin', password: 'admin123' },
    carts: CARTS.length,
    plans: PLANS.length,
  };
}

// Execução direta: npm run seed
const isMain = process.argv[1] && process.argv[1].endsWith('seed.js');
if (isMain) {
  const db = openDb(config.dbPath);
  seedDatabase(db)
    .then((result) => {
      if (!result.created) {
        console.log(`[seed] Nada a fazer: ${result.reason}`);
      }
      db.close();
    })
    .catch((err) => {
      console.error('[seed] Erro:', err);
      process.exitCode = 1;
      db.close();
    });
}
