import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationQueryDto } from '../../utils/pagination/pagination';
import { QuotationStatus } from '../../../generated/prisma/enums.js';
import { Trim } from '../../utils/validation/optional';

/** GET /purchase-quotations filters (+ page, pageSize). */
export class PurchaseQuotationQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  supplierId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  branchId?: string;

  @IsOptional()
  @IsEnum(QuotationStatus)
  status?: QuotationStatus;

  // quotationDate from / to, inclusive ("2026-11-01")
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  // part of the code (PQ-2026-...), the supplier name or the notes
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  search?: string;
}
