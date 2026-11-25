import { PartialType } from '@nestjs/mapped-types';
import { CreatePurchaseReturnDto } from './create-purchase-return.dto';

// Every field optional (DRAFT only). "lines", when sent, REPLACES all lines.
// skipNullProperties: false -> null clears nullable fields (reason, notes,
// purchaseInvoiceId = unlink) and is rejected (400) for the others.
export class UpdatePurchaseReturnDto extends PartialType(
  CreatePurchaseReturnDto,
  { skipNullProperties: false },
) {}
