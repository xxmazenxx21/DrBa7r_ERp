import { PartialType } from '@nestjs/mapped-types';
import { CreateProdcutInventoryDto } from './create-prodcut-inventory.dto';

export class UpdateProdcutInventoryDto extends PartialType(
  CreateProdcutInventoryDto,
) {}
