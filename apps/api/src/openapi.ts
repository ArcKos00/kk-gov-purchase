import fs from 'node:fs';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

/** Адреса опису API — під тим самим префіксом /api, що й саме API (стягує сервіс «Документація API»). */
export const OPENAPI_PATH = '/api/openapi.json';

/** Версія API — з apps/api/package.json (і в src/, і в dist/ він на рівень вище). */
const version = (JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')) as { version: string }).version;

/** Опис OpenAPI 3.x з контролерів і DTO (декоратори @nestjs/swagger). Шляхи — з префіксом /api. */
export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const cfg = new DocumentBuilder()
    .setTitle('Облік замовлень (purchase)')
    .setDescription(
      'API обліку замовлень за договорами: договори, найменування, поставки, нерозподілені найменування, файли, журнал дій. ' +
        'Перегляд (GET зі списками й картками) — без входу, якщо дозволено анонімний перегляд; зміни — лише після входу ' +
        '(кука `sid` після входу через Keycloak, `/auth/login`); журнал — лише адміністратору.',
    )
    .setVersion(version)
    // Відносна адреса: «Try it out» іде на той самий хост, з якого відкрито опис.
    .addServer('/')
    .addCookieAuth('sid', { type: 'apiKey', in: 'cookie', name: 'sid', description: 'Сесія після входу через Keycloak' })
    .build();
  return SwaggerModule.createDocument(app, cfg, {
    operationIdFactory: (controller, method) => `${controller.replace(/Controller$/, '')}_${method}`,
  });
}

/**
 * GET /api/openapi.json — лише сам опис (схема), без входу: маршрут Express, повз глобальний AuthGuard і до сесії.
 * Swagger UI не підключено. Опис будується на першому запиті (усі модулі вже ініціалізовані) і кешується.
 */
export function serveOpenApi(app: INestApplication) {
  let doc: OpenAPIObject | null = null;
  app.getHttpAdapter().get(OPENAPI_PATH, (_req: Request, res: Response) => {
    doc ??= buildOpenApi(app);
    res.setHeader('Cache-Control', 'no-store');
    res.json(doc);
  });
}
