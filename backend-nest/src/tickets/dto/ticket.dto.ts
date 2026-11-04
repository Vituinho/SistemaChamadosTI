import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { BRAZILIAN_STATES, CATEGORIES, DEPARTMENTS, PRIORITIES, STATUSES, SYSTEMS, type Priority, type Status } from '../../common/catalog';
import { OptionalText, OptionalValue, Trim } from '../../common/http/validation';

export class CreateTicketDto {
  @Trim() @IsString() @Length(2, 120)
  name!: string;

  @Trim() @IsString() @IsIn(DEPARTMENTS)
  department!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString() @IsIn(BRAZILIAN_STATES)
  state!: string;

  @OptionalText() @IsString() @MaxLength(160)
  location: string = '';

  @Trim() @IsString() @IsIn(CATEGORIES)
  category!: string;

  /** Required (and validated) when category is "Sistema"; otherwise optional. */
  @OptionalText() @IsString()
  @ValidateIf((dto: CreateTicketDto) => dto.category === 'Sistema' || dto.affected_system !== '')
  @IsIn(SYSTEMS)
  affected_system: string = '';

  @Trim() @IsString() @Length(3, 160)
  title!: string;

  @OptionalText() @IsString() @MaxLength(5000)
  description: string = '';
}

export class UpdateTicketDto {
  @OptionalValue() @IsOptional() @IsIn(STATUSES)
  status?: Status;

  @OptionalValue() @IsOptional() @IsIn(PRIORITIES)
  priority?: Priority;
}

export class ResolveTicketDto {
  @Trim() @IsString() @Length(3, 3000)
  solution!: string;
}

export class AddNoteDto {
  @Trim() @IsString() @Length(2, 2000)
  message!: string;
}

export const SORTS = ['oldest', 'newest', 'priority', 'activity'] as const;
export const SCOPES = ['all', 'open', 'waiting', 'closed'] as const;
export type Sort = (typeof SORTS)[number];
export type Scope = (typeof SCOPES)[number];

const toInt = () => Transform(({ value }) => (typeof value === 'string' && /^\d{1,9}$/.test(value) ? Number(value) : value));

/** Query string for GET /tickets. Unknown filters are rejected; new filters are optional and default to legacy behaviour. */
export class ListTicketsQuery {
  @OptionalValue() @IsOptional() @IsIn(STATUSES)
  status?: Status;

  @OptionalValue() @IsOptional() @IsIn(PRIORITIES)
  priority?: Priority;

  @OptionalValue() @IsOptional() @IsString() @MaxLength(160)
  department?: string;

  @OptionalValue() @IsOptional() @IsString() @MaxLength(160)
  state?: string;

  @OptionalValue() @IsOptional() @IsString() @MaxLength(160)
  category?: string;

  @OptionalValue() @IsOptional() @IsString() @MaxLength(160)
  affected_system?: string;

  @OptionalText() @IsString() @MaxLength(160)
  q: string = '';

  @toInt() @IsInt() @Min(0) @Max(1_000_000)
  offset: number = 0;

  @toInt() @IsInt() @Min(1) @Max(100)
  limit: number = 50;

  @OptionalValue() @IsOptional() @IsIn(SORTS)
  sort?: Sort;

  @OptionalValue() @IsOptional() @IsIn(SCOPES)
  scope?: Scope;

  /** "me" = assigned to the current technician, "none" = unassigned. */
  @OptionalValue() @IsOptional() @IsIn(['me', 'none'])
  assigned?: 'me' | 'none';
}
