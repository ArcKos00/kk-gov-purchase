import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { parseJsonField, uploadOptions } from '../common/multipart';
import { Viewable } from '../auth/auth.guard';
import { DeliveriesService } from './deliveries.service';
import { DeliveryDto, DeliverySearchDto } from './dto';
import { AuditContext, Ctx } from '../audit/audit-context';

@ApiTags('Поставки')
@ApiCookieAuth('sid')
@Controller()
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  /** Усі поставки з пошуком і фільтрами (сторінка «Поставки»). */
  @ApiOperation({ summary: 'Пошук поставок', description: 'По всіх договорах, сторінками.' })
  @Get('deliveries')
  @Viewable()
  search(@Query() query: DeliverySearchDto) {
    return this.deliveries.search(query);
  }

  /** multipart/form-data: `data` — JSON з DeliveryInput, `file` — скан накладної (необов'язково). */
  @ApiOperation({ summary: 'Додати поставку до договору', description: 'multipart/form-data: `data` — JSON поставки (дата, накладна, кількості по найменуваннях), `file` — скан накладної (необов’язково).' })
  @ApiParam({ name: 'id', description: 'Ідентифікатор договору' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['data'], properties: { data: { type: 'string', description: 'JSON: { date, invoiceNumber, notes, lines: [{ orderItemId, quantity }] }' }, file: { type: 'string', format: 'binary', description: 'Скан накладної' } } } })
  @ApiResponse({ status: 401, description: 'Потрібно увійти' })
  @Post('contracts/:id/deliveries')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  async create(
    @Param('id', ParseIntPipe) id: number,
    @Body('data') data: string,
    @Ctx() ctx: AuditContext,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.deliveries.create(id, await parseJsonField(data, DeliveryDto), ctx, file);
  }

  @ApiOperation({ summary: 'Видалити поставку' })
  @ApiParam({ name: 'id', description: 'Ідентифікатор поставки' })
  @ApiResponse({ status: 401, description: 'Потрібно увійти' })
  @Delete('deliveries/:id')
  remove(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: AuditContext) {
    return this.deliveries.remove(id, ctx);
  }
}
