import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationQueryDto } from '../../utils/pagination/pagination';
import { StockMovementType } from '../../../generated/prisma/enums.js';

/** GET /stock-movements?productId=&warehouseId=&type=&dateFrom=&dateTo=&page=&pageSize= */
export class StockMovementQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  productId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  warehouseId?: string;

  @IsOptional()
  @IsEnum(StockMovementType)
  type?: StockMovementType;

  // "2026-11-01" or a full ISO date-time. Inclusive.
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  // "2026-11-30" = the whole day included. Inclusive.
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
