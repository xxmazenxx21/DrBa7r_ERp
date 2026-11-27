import { PartialType } from '@nestjs/mapped-types';
import { CreateSalesInvoiceDto } from './create-sales-invoice.dto';

// Every field optional (DRAFT only). "lines", when sent, REPLACES all lines.
// skipNullProperties: false -> null clears nullable fields (dueDate, notes) and is rejected (400) for the others.
export class UpdateSalesInvoiceDto extends PartialType(CreateSalesInvoiceDto, {
  skipNullProperties: false,
}) {}
