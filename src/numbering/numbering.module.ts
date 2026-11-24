import { Module } from '@nestjs/common';
import { NumberingService } from './numbering.service';

/**
 * Document numbering. No controller / routes.
 * Import NumberingModule in a feature module to inject NumberingService.
 */
@Module({
  providers: [NumberingService],
  exports: [NumberingService],
})
export class NumberingModule {}
