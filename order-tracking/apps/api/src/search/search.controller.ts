import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { SearchEntity } from '@order-tracking/shared';
import { SEARCH_ENTITIES, SearchService } from './search.service';

const ENTITY_LIST = new RegExp(`^(${SEARCH_ENTITIES.join('|')})(,(${SEARCH_ENTITIES.join('|')}))*$`);

export class SearchQueryDto {
  @IsOptional() @IsString() @MaxLength(200) q?: string;
  /** Скільки результатів на групу (1..50, за замовчуванням 5) */
  @IsOptional() @Matches(/^\d{1,2}$/) limit?: string;
  /** Лише ці групи, через кому */
  @IsOptional() @Matches(ENTITY_LIST) entities?: string;
}

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** Глобальний пошук: результати, згруповані за типом сутності. */
  @Get()
  find(@Query() dto: SearchQueryDto) {
    const limit = Math.min(50, Math.max(1, Number(dto.limit) || 5));
    const only = dto.entities?.split(',') as SearchEntity[] | undefined;
    return this.search.search(dto.q ?? '', limit, only);
  }
}
