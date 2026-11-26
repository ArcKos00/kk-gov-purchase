import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import type { DeliveryInput, DeliveryLine, DeliverySearch } from '@order-tracking/shared';
import { DATE } from '../contracts/dto';

export class DeliveryLineDto implements DeliveryLine {
  @ApiProperty({ description: 'Ідентифікатор найменування договору' })
  @IsInt() orderItemId: number;

  @ApiProperty({ description: 'Отримана кількість', minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false }, { message: 'Некоректна кількість' })
  @Min(0, { message: 'Не може бути від’ємною' })
  quantity: number;
}

export class DeliveryDto implements DeliveryInput {
  @ApiProperty({ format: 'date', description: 'Дата поставки' })
  @Matches(DATE, { message: 'Вкажіть дату поставки' })
  date: string;

  @ApiProperty({ description: 'Номер накладної', maxLength: 100 })
  @IsString() @IsNotEmpty({ message: 'Вкажіть номер накладної' }) @MaxLength(100, { message: 'Не довше 100 символів' })
  invoiceNumber: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Примітки', maxLength: 2000 })
  @IsOptional() @IsString() @MaxLength(2000, { message: 'Не довше 2000 символів' })
  notes: string | null;

  @ApiProperty({ type: [DeliveryLineDto], description: 'Кількості по найменуваннях' })
  @IsArray() @ValidateNested({ each: true }) @Type(() => DeliveryLineDto)
  lines: DeliveryLineDto[];
}

export class DeliverySearchDto implements DeliverySearch {
  @ApiPropertyOptional({ description: 'Пошук за всіма полями' })
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @ApiPropertyOptional({ description: 'Номер накладної' })
  @IsOptional() @IsString() invoice?: string;
  @ApiPropertyOptional({ description: 'Номер договору' })
  @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional({ description: 'Контрагент' })
  @IsOptional() @IsString() counterparty?: string;
  @ApiPropertyOptional({ description: 'Найменування' })
  @IsOptional() @IsString() item?: string;
  @ApiPropertyOptional({ format: 'date', description: 'Дата поставки від' })
  @IsOptional() @Matches(DATE) dateFrom?: string;
  @ApiPropertyOptional({ format: 'date', description: 'Дата поставки до' })
  @IsOptional() @Matches(DATE) dateTo?: string;
  @ApiPropertyOptional({ type: 'integer', minimum: 1, description: 'Сторінка' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100, description: 'Розмір сторінки (типово 25)' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
