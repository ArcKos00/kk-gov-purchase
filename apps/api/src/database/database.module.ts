import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { config } from '../config';
import { entities } from './entities';
import { Init1759650000000 } from './migrations/1759650000000-Init';
import { AuditLog1759900000000 } from './migrations/1759900000000-AuditLog';
import { typeOrmLogging } from '../logging/typeorm-logger';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: config.databaseUrl,
      entities,
      migrations: [Init1759650000000, AuditLog1759900000000],
      migrationsRun: true,
      synchronize: false,
      namingStrategy: new SnakeNamingStrategy(),
      ...typeOrmLogging,
    }),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
