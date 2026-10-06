import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { currentContext } from '../common/request-context';

const CONTRACT_PARAM = 'audit:contract-param';

/**
 * Параметр маршруту, що містить id договору (за замовчуванням `id`). Зміни, які самі
 * договору не знають (наприклад, новий файл), журнал прив'язує до цього договору.
 */
export const ContractScope = (param = 'id') => SetMetadata(CONTRACT_PARAM, param);

@Injectable()
export class AuditScopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const param = this.reflector.getAllAndOverride<string | undefined>(CONTRACT_PARAM, [
      context.getHandler(),
      context.getClass(),
    ]);
    const ctx = currentContext();
    if (param && ctx) {
      const id = Number(context.switchToHttp().getRequest<Request>().params[param]);
      if (Number.isInteger(id) && id > 0) ctx.contractId = id;
    }
    return next.handle();
  }
}
