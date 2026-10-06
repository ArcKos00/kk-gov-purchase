import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

@Module({
  imports: [FilesModule],
  controllers: [ContractsController],
  providers: [ContractsService],
})
export class ContractsModule {}
