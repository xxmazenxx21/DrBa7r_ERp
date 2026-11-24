import { PartialType } from '@nestjs/mapped-types';
import { CreatePurchaseInvoiceDto } from './create-purchase-invoice.dto';

// Every field optional (DRAFT only). "lines", when sent, REPLACES all lines.
// skipNullProperties: false -> null clears nullable fields (dueDate,
// supplierInvoiceNumber, notes) and is rejected (400) for the others.
export class UpdatePurchaseInvoiceDto extends PartialType(
  CreatePurchaseInvoiceDto,
  { skipNullProperties: false },
) {}
