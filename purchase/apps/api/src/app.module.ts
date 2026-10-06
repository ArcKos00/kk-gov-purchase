import fs from 'node:fs';
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { config } from './config';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { FilesModule } from './files/files.module';
import { ContractsModule } from './contracts/contracts.module';
import { DeliveriesModule } from './deliveries/deliveries.module';
import { SearchModule } from './search/search.module';
import { AnalyticsModule } from './analytics/analytics.module';

// Якщо фронт зібрано (apps/web/dist) — роздаємо його тим самим сервером.
const staticFront = fs.existsSync(config.webDist)
  ? [ServeStaticModule.forRoot({ rootPath: config.webDist, exclude: ['/api/{*path}'] })]
  : [];

/**
 * Модулі: інфраструктура (БД, журнал, автентифікація, health) і предметні розділи.
 * Новий розділ — окремий модуль зі своїми controller/service/dto, підключений тут.
 */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    AuthModule,
    HealthModule,
    UsersModule,
    FilesModule,
    ContractsModule,
    DeliveriesModule,
    SearchModule,
    AnalyticsModule,
    ...staticFront,
  ],
})
export class AppModule {}
