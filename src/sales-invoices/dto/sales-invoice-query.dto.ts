import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationQueryDto } from '../../utils/pagination/pagination';
import {
  DocumentStatus,
  PaymentType,
} from '../../../generated/prisma/enums.js';
import { Trim } from '../../utils/validation/optional';

/** GET /sales-invoices filters (+ page, pageSize). */
export class SalesInvoiceQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  branchId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  warehouseId?: string;

  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @IsOptional()
  @IsEnum(PaymentType)
  paymentType?: PaymentType;

  // invoiceDate from / to, inclusive
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  // part of the code, the customer name or the notes
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  search?: string;
}
