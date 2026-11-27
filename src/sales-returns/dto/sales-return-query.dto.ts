import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationQueryDto } from '../../utils/pagination/pagination';
import { DocumentStatus } from '../../../generated/prisma/enums.js';

/** GET /sales-returns filters (+ page, pageSize). */
export class SalesReturnQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  salesInvoiceId?: string;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  // returnDate from / to, inclusive
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
