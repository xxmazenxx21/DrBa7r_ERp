import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationQueryDto } from '../../utils/pagination/pagination';
import { DocumentStatus } from '../../../generated/prisma/enums.js';

/** GET /stock-counts filters (+ page, pageSize). */
export class StockCountQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  warehouseId?: string;

  // DRAFT / POSTED (a count is never CANCELLED)
  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  // countDate from / to, inclusive
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
