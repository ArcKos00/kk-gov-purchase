import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Matches, Max, MaxLength,
  Min, ValidateIf, ValidateNested,
} from 'class-validator';
import type {
  ContractFilter, ContractInput, ContractItemInput, ContractSearch, ContractSort, ShortfallInput, SortDir, YesNo,
} from '@order-tracking/shared';

export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_QTY = 1e9;
const qtyOpts = { maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false };

export class ContractItemDto implements ContractItemInput {
  @IsOptional() @IsInt() id?: number;

  @IsString() @IsNotEmpty({ message: 'Вкажіть найменування' }) @MaxLength(500, { message: 'Не довше 500 символів' })
  name: string;

  @IsString() @IsNotEmpty({ message: 'Вкажіть од. виміру' }) @MaxLength(20, { message: 'Не довше 20 символів' })
  unit: string;

  @IsNumber(qtyOpts, { message: 'Вкажіть кількість (до 3 знаків після коми)' })
  @IsPositive({ message: 'Кількість має бути більшою за 0' })
  @Max(MAX_QTY, { message: 'Завелика кількість' })
  quantity: number;

  @ValidateIf((o) => o.price !== null && o.price !== undefined)
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false }, { message: 'Вкажіть ціну (до 2 знаків після коми)' })
  @Min(0, { message: 'Ціна не може бути від’ємною' })
  @Max(1e12, { message: 'Завелика ціна' })
  price?: number | null;
}

export class ContractDto implements ContractInput {
  @IsString() @IsNotEmpty({ message: 'Вкажіть номер договору' }) @MaxLength(100, { message: 'Не довше 100 символів' })
  number: string;

  @IsString() @IsNotEmpty({ message: 'Вкажіть контрагента' }) @MaxLength(300, { message: 'Не довше 300 символів' })
  counterparty: string;

  @Matches(DATE, { message: 'Вкажіть дату договору' })
  contractDate: string;

  @ValidateIf((o) => o.expectedDeliveryDate !== null && o.expectedDeliveryDate !== undefined && o.expectedDeliveryDate !== '')
  @Matches(DATE, { message: 'Некоректна дата' })
  expectedDeliveryDate: string | null;

  @IsOptional() @IsString() @MaxLength(2000, { message: 'Не довше 2000 символів' })
  notes: string | null;

  @IsArray({ message: 'Додайте хоча б одне найменування.' })
  @ArrayMinSize(1, { message: 'Додайте хоча б одне найменування.' })
  @ValidateNested({ each: true }) @Type(() => ContractItemDto)
  items: ContractItemDto[];
}

export class ShortfallItemDto {
  @IsInt() orderItemId: number;

  @IsNumber(qtyOpts, { message: 'Некоректна кількість' }) @Min(0, { message: 'Не може бути від’ємною' })
  cancelled: number;

  @IsOptional() @IsString() @MaxLength(1000, { message: 'Не довше 1000 символів' })
  cancelReason: string | null;
}

export class ShortfallDto implements ShortfallInput {
  @ValidateIf((o) => o.expectedDeliveryDate !== null && o.expectedDeliveryDate !== undefined && o.expectedDeliveryDate !== '')
  @Matches(DATE, { message: 'Некоректна дата' })
  expectedDeliveryDate: string | null;

  @IsArray() @ValidateNested({ each: true }) @Type(() => ShortfallItemDto)
  items: ShortfallItemDto[];
}

const YES_NO = ['yes', 'no'];
const STATUS_LIST = /^(waiting|partial|overdue|completed)(,(waiting|partial|overdue|completed))*$/;
const DECIMAL = /^\d+(\.\d+)?$/;
const SORTS: ContractSort[] = [
  'relevance', 'contractDate', 'number', 'counterparty', 'expectedDeliveryDate', 'quantity', 'pending', 'amount',
  'progress', 'status', 'lastDeliveryDate',
];

/** Фільтр договорів (query string). Спільний для списку, аналітики та експорту. */
export class ContractFilterDto implements ContractFilter {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  @IsOptional() @IsString() @MaxLength(100) number?: string;
  @IsOptional() @IsString() @MaxLength(300) counterparty?: string;
  @IsOptional() @IsString() @MaxLength(500) item?: string;
  @IsOptional() @Matches(DATE) dateFrom?: string;
  @IsOptional() @Matches(DATE) dateTo?: string;
  @IsOptional() @Matches(DATE) expectedFrom?: string;
  @IsOptional() @Matches(DATE) expectedTo?: string;
  @IsOptional() @Matches(DATE) deliveryFrom?: string;
  @IsOptional() @Matches(DATE) deliveryTo?: string;
  @IsOptional() @Matches(STATUS_LIST, { message: 'Некоректний стан' }) status?: string;
  @IsOptional() @IsIn(YES_NO) hasFile?: YesNo;
  @IsOptional() @IsIn(YES_NO) hasShortfall?: YesNo;
  @IsOptional() @IsIn(YES_NO) hasDeliveries?: YesNo;
  @IsOptional() @Matches(DECIMAL) amountMin?: string;
  @IsOptional() @Matches(DECIMAL) amountMax?: string;
  @IsOptional() @Matches(DECIMAL) quantityMin?: string;
  @IsOptional() @Matches(DECIMAL) quantityMax?: string;
}

export class ContractSearchDto extends ContractFilterDto implements ContractSearch {
  @IsOptional() @IsIn(SORTS) sort?: ContractSort;
  @IsOptional() @IsIn(['asc', 'desc']) dir?: SortDir;
  @IsOptional() @Matches(/^\d{1,6}$/) page?: string;
  @IsOptional() @Matches(/^\d{1,4}$/) pageSize?: string;
}
