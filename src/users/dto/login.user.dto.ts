import { IsString, IsNotEmpty } from 'class-validator';
import { Trim } from '../../utils/validation/optional';

export class LoginUserDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
