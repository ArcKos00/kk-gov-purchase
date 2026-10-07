import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadOptions } from '../common/multipart';
import { Audit } from '../audit/audit.decorator';
import { ContractsService } from './contracts.service';
import { ContractDto, SearchDto, ShortfallDto } from './dto';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @Audit('contract.search')
  search(@Query() query: SearchDto) {
    return this.contracts.search(query);
  }

  @Get('counterparties')
  @Audit('contract.counterparties')
  counterparties() {
    return this.contracts.counterparties();
  }

  @Get(':id')
  @Audit('contract.view')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.contracts.get(id);
  }

  @Post()
  @Audit('contract.create')
  create(@Body() dto: ContractDto) {
    return this.contracts.create(dto);
  }

  @Put(':id')
  @Audit('contract.update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: ContractDto) {
    return this.contracts.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Audit('contract.delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.contracts.remove(id);
  }

  @Put(':id/file')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  @Audit('contract.file.upload')
  setFile(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: Express.Multer.File) {
    return this.contracts.setFile(id, file);
  }

  @Delete(':id/file')
  @Audit('contract.file.remove')
  removeFile(@Param('id', ParseIntPipe) id: number) {
    return this.contracts.removeFile(id);
  }

  /** Недопоставка ("не зможуть") та орієнтовна дата поставки */
  @Put(':id/shortfall')
  @Audit('contract.shortfall.update')
  updateShortfall(@Param('id', ParseIntPipe) id: number, @Body() dto: ShortfallDto) {
    return this.contracts.updateShortfall(id, dto);
  }
}
