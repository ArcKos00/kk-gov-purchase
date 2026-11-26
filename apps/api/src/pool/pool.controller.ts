import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Viewable } from '../auth/auth.guard';
import { AuditContext, Ctx } from '../audit/audit-context';
import { PoolService } from './pool.service';
import { PoolContractDto, PoolItemDto, PoolSearchDto } from './dto';

/** Нерозподілені найменування і договір з них. */
@ApiTags('Нерозподілені')
@ApiCookieAuth('sid')
@Controller('pool')
export class PoolController {
  constructor(private readonly pool: PoolService) {}

  @ApiOperation({ summary: 'Пошук нерозподілених найменувань', description: 'Сторінками, зі станом розподілу.' })
  @Get()
  @Viewable()
  search(@Query() query: PoolSearchDto) {
    return this.pool.search(query);
  }

  /** Усе, що ще можна розподілити (залишок > 0) — для форми «Створити замовлення з нерозподіленого». */
  @ApiOperation({ summary: 'Доступне для розподілу', description: 'Усе із залишком > 0 — для форми «Замовлення з нерозподіленого».' })
  @Get('available')
  @Viewable()
  available() {
    return this.pool.available();
  }

  @ApiOperation({ summary: 'Внести нерозподілене найменування' })
  @ApiResponse({ status: 401, description: 'Потрібно увійти' })
  @Post()
  create(@Body() dto: PoolItemDto, @Ctx() ctx: AuditContext) {
    return this.pool.create(dto, ctx);
  }

  @ApiOperation({ summary: 'Видалити нерозподілене найменування', description: 'Лише ще не розподілене.' })
  @ApiParam({ name: 'id', description: 'Ідентифікатор найменування' })
  @ApiResponse({ status: 401, description: 'Потрібно увійти' })
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: AuditContext) {
    return this.pool.remove(id, ctx);
  }

  @ApiOperation({ summary: 'Створити договір з нерозподіленого', description: 'Однакові найменування (назва й од.) стають одним рядком договору.' })
  @ApiResponse({ status: 401, description: 'Потрібно увійти' })
  @Post('contract')
  createContract(@Body() dto: PoolContractDto, @Ctx() ctx: AuditContext) {
    return this.pool.createContract(dto, ctx);
  }
}
