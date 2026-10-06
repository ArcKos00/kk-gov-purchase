import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { config } from '../config';
import { AuditContextSubscriber } from '../audit/audit-context.subscriber';
import { entities } from './entities';
import { Init1759650000000 } from './migrations/1759650000000-Init';
import { ItemPrice1759700000000 } from './migrations/1759700000000-ItemPrice';
import { Search1759700100000 } from './migrations/1759700100000-Search';
import { Auth1759700200000 } from './migrations/1759700200000-Auth';
import { Audit1759700300000 } from './migrations/1759700300000-Audit';

/** Нову міграцію додайте в цей перелік (порядок = порядок застосування). */
export const migrations = [
  Init1759650000000,
  ItemPrice1759700000000,
  Search1759700100000,
  Auth1759700200000,
  Audit1759700300000,
];

@Global()
@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: config.databaseUrl,
      entities,
      migrations,
      subscribers: [AuditContextSubscriber],
      migrationsRun: true,
      synchronize: false,
      namingStrategy: new SnakeNamingStrategy(),
    }),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
