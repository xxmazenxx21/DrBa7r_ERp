import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentType } from '../../../generated/prisma/enums.js';
import { MaxDecimalPlaces } from '../../utils/validation/max-decimal-places';
import { IsOptionalNotNull, Trim } from '../../utils/validation/optional';
import { SalesInvoiceLineDto } from './sales-invoice-line.dto';

/**
 * Header (الرأس) + lines (البنود). The server computes every total, the
 * paid / remaining amounts, the cost and the code (SI-2026-000001); never send them.
 */
export class CreateSalesInvoiceDto {
  // تاريخ الفاتورة "2026-11-24"
  @IsDateString()
  invoiceDate: string;

  // تاريخ الاستحقاق (>= invoiceDate, for CREDIT). null clears.
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  // طريقة الدفع: CASH (نقدي) / CREDIT (آجل)
  @IsEnum(PaymentType)
  paymentType: PaymentType;

  // العميل
  @IsString()
  @IsNotEmpty()
  customerId: string;

  // الفرع
  @IsString()
  @IsNotEmpty()
  branchId: string;

  // المخزن (required, must belong to branchId): the goods leave from here
  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  // العملة: not sent -> the default currency
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  currencyId?: string;

  // سعر الصرف: 1 for the default currency; REQUIRED (> 0) for any other
  @IsOptionalNotNull()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @MaxDecimalPlaces(4)
  exchangeRate?: number;

  // نسبة الخصم % (0-100). Above 0 it wins over discountValue.
  @IsOptionalNotNull()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @MaxDecimalPlaces(2)
  discountPercent?: number;

  // قيمة الخصم: used only when there is no discountPercent
  @IsOptionalNotNull()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @MaxDecimalPlaces(2)
  discountValue?: number;

  // نسبة الضريبة % (0-100)
  @IsOptionalNotNull()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @MaxDecimalPlaces(2)
  taxPercent?: number;

  // المدفوع: CREDIT only, 0..netTotal (default 0). CASH -> always netTotal.
  @IsOptionalNotNull()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @MaxDecimalPlaces(2)
  paidAmount?: number;

  // ملاحظات. null clears.
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  // البنود: at least one
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesInvoiceLineDto)
  lines: SalesInvoiceLineDto[];
}
