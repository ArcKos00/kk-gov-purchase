import { INestApplication, RequestMethod } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import session from 'express-session';
import { Logger } from 'nestjs-pino';
import { config } from './config';
import { validationPipe } from './common/validation';
import { PgSessionStore } from './auth/pg-session.store';
import { serveWeb } from './web';
import { serveOpenApi } from './openapi';
import { securityEventsGate, securityHeaders } from './security/security';
import { apiDocsCors } from './security/api-docs-cors';
import { originCheck } from './security/origin-check';

/** Спільне налаштування для main.ts і тестів. */
export function setupApp(app: INestApplication) {
  app.useLogger(app.get(Logger));
  // Заголовки безпекового шаблону К-2 (@k2/security) — першими, на всі відповіді, статику фронту теж.
  app.use(securityHeaders);
  // CORS для «Документації API» (API_DOCS_ORIGIN, лише /api/*, /auth/me, /auth/logout) — до статики й сесії:
  // preflight відповідає одразу, без сесії.
  app.use(apiDocsCors);
  // CSRF: запис на /api/* і /auth/* — лише з Origin цього сервісу (PUBLIC_URL) чи документації API (лише /api/*);
  // після CORS — щоб «Документація API» прочитала 403, до сесії й парсерів тіла — чужий запит далі не йде.
  app.use(originCheck);
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
  // Опис API (GET /api/openapi.json) — без входу і до сесії; решта /api/* — як і раніше під AuthGuard.
  serveOpenApi(app);

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
