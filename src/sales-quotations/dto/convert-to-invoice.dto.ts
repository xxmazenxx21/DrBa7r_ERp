import { IsDateString, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { PaymentType } from '../../../generated/prisma/enums.js';
import { IsOptionalNotNull } from '../../utils/validation/optional';

/**
 * POST /sales-quotations/:id/convert-to-invoice
 * What the new sales invoice needs that a quotation doesn't have.
 */
export class ConvertToInvoiceDto {
  // طريقة الدفع: CASH (paid = net) / CREDIT (paid 0, edit the draft to change it)
  @IsEnum(PaymentType)
  paymentType: PaymentType;

  // المخزن: optional if the quotation has one (if sent, it is used instead);
  // required if the quotation has none. Must belong to the quotation's branch.
  @IsOptionalNotNull()
  @IsString()
  @IsNotEmpty()
  warehouseId?: string;

  // تاريخ الفاتورة "2026-11-27"
  @IsDateString()
  invoiceDate: string;
}
