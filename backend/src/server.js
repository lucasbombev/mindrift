import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { Server as SocketServer } from 'socket.io';
import { config, assertRuntimeDirs } from './config.js';
import { openDb, getSetting } from './db.js';
import { createApp } from './app.js';
import { seedDatabase } from './seed.js';
import { authenticateToken } from './middleware/auth.js';
import { getDashboard } from './services/dashboard.js';
import { getLanUrls } from './services/system.js';
import {
  startBackupScheduler,
  startupBackupIfNeeded,
  stopBackupScheduler,
} from './services/backup.js';

assertRuntimeDirs();
const db = openDb(config.dbPath);
const seeded = await seedDatabase(db);

const app = createApp({ db });
const httpServer = http.createServer(app);

let httpsServer = null;
const certPath = config.certPath;
const keyPath = config.keyPath;
if (process.env.HTTPS !== '0' && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  try {
    httpsServer = https.createServer(
      { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
      app,
    );
  } catch (err) {
    console.error('[https] Não foi possível iniciar HTTPS:', err.message);
  }
}

const io = new SocketServer({
  cors: { origin: true, credentials: true },
  pingInterval: 15_000,
  pingTimeout: 12_000,
});
io.attach(httpServer);
if (httpsServer) io.attach(httpsServer);

app.locals.io = io;
app.locals.broadcast = () => {
  io.emit('dashboard', getDashboard(db));
};

io.use((socket, next) => {
  try {
    const header = socket.handshake.headers.authorization || '';
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      (header.startsWith('Bearer ') ? header.slice(7) : null);
    if (!token) {
      const err = new Error('Token ausente');
      err.data = { codigo: 'nao_autenticado' };
      return next(err);
    }
    const user = authenticateToken(db, token);
    if (user.mustChangePassword) {
      const err = new Error('Troca de senha pendente');
      err.data = { codigo: 'senha_troca_obrigatoria' };
      return next(err);
    }
    socket.data.user = user;
    next();
  } catch (err) {
    const error = new Error('Não autorizado');
    error.data = { codigo: err.code || 'nao_autenticado', mensagem: err.message };
    next(error);
  }
});

io.on('connection', (socket) => {
  socket.join('operadores');
  socket.emit('dashboard', getDashboard(db));
  socket.emit('hello', {
    serverNow: Date.now(),
    usuario: socket.data.user?.nome,
  });
});

const tick = setInterval(() => {
  io.emit('tick', { now: Date.now() });
}, 1000);

const notified = new Set();
const expireCheck = setInterval(() => {
  const now = Date.now();
  const leadSeconds = Number(getSetting(db, 'alert_lead_seconds', '60')) || 0;
  let active = [];
  try {
    active = db
      .prepare(
        `SELECT s.id, s.fim_previsto_em, s.cliente_nome, c.codigo AS cart_codigo
         FROM sessions s JOIN carts c ON c.id = s.cart_id
         WHERE s.status = 'em_andamento' AND s.excluida_em IS NULL`,
      )
      .all();
  } catch (err) {
    console.error('[timer] falha ao consultar sessões:', err.message);
    return;
  }
  const validKeys = new Set();
  for (const session of active) {
    const endsAt = new Date(session.fim_previsto_em).getTime();
    const endKey = `fim:${session.id}:${session.fim_previsto_em}`;
    const leadKey = `aviso:${session.id}:${session.fim_previsto_em}`;
    validKeys.add(endKey);
    validKeys.add(leadKey);
    const remaining = endsAt - now;
    if (remaining <= 0 && !notified.has(endKey)) {
      notified.add(endKey);
      io.emit('session:expired', {
        id: session.id,
        clienteNome: session.cliente_nome,
        cartCodigo: session.cart_codigo,
        fimPrevistoEm: session.fim_previsto_em,
        serverNow: now,
      });
    } else if (remaining > 0 && remaining <= leadSeconds * 1000 && !notified.has(leadKey)) {
      notified.add(leadKey);
      io.emit('session:expiring', {
        id: session.id,
        clienteNome: session.cliente_nome,
        cartCodigo: session.cart_codigo,
        fimPrevistoEm: session.fim_previsto_em,
        restanteSegundos: Math.ceil(remaining / 1000),
        serverNow: now,
      });
    }
  }
  if (notified.size > 4000) {
    for (const key of notified) if (!validKeys.has(key)) notified.delete(key);
  }
}, 1000);

startBackupScheduler(db, console);
await startupBackupIfNeeded(db, console);

function shutdown(signal) {
  console.log(`\n[servidor] encerrando (${signal})...`);
  clearInterval(tick);
  clearInterval(expireCheck);
  stopBackupScheduler();
  io.close();
  httpServer.close();
  if (httpsServer) httpsServer.close();
  setTimeout(() => {
    try {
      db.close();
    } catch {
      /* noop */
    }
    process.exit(0);
  }, 300).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

const port = config.port;
httpServer.listen(port, config.host, () => {
  const urls = getLanUrls(port);
  console.log('');
  console.log('  🏁 Drift Rent — servidor no ar');
  console.log(`  Local:   http://localhost:${port}`);
  for (const url of urls) console.log(`  Rede:    ${url}`);
  if (urls.length === 0) {
    console.log('  Rede:    (nenhum IP de LAN detectado)');
  }
  console.log(`  Fuso:    ${config.tz}`);
  console.log(`  Banco:   ${config.dbPath}`);
  console.log(`  Backup:  ${config.backupDir}`);
  if (seeded.created) {
    console.log('');
    console.log('  Primeiro acesso: admin / admin123');
    console.log('  A troca de senha será exigida no login.');
  }
  console.log('');
});

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n[erro] A porta ${port} já está em uso. Feche o outro processo ou altere PORT no backend/.env.\n`,
    );
  } else {
    console.error('[erro] Servidor HTTP:', err);
  }
  process.exit(1);
});

if (httpsServer) {
  const httpsPort = config.httpsPort;
  httpsServer.listen(httpsPort, config.host, () => {
    const httpsUrls = getLanUrls(httpsPort).map((url) => url.replace('http://', 'https://'));
    if (httpsUrls.length === 0) httpsUrls.push(`https://localhost:${httpsPort}`);
    for (const url of httpsUrls) console.log(`  HTTPS:   ${url} (PWA)`);
    console.log(
      '  Dica:    para instalar o PWA no celular sem aviso, confie no certificado local conforme o README.',
    );
    console.log('');
  });
  httpsServer.on('error', (err) => {
    console.error('[erro] Servidor HTTPS:', err.message);
  });
}
