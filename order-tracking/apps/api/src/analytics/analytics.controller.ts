import { Controller, Get, Query } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import type { AnalyticsQuery, Granularity } from '@order-tracking/shared';
import { ContractFilterDto } from '../contracts/dto';
import { AnalyticsService } from './analytics.service';

export class AnalyticsQueryDto extends ContractFilterDto implements AnalyticsQuery {
  @IsOptional() @IsIn(['month', 'quarter', 'year']) granularity?: Granularity;
}

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Уся панель аналітики за фільтром (той самий, що в списку договорів). */
  @Get()
  dashboard(@Query() q: AnalyticsQueryDto) {
    return this.analytics.dashboard(q);
  }
}
