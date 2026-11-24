import { IsString, IsNotEmpty } from 'class-validator';
import { Trim } from '../../utils/validation/optional';

export class LoginDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
