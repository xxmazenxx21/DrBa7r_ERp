import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Roles } from './decorators/roles.decorator';
import { Role } from './utils/enum/enum';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Roles(Role.SUPERADMIN)
  getHello() {
    return this.appService.getHello();
  }
}
