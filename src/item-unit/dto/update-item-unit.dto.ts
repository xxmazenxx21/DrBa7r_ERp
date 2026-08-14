import { PartialType } from '@nestjs/mapped-types';
import { CreateItemUnitDto } from './create-item-unit.dto';

export class UpdateItemUnitDto extends PartialType(CreateItemUnitDto) {}
