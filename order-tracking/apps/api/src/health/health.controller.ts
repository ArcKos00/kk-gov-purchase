import { Controller, Get, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import type { Health } from '@order-tracking/shared';
import { Public } from '../auth/decorators';

/** Перевірка для k8s-проб: без автентифікації, з легким запитом у БД. 503 — БД недоступна. */
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Public()
  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<Health> {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await this.ds.query('SELECT 1');
      return { status: 'ok', db: 'ok' };
    } catch {
      res.status(503);
      return { status: 'error', db: 'error' };
    }
  }
}
