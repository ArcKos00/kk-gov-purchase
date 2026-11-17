import { Module } from '@nestjs/common';
import { SecurityController } from './security.controller';

/** Безпековий шаблон К-2 (`@k2/security`): `GET /k2-security/policy`, `POST /k2-security/events`. */
@Module({ controllers: [SecurityController] })
export class SecurityModule {}
