import { PartialType } from '@nestjs/mapped-types';
import { CreateSalesQuotationDto } from './create-sales-quotation.dto';

// Every field optional. "lines", when sent, REPLACES all the lines.
// skipNullProperties: false -> null clears nullable fields (validUntil,
// warehouseId, notes) and is rejected (400) for the others.
export class UpdateSalesQuotationDto extends PartialType(
  CreateSalesQuotationDto,
  { skipNullProperties: false },
) {}
