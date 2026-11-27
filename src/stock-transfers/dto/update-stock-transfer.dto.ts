import { PartialType } from '@nestjs/mapped-types';
import { CreateStockTransferDto } from './create-stock-transfer.dto';

// Every field optional (DRAFT only). "lines", when sent, REPLACES all lines.
// skipNullProperties: false -> null clears notes and is rejected (400) for
// the other fields.
export class UpdateStockTransferDto extends PartialType(
  CreateStockTransferDto,
  { skipNullProperties: false },
) {}
