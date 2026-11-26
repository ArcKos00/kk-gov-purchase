import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Matches, Max, MaxLength,
  Min, ValidateIf, ValidateNested,
} from 'class-validator';
import type {
  ContractInput, ContractItemInput, ContractSearch, ContractStage, ContractStatus, ShortfallInput,
} from '@order-tracking/shared';

export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_QTY = 1e9;
const qtyOpts = { maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false };

export class ContractItemDto implements ContractItemInput {
  @ApiPropertyOptional({ type: Number, description: 'Ідентифікатор рядка (при зміні договору)' })
  @IsOptional() @IsInt() id?: number;

  @ApiProperty({ description: 'Найменування', maxLength: 500 })
  @IsString() @IsNotEmpty({ message: 'Вкажіть найменування' }) @MaxLength(500, { message: 'Не довше 500 символів' })
  name: string;

  @ApiProperty({ description: 'Одиниця виміру', maxLength: 20 })
  @IsString() @IsNotEmpty({ message: 'Вкажіть од. виміру' }) @MaxLength(20, { message: 'Не довше 20 символів' })
  unit: string;

  @ApiProperty({ description: 'Замовлена кількість (до 3 знаків після коми)', minimum: 0, exclusiveMinimum: true })
  @IsNumber(qtyOpts, { message: 'Вкажіть кількість (до 3 знаків після коми)' })
  @IsPositive({ message: 'Кількість має бути більшою за 0' })
  @Max(MAX_QTY, { message: 'Завелика кількість' })
  quantity: number;
}

export const STAGES: ContractStage[] = ['planned', 'tender_announced', 'tender_held', 'draft'];

/** Етап з тіла запиту: stage, а якщо його нема — застарілий прапорець draft. null — підписано. */
export const stageOf = (o: { stage?: ContractStage | null; draft?: boolean }): ContractStage | null =>
  o.stage !== undefined ? o.stage : o.draft ? 'draft' : null;

const blank = (v: unknown) => v === null || v === undefined || v === '';
/** Поле можна лишити порожнім, лише поки договір не підписано (обов'язковість для підписаного — у checkCommon). */
const unlessBlankUnsigned = ValidateIf((o, v) => !stageOf(o) || !blank(v));

/** Поля договору без найменувань — спільні для звичайної форми і договору з нерозподіленого. */
export class ContractHeaderDto implements Omit<ContractInput, 'items'> {
  @ApiProperty({ type: String, nullable: true, description: 'Номер договору (необов’язковий, поки не підписано)', maxLength: 100 })
  @unlessBlankUnsigned
  @IsString() @IsNotEmpty({ message: 'Вкажіть номер договору' }) @MaxLength(100, { message: 'Не довше 100 символів' })
  number: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Контрагент (необов’язковий, поки не підписано)', maxLength: 300 })
  @unlessBlankUnsigned
  @IsString() @IsNotEmpty({ message: 'Вкажіть контрагента' }) @MaxLength(300, { message: 'Не довше 300 символів' })
  counterparty: string | null;

  @ApiProperty({ type: String, format: 'date', nullable: true, description: 'Дата договору (необов’язкова, поки не підписано)' })
  @unlessBlankUnsigned
  @Matches(DATE, { message: 'Вкажіть дату договору' })
  contractDate: string | null;

  @ApiProperty({ type: String, format: 'date', nullable: true, description: 'Орієнтовна дата поставки' })
  @ValidateIf((o) => o.expectedDeliveryDate !== null && o.expectedDeliveryDate !== undefined && o.expectedDeliveryDate !== '')
  @Matches(DATE, { message: 'Некоректна дата' })
  expectedDeliveryDate: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Примітки', maxLength: 2000 })
  @IsOptional() @IsString() @MaxLength(2000, { message: 'Не довше 2000 символів' })
  notes: string | null;

  @ApiPropertyOptional({ enum: ['planned', 'tender_announced', 'tender_held', 'draft'], nullable: true, description: 'Етап до підписання; null — підписано' })
  @IsOptional() @IsIn(STAGES, { message: 'Невідомий етап' }) stage?: ContractStage | null;

