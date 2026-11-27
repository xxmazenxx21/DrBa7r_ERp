import { PartialType } from '@nestjs/mapped-types';
import { CreateSalesReturnDto } from './create-sales-return.dto';

// Every field optional (DRAFT only). "lines", when sent, REPLACES all lines.
// skipNullProperties: false -> null clears nullable fields (reason, notes)
// and is rejected (400) for the others (salesInvoiceId can't be null).
export class UpdateSalesReturnDto extends PartialType(CreateSalesReturnDto, {
  skipNullProperties: false,
}) {}
