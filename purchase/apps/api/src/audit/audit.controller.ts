import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { IsOptional, Matches } from 'class-validator';
import type { AuditQuery } from '@kk-gov-purchase/shared';
import { Roles } from '../auth/decorators';
import { DATE } from '../contracts/dto';
import { AuditService } from './audit.service';

const ACTIONS = /^(login|login_failed|logout|insert|update|delete)(,(login|login_failed|logout|insert|update|delete))*$/;
const ENTITIES = /^(contracts|order_items|deliveries|delivery_lines|files|users)(,(contracts|order_items|deliveries|delivery_lines|files|users))*$/;

export class AuditQueryDto implements AuditQuery {
  @IsOptional() @Matches(/^\d{1,9}$/) userId?: string;
  @IsOptional() @Matches(ACTIONS) action?: string;
  @IsOptional() @Matches(ENTITIES) entity?: string;
  @IsOptional() @Matches(/^\d{1,9}$/) contractId?: string;
  @IsOptional() @Matches(DATE) from?: string;
  @IsOptional() @Matches(DATE) to?: string;
  @IsOptional() @Matches(/^\d{1,6}$/) page?: string;
  @IsOptional() @Matches(/^\d{1,4}$/) pageSize?: string;
}

@Controller()
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** Повний журнал — лише адміністратор. */
  @Get('audit')
  @Roles('admin')
  list(@Query() q: AuditQueryDto) {
    return this.audit.list(q);
  }

  /** Історія змін конкретного договору — усім, хто може його бачити. */
  @Get('contracts/:id/history')
  history(@Param('id', ParseIntPipe) id: number) {
    return this.audit.contractHistory(id);
  }
}