  @ApiPropertyOptional({ type: Boolean, deprecated: true, description: 'Застаріле: «сформовано, не підписано» (замість stage)' })
  @IsOptional() @IsBoolean() draft?: boolean;
}

export class ContractDto extends ContractHeaderDto implements ContractInput {
  @ApiProperty({ type: [ContractItemDto], description: 'Найменування договору (хоча б одне)' })
  @IsArray({ message: 'Додайте хоча б одне найменування.' })
  @ArrayMinSize(1, { message: 'Додайте хоча б одне найменування.' })
  @ValidateNested({ each: true }) @Type(() => ContractItemDto)
  items: ContractItemDto[];
}

export class ShortfallItemDto {
  @ApiProperty({ description: 'Ідентифікатор найменування договору' })
  @IsInt() orderItemId: number;

  @ApiProperty({ description: 'Скільки не зможуть поставити', minimum: 0 })
  @IsNumber(qtyOpts, { message: 'Некоректна кількість' }) @Min(0, { message: 'Не може бути від’ємною' })
  cancelled: number;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'Причина', maxLength: 1000 })
  @IsOptional() @IsString() @MaxLength(1000, { message: 'Не довше 1000 символів' })
  cancelReason: string | null;
}

export class ShortfallDto implements ShortfallInput {
  @ApiProperty({ type: String, format: 'date', nullable: true, description: 'Орієнтовна дата поставки' })
  @ValidateIf((o) => o.expectedDeliveryDate !== null && o.expectedDeliveryDate !== undefined && o.expectedDeliveryDate !== '')
  @Matches(DATE, { message: 'Некоректна дата' })
  expectedDeliveryDate: string | null;

  @ApiProperty({ type: [ShortfallItemDto], description: 'Недопоставка по найменуваннях' })
  @IsArray() @ValidateNested({ each: true }) @Type(() => ShortfallItemDto)
  items: ShortfallItemDto[];
}

/** Застарілий PUT /contracts/:id/draft (вкладки до етапів). */
export class DraftDto {
  @ApiProperty({ description: 'Сформовано, не підписано' })
  @IsBoolean() draft: boolean;
}

export class StageDto {
  @ApiProperty({ enum: ['planned', 'tender_announced', 'tender_held', 'draft'], nullable: true, description: 'Етап до підписання; null — підписано' })
  @ValidateIf((o) => o.stage !== null) @IsIn(STAGES, { message: 'Невідомий етап' }) stage: ContractStage | null;
}

const STATUSES: ContractStatus[] = [...STAGES, 'waiting', 'partial', 'overdue', 'completed'];

export const PAGE_SIZE = 25;

export class SearchDto implements ContractSearch {
  @ApiPropertyOptional({ description: 'Пошук: кожне слово — у номері, контрагенті або найменуванні' })
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @ApiPropertyOptional({ description: 'Номер договору' })
  @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional({ description: 'Контрагент' })
  @IsOptional() @IsString() counterparty?: string;
  @ApiPropertyOptional({ description: 'Найменування' })
  @IsOptional() @IsString() item?: string;
  @ApiPropertyOptional({ format: 'date', description: 'Дата договору від' })
  @IsOptional() @Matches(DATE) dateFrom?: string;
  @ApiPropertyOptional({ format: 'date', description: 'Дата договору до' })
  @IsOptional() @Matches(DATE) dateTo?: string;
  @ApiPropertyOptional({ enum: ['planned', 'tender_announced', 'tender_held', 'draft', 'waiting', 'partial', 'overdue', 'completed'], description: 'Стан: етап до підписання або стан за поставками' })
  @IsOptional() @IsIn(STATUSES) status?: ContractStatus;
  @ApiPropertyOptional({ type: 'integer', minimum: 1, description: 'Сторінка' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100, description: 'Розмір сторінки (типово 25)' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}
