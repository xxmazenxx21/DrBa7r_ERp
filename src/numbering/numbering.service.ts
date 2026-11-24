import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { DocumentType } from '../../generated/prisma/enums.js';

/**
 * Sequential document numbers (PI-2026-000001, PI-2026-000002, ...): one
 * counter per document type per year, in the DocumentSequence table.
 * No API: other services call next() while they create a document.
 */
@Injectable()
export class NumberingService {
  /**
   * Adds 1 to the counter of (docType, year of `date`) and returns the new
   * number, e.g. next(tx, 'PI', new Date('2026-03-01')) -> "PI-2026-000001".
   *
   * Pass the SAME transaction (`tx`) that creates the document:
   * - the number and the document are saved together; if the document fails,
   *   the counter rolls back too, so no number is skipped;
   * - the counter row stays locked until that transaction ends, so two
   *   documents created at the same time can never get the same number.
   *
   * The year is taken in UTC (document dates are @db.Date, stored as UTC
   * midnight).
   */
  async next(
    tx: Prisma.TransactionClient,
    docType: DocumentType,
    date: Date = new Date(),
  ): Promise<string> {
    const year = date.getUTCFullYear();
    // First number of the year creates the row (lastNumber 1);
    // later ones add 1 to it.
    const sequence = await tx.documentSequence.upsert({
      where: { docType_year: { docType, year } },
      create: { docType, year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    return `${docType}-${year}-${String(sequence.lastNumber).padStart(6, '0')}`;
  }
}
