import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Matches, Max,
  MaxLength, Min, ValidateNested,
} from 'class-validator';
import type { PoolContractInput, PoolItemInput, PoolLineInput, PoolSearch, PoolStatus } from '@order-tracking/shared';
import { ContractHeaderDto, DATE, MAX_QTY } from '../contracts/dto';

const qtyOpts = { maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false };

export class PoolItemDto implements PoolItemInput {
  @ApiProperty({ description: 'Найменування', maxLength: 500 })
  @IsString() @IsNotEmpty({ message: 'Вкажіть найменування' }) @MaxLength(500, { message: 'Не довше 500 символів' })
  name: string;

  @ApiProperty({ description: 'Одиниця виміру', maxLength: 20 })
  @IsString() @IsNotEmpty({ message: 'Вкажіть од. виміру' }) @MaxLength(20, { message: 'Не довше 20 символів' })
  unit: string;

  @ApiProperty({ description: 'Кількість (до 3 знаків після коми)', minimum: 0, exclusiveMinimum: true })
  @IsNumber(qtyOpts, { message: 'Вкажіть кількість (до 3 знаків після коми)' })
  @IsPositive({ message: 'Кількість має бути більшою за 0' })
  @Max(MAX_QTY, { message: 'Завелика кількість' })
  quantity: number;

  @ApiProperty({ format: 'date', description: 'Дата внесення' })
  @Matches(DATE, { message: 'Вкажіть дату внесення' })
  enteredOn: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Примітка', maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000, { message: 'Не довше 1000 символів' })
  notes: string | null;
}

export class PoolLineDto implements PoolLineInput {
  @ApiProperty({ description: 'Ідентифікатор нерозподіленого найменування' })
  @IsInt() poolItemId: number;

  @ApiProperty({ description: 'Скільки перенести в договір', minimum: 0, exclusiveMinimum: true })
  @IsNumber(qtyOpts, { message: 'Вкажіть кількість (до 3 знаків після коми)' })
  @IsPositive({ message: 'Кількість має бути більшою за 0' })
  @Max(MAX_QTY, { message: 'Завелика кількість' })
  quantity: number;
}

export class PoolContractDto extends ContractHeaderDto implements PoolContractInput {
  @ApiProperty({ type: [PoolLineDto], description: 'Що йде в договір (1–1000 рядків)' })
  @IsArray({ message: 'Перетягніть у замовлення хоча б одне найменування.' })
  @ArrayMinSize(1, { message: 'Перетягніть у замовлення хоча б одне найменування.' })
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true }) @Type(() => PoolLineDto)
  lines: PoolLineDto[];
}

export const POOL_STATUSES: PoolStatus[] = ['unallocated', 'partial', 'allocated'];

export class PoolSearchDto implements PoolSearch {
  @ApiPropertyOptional({ description: 'Пошук за назвою' })
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @ApiPropertyOptional({ enum: ['unallocated', 'partial', 'allocated'], description: 'Стан розподілу' })
  @IsOptional() @IsIn(POOL_STATUSES) status?: PoolStatus;
  @ApiPropertyOptional({ format: 'date', description: 'Дата внесення від' })
  @IsOptional() @Matches(DATE) dateFrom?: string;
  @ApiPropertyOptional({ format: 'date', description: 'Дата внесення до' })
  @IsOptional() @Matches(DATE) dateTo?: string;
  @ApiPropertyOptional({ type: 'integer', minimum: 1, description: 'Сторінка' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100, description: 'Розмір сторінки (типово 25)' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
