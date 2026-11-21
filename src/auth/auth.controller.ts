import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from '../decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // TEMPORARY: open signup that creates SUPERADMIN accounts. Remove before production.
  @Post('/signup')
  @Public()
  signup(@Body() createAuthDto: CreateAuthDto) {
    return this.authService.signup(createAuthDto);
  }

  @Post('/login')
  @Public()
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }
}
