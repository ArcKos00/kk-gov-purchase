import { INestApplication, RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import session from 'express-session';
import { Logger } from 'nestjs-pino';
import { config } from './config';
import { validationPipe } from './common/validation';
import { PgSessionStore } from './auth/pg-session.store';
import { serveWeb } from './web';
import { securityEventsGate, securityHeaders } from './security/security';

/** Спільне налаштування для main.ts і тестів. */
export function setupApp(app: INestApplication) {
  app.useLogger(app.get(Logger));
  // Заголовки безпекового шаблону К-2 (@k2/security) — першими, на всі відповіді, статику фронту теж.
  app.use(securityHeaders);
  // За ingress: req.ip — адреса клієнта з X-Forwarded-For, req.secure — з X-Forwarded-Proto (лише від довірених проксі).
  (app as NestExpressApplication).set('trust proxy', config.trustProxy);
  // /auth/* і /k2-security/* (безпековий шаблон К-2, security/) — без префікса /api.
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'auth/{*path}', method: RequestMethod.ALL },
      { path: 'k2-security/{*path}', method: RequestMethod.ALL },
    ],
  });
  app.useGlobalPipes(validationPipe);
  // Фронт (якщо зібрано) і заголовки кешу — до сесії: статиці сесія не потрібна.
  serveWeb(app as NestExpressApplication);

  if (!config.authDisabled) {
    app.use(
      session({
        name: 'sid',
        store: app.get(PgSessionStore),
        secret: config.sessionSecret,
        resave: false,
        saveUninitialized: false,
        rolling: false,
        // Кука живе рівно стільки, скільки дозволено одному входу, і не подовжується.
        cookie: {
          httpOnly: true,
          sameSite: 'lax',
          secure: config.publicUrl.startsWith('https://'),
          maxAge: config.sessionMaxHours * 3_600_000,
        },
      }),
    );
  }
  // POST /k2-security/events: 403 / 401 / 413 (> 64 КБ) / 400 — після сесії, до парсерів тіла Nest.
  app.use('/k2-security/events', securityEventsGate);
}
