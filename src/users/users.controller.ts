import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LoginUserDto } from './dto/login.user.dto';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../utils/enum/enum';
import { AuthService } from '../auth/auth.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @Roles(Role.SUPERADMIN)
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  // Same as POST /auth/login.
  @Post('/login')
  @Public()
  login(@Body() loginUserDto: LoginUserDto) {
    return this.authService.login(loginUserDto);
  }

  @Get()
  @Roles(Role.SUPERADMIN)
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @Roles(Role.SUPERADMIN)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.SUPERADMIN)
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Roles(Role.SUPERADMIN)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
