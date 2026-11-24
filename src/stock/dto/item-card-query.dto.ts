import { IsNotEmpty, IsString } from 'class-validator';

/** GET /stock-movements/item-card?productId=&warehouseId= (both required) */
export class ItemCardQueryDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  warehouseId: string;
}
