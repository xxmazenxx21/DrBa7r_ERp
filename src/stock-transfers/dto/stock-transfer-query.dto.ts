import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationQueryDto } from '../../utils/pagination/pagination';
import { Trim } from '../../utils/validation/optional';
import { DocumentStatus } from '../../../generated/prisma/enums.js';

/** GET /stock-transfers filters (+ page, pageSize). */
export class StockTransferQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fromWarehouseId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  toWarehouseId?: string;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  // transferDate from / to, inclusive
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  // part of the code or the notes (any case)
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  search?: string;
}
