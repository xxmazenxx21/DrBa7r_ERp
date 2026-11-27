import { PartialType, PickType } from '@nestjs/mapped-types';
import { CreateStockCountDto } from './create-stock-count.dto';

// PATCH /stock-counts/:id (DRAFT only): countDate and notes. The warehouse
// can't change (the lines belong to it): sending warehouseId -> 400.
// skipNullProperties: false -> null clears notes, countDate: null -> 400.
export class UpdateStockCountDto extends PartialType(
  PickType(CreateStockCountDto, ['countDate', 'notes'] as const),
  { skipNullProperties: false },
) {}
