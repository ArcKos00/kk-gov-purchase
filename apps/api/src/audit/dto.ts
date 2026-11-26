import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import type { AuditKind, AuditSearch, UiEvent, UiEventBatch } from '@order-tracking/shared';
import { DATE } from '../contracts/dto';

const KINDS: AuditKind[] = ['changes', 'deletes', 'failed', 'files', 'ui'];

export class AuditSearchDto implements AuditSearch {
  @ApiPropertyOptional({ enum: ['changes', 'deletes', 'failed', 'files', 'ui'], description: 'Вид записів' })
  @IsOptional() @IsIn(KINDS) kind?: AuditKind;
  @ApiPropertyOptional({ description: 'Хто' })
  @IsOptional() @IsString() @MaxLength(200) actor?: string;
  @ApiPropertyOptional({ pattern: '^\\d{1,9}$', description: 'Ідентифікатор договору' })
  @IsOptional() @Matches(/^\d{1,9}$/) contractId?: string;
  @ApiPropertyOptional({ format: 'date', description: 'Від дати' })
  @IsOptional() @Matches(DATE) dateFrom?: string;
  @ApiPropertyOptional({ format: 'date', description: 'До дати' })
  @IsOptional() @Matches(DATE) dateTo?: string;
  @ApiPropertyOptional({ type: 'integer', minimum: 1, description: 'Сторінка' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 200, description: 'Розмір сторінки' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export class UiEventDto implements UiEvent {
  @ApiProperty({ enum: ['click', 'navigate'], description: 'Клік чи перехід' })
  @IsIn(['click', 'navigate']) type: 'click' | 'navigate';
  @ApiProperty({ description: 'Сторінка', maxLength: 1000 })
  @IsString() @MaxLength(1000) path: string;
  @ApiPropertyOptional({ description: 'Підпис кнопки чи посилання', maxLength: 300 })
  @IsOptional() @IsString() @MaxLength(300) target?: string;
  @ApiPropertyOptional({ description: 'Куди веде посилання', maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000) href?: string;
  @ApiProperty({ format: 'date-time', description: 'Час у браузері' })
  @IsISO8601() at: string;
}

export class UiEventBatchDto implements UiEventBatch {
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Вкладка браузера', maxLength: 64 })
  @IsOptional() @IsString() @MaxLength(64) tabId?: string | null;

  @ApiProperty({ type: [UiEventDto], description: 'До 100 подій' })
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => UiEventDto)
  events: UiEventDto[];
}
