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

/** GET /purchase-invoices filters (+ page, pageSize). */
export class PurchaseInvoiceQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  supplierId?: string;

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

  // part of the code, the supplier's invoice number, the supplier name or the notes
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  search?: string;
}
