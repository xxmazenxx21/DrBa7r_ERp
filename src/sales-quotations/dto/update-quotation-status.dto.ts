import { IsIn } from 'class-validator';
import { QuotationStatus } from '../../../generated/prisma/enums.js';

/** The NEW status. Allowed moves: DRAFT -> SENT, SENT -> ACCEPTED or REJECTED. */
export class UpdateQuotationStatusDto {
  @IsIn([
    QuotationStatus.SENT,
    QuotationStatus.ACCEPTED,
    QuotationStatus.REJECTED,
  ])
  status: 'SENT' | 'ACCEPTED' | 'REJECTED';
}
