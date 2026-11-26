import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadOptions } from '../common/multipart';
import { Viewable } from '../auth/auth.guard';
import { AuditContext, Ctx } from '../audit/audit-context';
import { ContractsService } from './contracts.service';
import { ContractDto, DraftDto, SearchDto, ShortfallDto, StageDto } from './dto';

@ApiTags('Договори')
@ApiCookieAuth('sid')
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @ApiOperation({ summary: 'Пошук договорів', description: 'Сторінками; без входу — якщо дозволено анонімний перегляд.' })
  @Get()
  @Viewable()
  search(@Query() query: SearchDto) {
    return this.contracts.search(query);
  }

  @ApiOperation({ summary: 'Перелік контрагентів', description: 'Для підказок у полі «Контрагент».' })
  @Get('counterparties')
  @Viewable()
  counterparties() {
    return this.contracts.counterparties();
  }

  @ApiOperation({ summary: 'Картка договору', description: 'З найменуваннями, поставками й файлом.' })
  @ApiParam({ name: 'id', description: 'Ідентифікатор договору' })
  @Get(':id')
  @Viewable()
  get(@Param('id', ParseIntPipe) id: number) {
    return this.contracts.get(id);
  }

  @ApiOperation({ summary: 'Створити договір' })
  @ApiResponse({ status: 401, description: 'Потрібно увійти' })
  @Post()
  create(@Body() dto: ContractDto, @Ctx() ctx: AuditContext) {
    return this.contracts.create(dto, ctx);
  }

  @ApiOperation({ summary: 'Змінити договір' })
  @ApiParam({ name: 'id', description: 'Ідентифікатор договору' })
  @ApiResponse({ status: 401, description: 'Потрібно увійти' })
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: ContractDto, @Ctx() ctx: AuditContext) {
    return this.contracts.update(id, dto, ctx);
  }

  @ApiOperation({ summary: 'Видалити договір', description: 'Розподілене з нерозподіленого повертається в нерозподілене.' })
  @ApiParam({ name: 'id', description: 'Ідентифікатор договору' })
  @ApiResponse({ status: 401, description: 'Потрібно увійти' })
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: AuditContext) {
    return this.contracts.remove(id, ctx);
  }

  @ApiOperation({ summary: 'Прикріпити файл договору', description: 'multipart/form-data, поле `file`.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary', description: 'Файл договору' } } } })
  @ApiParam({ name: 'id', description: 'Ідентифікатор договору' })
  @ApiResponse({ status: 401, description: 'Потрібно увійти' })
  @Put(':id/file')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  setFile(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @Ctx() ctx: AuditContext,
  ) {
    return this.contracts.setFile(id, file, ctx);
  }

  @ApiOperation({ summary: 'Видалити файл договору' })
  @ApiParam({ name: 'id', description: 'Ідентифікатор договору' })
  @ApiResponse({ status: 401, description: 'Потрібно увійти' })
  @Delete(':id/file')
  removeFile(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: AuditContext) {
    return this.contracts.removeFile(id, ctx);
  }

  /** Етап до підписання (null — підписано) */
  @ApiOperation({ summary: 'Змінити етап до підписання', description: '`stage: null` — підписано.' })
  @ApiParam({ name: 'id', description: 'Ідентифікатор договору' })
  @ApiResponse({ status: 401, description: 'Потрібно увійти' })
  @Put(':id/stage')
  setStage(@Param('id', ParseIntPipe) id: number, @Body() dto: StageDto, @Ctx() ctx: AuditContext) {
    return this.contracts.setStage(id, dto.stage, ctx);
  }

  /** Застаріле (вкладки до етапів): «сформовано, не підписано» так/ні */
  @ApiOperation({ summary: 'Застаріле: «сформовано, не підписано» так/ні', description: 'Замість нього — PUT /api/contracts/{id}/stage.', deprecated: true })
  @ApiParam({ name: 'id', description: 'Ідентифікатор договору' })
  @ApiResponse({ status: 401, description: 'Потрібно увійти' })
  @Put(':id/draft')
  setDraft(@Param('id', ParseIntPipe) id: number, @Body() dto: DraftDto, @Ctx() ctx: AuditContext) {
    return this.contracts.setStage(id, dto.draft ? 'draft' : null, ctx);
  }

  /** Недопоставка ("не зможуть") та орієнтовна дата поставки */
  @ApiOperation({ summary: 'Недопоставка й орієнтовна дата поставки', description: 'Скільки не зможуть поставити і чому.' })
  @ApiParam({ name: 'id', description: 'Ідентифікатор договору' })
  @ApiResponse({ status: 401, description: 'Потрібно увійти' })
  @Put(':id/shortfall')
  updateShortfall(@Param('id', ParseIntPipe) id: number, @Body() dto: ShortfallDto, @Ctx() ctx: AuditContext) {
    return this.contracts.updateShortfall(id, dto, ctx);
  }
}
