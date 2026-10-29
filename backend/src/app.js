import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { ZodError } from 'zod';
import multer from 'multer';
import { config } from './config.js';
import { requireAuth, requireSuperadmin, requireTenant } from './middleware/auth.js';
import { HttpError } from './utils/errors.js';
import { createAuthRouter } from './routes/auth.js';
import { createPublicRouter } from './routes/public.js';
import { createSuperadminRouter } from './routes/superadmin.js';
import { createUsersRouter } from './routes/users.js';
import { createCartsRouter } from './routes/carts.js';
import { createPlansRouter } from './routes/plans.js';
import { createCategoriesRouter } from './routes/categories.js';
import { createScanRouter } from './routes/scan.js';
import { createQrcodesRouter } from './routes/qrcodes.js';
import { createSessionsRouter } from './routes/sessions.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createReportsRouter } from './routes/reports.js';
import { createCashRouter } from './routes/cash.js';
import { createSettingsRouter } from './routes/settings.js';

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  if (config.isProduction) {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' ws: wss:",
        "media-src 'self' blob:",
        "worker-src 'self'",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    );
  }
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
}

export function createApp({ db }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy ? 1 : false);

  app.use(securityHeaders);
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());

  if (!config.isTest) {
    app.use((req, res, next) => {
      if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) return next();
      const started = Date.now();
      res.on('finish', () => {
        const ms = Date.now() - started;
        if (res.statusCode >= 400 || req.method !== 'GET') {
          console.info(
            `${new Date().toISOString()} ${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${ms}ms`,
          );
        }
      });
      next();
    });
  }

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      nome: 'Drift Rent',
      versao: config.version,
      horarioServidor: new Date().toISOString(),
      uptimeSegundos: Math.round(process.uptime()),
    });
  });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5000,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        erro: {
          codigo: 'muitas_requisicoes',
          mensagem: 'Muitas requisições. Aguarde alguns instantes.',
        },
      }),
  });
  app.use('/api', apiLimiter);

  // Certificado público da CA local (para instalar no celular e liberar o PWA em HTTPS).
  app.get('/local-ca.crt', (_req, res, next) => {
    if (!fs.existsSync(config.caCertPath)) {
      return res.status(404).type('text/plain').send('Certificado local não gerado.');
    }
    res.download(config.caCertPath, 'drift-rent-ca.crt');
  });

  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/public', createPublicRouter(db));

  // A partir daqui, todas as rotas exigem JWT válido.
  app.use('/api', requireAuth(db));
  // Superadmin só acessa o painel de negócios.
  app.use('/api/superadmin', requireSuperadmin, createSuperadminRouter(db));
  // Qualquer outra rota /api é operacional e exige um tenant ativo.
  app.use('/api', requireTenant);
  app.use('/api/dashboard', createDashboardRouter(db));
  app.use('/api/users', createUsersRouter(db));
  app.use('/api/carts', createCartsRouter(db));
  app.use('/api/plans', createPlansRouter(db));
  app.use('/api/categories', createCategoriesRouter(db));
  app.use('/api/scan', createScanRouter(db));
  app.use('/api/qrcodes', createQrcodesRouter(db));
  app.use('/api/sessions', createSessionsRouter(db));
  app.use('/api/reports', createReportsRouter(db));
  app.use('/api/cash', createCashRouter(db));
  app.use('/api/settings', createSettingsRouter(db));

  app.use('/api', (_req, res) => {
    res.status(404).json({ erro: { codigo: 'rota_nao_encontrada', mensagem: 'Rota não encontrada.' } });
  });

  app.use(
    '/uploads',
    express.static(config.uploadDir, {
      maxAge: '30d',
      fallthrough: false,
      setHeaders(res) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'inline');
      },
    }),
  );

  if (fs.existsSync(path.join(config.frontendDist, 'index.html'))) {
    app.use(
      express.static(config.frontendDist, {
        index: false,
        maxAge: '1h',
        setHeaders(res, filePath) {
          if (
            filePath.endsWith('sw.js') ||
            filePath.endsWith('registerSW.js') ||
            filePath.endsWith('.webmanifest')
          ) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );

    app.get(/^\/(?!api\/|uploads\/|socket\.io\/).*/, (req, res, next) => {
      if (!req.accepts('html')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(config.frontendDist, 'index.html'));
    });
  }

  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      return res
        .status(404)
        .json({ erro: { codigo: 'rota_nao_encontrada', mensagem: 'Rota não encontrada.' } });
    }
    res.status(404).type('text/plain').send('Não encontrado');
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof ZodError) {
      const issue = err.issues[0];
      return res.status(400).json({
        erro: {
          codigo: 'dados_invalidos',
          mensagem: issue?.message || 'Dados inválidos.',
          campo: issue?.path?.join('.') || null,
        },
      });
    }
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `A imagem deve ter no máximo ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB.`
          : 'Falha no upload da imagem.';
      return res.status(400).json({ erro: { codigo: 'upload_invalido', mensagem: message } });
    }
    if (err instanceof HttpError) {
      return res
        .status(err.status)
        .json({ erro: { codigo: err.code, mensagem: err.message } });
    }
    if (err?.type === 'entity.parse.failed') {
      return res
        .status(400)
        .json({ erro: { codigo: 'json_invalido', mensagem: 'Corpo da requisição inválido.' } });
    }
    if (err?.code?.startsWith?.('SQLITE_CONSTRAINT')) {
      const isActiveSession = String(err.message).includes('idx_sessions_uma_ativa_por_carrinho');
      return res.status(409).json({
        erro: {
          codigo: isActiveSession ? 'carrinho_em_uso' : 'conflito',
          mensagem: isActiveSession
            ? 'Este carrinho já possui uma sessão ativa.'
            : 'Não foi possível salvar: registro duplicado ou em uso.',
        },
      });
    }
    if (err?.status && err?.status < 500) {
      return res
        .status(err.status)
        .json({ erro: { codigo: 'erro', mensagem: err.message || 'Requisição inválida.' } });
    }
    console.error('[erro]', err);
    res.status(500).json({
      erro: { codigo: 'erro_interno', mensagem: 'Erro interno no servidor. Tente novamente.' },
    });
  });

  return app;
}
