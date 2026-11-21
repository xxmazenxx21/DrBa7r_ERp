import { Injectable } from '@nestjs/common';
import { ok } from './utils/response/response';

@Injectable()
export class AppService {
  getHello() {
    return ok('API is running', null);
  }
}
