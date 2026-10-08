/**
 * OpenTelemetry: трейси, метрики і логи через OTLP (Elastic APM / OTel Collector).
 *
 * Імпортується ПЕРШИМ у main.ts — інструментації мають пропатчити http/express/pg/pino
 * до того, як їх завантажить застосунок.
 *
 * Уся конфігурація — стандартними змінними OTEL_* (див. README), наприклад:
 *   OTEL_EXPORTER_OTLP_ENDPOINT=https://apm.example:8200
 *   OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer <secret token>
 * Без OTEL_EXPORTER_OTLP_ENDPOINT (або з OTEL_SDK_DISABLED=true) SDK не стартує.
 */
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';
import type { Attributes } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { RuntimeNodeInstrumentation } from '@opentelemetry/instrumentation-runtime-node';

const env = process.env;
const enabled =
  env.OTEL_SDK_DISABLED !== 'true' &&
  !!(env.OTEL_EXPORTER_OTLP_ENDPOINT || env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT);

// Пробам і статиці фронту спани не потрібні — лише шум в APM.
const ignoredPath = (url = '') => url.startsWith('/api/health') || !url.startsWith('/api/');

// Усі заголовки HTTP — атрибутами спану (http.request.header.*), як ELASTIC_APM_CAPTURE_HEADERS в
// інших сервісах. Сесійна cookie та авторизація маскуються. OTEL_CAPTURE_HEADERS=false — вимкнути.
const captureHeaders = env.OTEL_CAPTURE_HEADERS !== 'false';
const SECRET_HEADERS = new Set(['cookie', 'set-cookie', 'authorization', 'proxy-authorization']);

function headerAttributes(prefix: string, headers: IncomingHttpHeaders | OutgoingHttpHeaders): Attributes {
  const attrs: Attributes = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const key = name.toLowerCase();
    attrs[`${prefix}.${key}`] = SECRET_HEADERS.has(key)
      ? '***'
      : Array.isArray(value) ? value.map(String) : String(value);
  }
  return attrs;
}

let sdk: NodeSDK | undefined;

if (enabled) {
  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: env.OTEL_SERVICE_NAME ?? 'purchase',
      [ATTR_SERVICE_VERSION]: env.APP_VERSION ?? 'dev',
      'deployment.environment.name': env.APP_ENV ?? env.NODE_ENV ?? 'development',
    }),
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => ignoredPath(req.url),
        ...(captureHeaders && {
          requestHook: (span, req) => {
            const headers = 'getHeaders' in req ? req.getHeaders() : req.headers;
            span.setAttributes(headerAttributes('http.request.header', headers));
          },
          responseHook: (span, res) => {
            // Для вхідних запитів хук викликається на старті, коли заголовків відповіді ще немає.
            if ('getHeaders' in res)
              res.once('finish', () => span.setAttributes(headerAttributes('http.response.header', res.getHeaders())));
            else span.setAttributes(headerAttributes('http.response.header', res.headers));
          },
        }),
      }),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
      new PgInstrumentation({ enhancedDatabaseReporting: false }),
      // trace_id/span_id у кожному рядку логу + відправка логів в OTLP (OTEL_LOGS_EXPORTER).
      new PinoInstrumentation(),
      new RuntimeNodeInstrumentation(),
    ],
  });
  sdk.start();
}

/** Дописати буфери експортерів перед виходом (викликається з onApplicationShutdown). */
export async function shutdownTelemetry() {
  await sdk?.shutdown().catch(() => undefined);
}
