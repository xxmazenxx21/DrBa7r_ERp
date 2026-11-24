import { IsDateString, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { PaymentType } from '../../../generated/prisma/enums.js';
import { IsOptionalNotNull } from '../../utils/validation/optional';

/**
 * POST /purchase-quotations/:id/convert-to-invoice
 * What the new invoice needs that a quotation doesn't have.
 */
export class ConvertToInvoiceDto {
  // طريقة الدفع: CASH (paid = net) / CREDIT (paid 0, edit the draft to change it)
  @IsEnum(PaymentType)
  paymentType: PaymentType;

  // المخزن: optional if the quotation has one (this one wins); required if not
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  warehouseId?: string;

  // تاريخ الفاتورة "2026-11-24"
  @IsDateString()
  invoiceDate: string;
}
