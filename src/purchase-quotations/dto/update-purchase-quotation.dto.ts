import { PartialType } from '@nestjs/mapped-types';
import { CreatePurchaseQuotationDto } from './create-purchase-quotation.dto';

// Every field optional. "lines", when sent, REPLACES all the lines.
// skipNullProperties: false -> null clears nullable fields (validUntil,
// warehouseId, notes) and is rejected (400) for the others.
export class UpdatePurchaseQuotationDto extends PartialType(
  CreatePurchaseQuotationDto,
  { skipNullProperties: false },
) {}
