import { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { validationPipe } from './common/validation';
import { requestContextMiddleware } from './common/request-context';

/** Спільне налаштування для main.ts і тестів. */
export function setupApp(app: INestApplication) {
  const express = app as NestExpressApplication;
  // За YARP → haproxy: реальна IP клієнта — з X-Forwarded-For (див. TRUST_PROXY).
  express.set('trust proxy', config.trustProxy);
  express.disable('x-powered-by');
  app.use(cookieParser());
  app.use(requestContextMiddleware);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(validationPipe);
}
