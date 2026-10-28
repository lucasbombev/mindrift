import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config, assertRuntimeDirs } from './config.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  username TEXT NOT NULL COLLATE NOCASE,
  email TEXT,
  senha_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'operador')),
  ativo INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  token_version INTEGER NOT NULL DEFAULT 1,
  ultimo_login_em TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS carts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL COLLATE NOCASE,
  foto_url TEXT,
  status TEXT NOT NULL DEFAULT 'disponivel'
    CHECK (status IN ('disponivel', 'em_uso', 'carregando', 'manutencao')),
  observacao TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  excluido_em TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_codigo_ativo
  ON carts(codigo COLLATE NOCASE) WHERE excluido_em IS NULL;

CREATE TABLE IF NOT EXISTS pricing_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  minutos INTEGER NOT NULL CHECK (minutos > 0),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_id INTEGER NOT NULL REFERENCES carts(id),
  cliente_nome TEXT NOT NULL,
  plano_id INTEGER REFERENCES pricing_plans(id) ON DELETE SET NULL,
  plano_nome TEXT NOT NULL,
  minutos_contratados INTEGER NOT NULL CHECK (minutos_contratados > 0),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
  iniciado_em TEXT NOT NULL,
  fim_previsto_em TEXT NOT NULL,
  encerrado_em TEXT,
  duracao_segundos INTEGER,
  status TEXT NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento', 'encerrada', 'cancelada')),
  pago INTEGER NOT NULL DEFAULT 0,
  forma_pagamento TEXT CHECK (forma_pagamento IN ('dinheiro', 'pix', 'cartao')),
  pagamento_adiantado INTEGER NOT NULL DEFAULT 0,
  valor_adiantado_centavos INTEGER NOT NULL DEFAULT 0,
  forma_adiantado TEXT,
  adiantado_em TEXT,
  operador_id INTEGER NOT NULL REFERENCES users(id),
  observacao TEXT,
  motivo_cancelamento TEXT,
  pago_em TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  excluida_em TEXT,
  excluida_por INTEGER REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_uma_ativa_por_carrinho
  ON sessions(cart_id) WHERE status = 'em_andamento' AND excluida_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status, iniciado_em);
CREATE INDEX IF NOT EXISTS idx_sessions_cart ON sessions(cart_id);
CREATE INDEX IF NOT EXISTS idx_sessions_cliente ON sessions(cliente_nome COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_sessions_pago_em ON sessions(pago_em);

CREATE TABLE IF NOT EXISTS session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'inicio', 'renovacao', 'encerramento', 'cancelamento',
    'pagamento', 'edicao_valor', 'exclusao'
  )),
  payload_json TEXT,
  usuario_id INTEGER REFERENCES users(id),
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events(session_id, criado_em);

CREATE TABLE IF NOT EXISTS settings (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_closures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL UNIQUE,
  total_centavos INTEGER NOT NULL,
  total_pendente_centavos INTEGER NOT NULL,
  qtd_sessoes INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES users(id),
  criado_em TEXT NOT NULL
);
`;

const DEFAULT_SETTINGS = {
  alert_lead_seconds: '60',
  nome_estabelecimento: 'Drift Rent',
  backup_hour: '3',
  backup_retention_days: '30',
};

export function openDb(filePath = config.dbPath) {
  if (filePath !== ':memory:') {
    assertRuntimeDirs();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  migrate(db);
  const now = new Date().toISOString();
  const insert = db.prepare(
    'INSERT OR IGNORE INTO settings (chave, valor, atualizado_em) VALUES (?, ?, ?)',
  );
  for (const [chave, valor] of Object.entries(DEFAULT_SETTINGS)) insert.run(chave, valor, now);
  db.pragma('user_version = 2');
  return db;
}

/** Migrações incrementais para bancos que já estavam em uso. */
function migrate(db) {
  const columns = new Set(
    db.prepare('PRAGMA table_info(sessions)').all().map((column) => column.name),
  );
  const addColumn = (name, definition) => {
    if (!columns.has(name)) db.exec(`ALTER TABLE sessions ADD COLUMN ${name} ${definition}`);
  };
  addColumn('pagamento_adiantado', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('valor_adiantado_centavos', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('forma_adiantado', 'TEXT');
  addColumn('adiantado_em', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_adiantado_em ON sessions(adiantado_em)');
}

export function getSetting(db, chave, fallback = null) {
  const row = db.prepare('SELECT valor FROM settings WHERE chave = ?').get(chave);
  return row ? row.valor : fallback;
}

export function setSetting(db, chave, valor) {
  db.prepare(
    `INSERT INTO settings (chave, valor, atualizado_em) VALUES (?, ?, ?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado_em = excluded.atualizado_em`,
  ).run(chave, String(valor), new Date().toISOString());
}

export function getSettings(db) {
  const rows = db.prepare('SELECT chave, valor FROM settings').all();
  return Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
}
