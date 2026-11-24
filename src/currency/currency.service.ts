import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client.js';
import { ok } from '../utils/response/response';
import { ErrorCode, errorBody } from '../utils/errors/error-codes';
import { assertNotUsedByDeleted } from '../utils/unique/deleted-unique';

@Injectable()
export class CurrencyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs `work` in ONE transaction that first takes a lock, so changes that
   * touch the default currency happen one after the other, never at the same
   * time. Without it, two "make X default" / "make Y default" requests at the
   * same moment can BOTH end up true (each only unsets the currencies that
   * were default when it started) or deadlock (500).
   * pg_advisory_xact_lock is released automatically when the transaction ends.
   */
  private lockedTransaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('currency_default'))`;
      return work(tx);
    });
  }

  /**
   * Makes every OTHER active currency non-default. Called inside the same
   * transaction that makes `exceptId` (or the new currency) the default, so
   * there is never a moment with two defaults.
   */
  private unsetOtherDefaults(tx: Prisma.TransactionClient, exceptId?: string) {
    return tx.currency.updateMany({
      where: {
        isDefault: true,
        deletedAt: null,
        ...(exceptId && { id: { not: exceptId } }),
      },
      data: { isDefault: false },
    });
  }

  /** The active currency or 404. Pass `tx` to read inside a transaction. */
  private async getActive(
    id: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const currency = await db.currency.findFirst({
      where: { id, deletedAt: null },
    });
    if (!currency) {
      throw new NotFoundException(`Currency with id ${id} not found`);
    }
    return currency;
  }

  async create(dto: CreateCurrencyDto) {
    // Active duplicate -> PrismaExceptionFilter 409 "code already exists".
    await assertNotUsedByDeleted(this.prisma.currency, 'currency', {
      code: dto.code,
    });
    const data = {
      code: dto.code,
      name: dto.name,
      symbol: dto.symbol,
      isDefault: dto.isDefault ?? false,
    };
    const currency = dto.isDefault
      ? await this.lockedTransaction(async (tx) => {
          await this.unsetOtherDefaults(tx);
          return tx.currency.create({ data });
        })
      : await this.prisma.currency.create({ data });
    return ok('Currency created successfully', currency);
  }

  /** All active currencies, the default one first, then by code. */
  async findAll() {
    const currencies = await this.prisma.currency.findMany({
      where: { deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { code: 'asc' }],
    });
    return ok('All currencies returned successfully', currencies);
  }

  async findOne(id: string) {
    const currency = await this.getActive(id);
    return ok('Currency returned successfully', currency);
  }

  async update(id: string, dto: UpdateCurrencyDto) {
    await this.getActive(id); // 404 before anything else
    await assertNotUsedByDeleted(this.prisma.currency, 'currency', {
      code: dto.code,
    });
    const currency = await this.lockedTransaction(async (tx) => {
      // Read again under the lock: the default may have just changed.
      const current = await this.getActive(id, tx);
      // There must always be a default: change it by making ANOTHER currency
      // the default (that unsets this one), never by setting false here.
      if (dto.isDefault === false && current.isDefault) {
        throw new BadRequestException(
          errorBody(
            400,
            'The default currency cannot be unset; make another currency the default instead',
            ErrorCode.BAD_REQUEST,
            'isDefault',
          ),
        );
      }
      if (dto.isDefault) await this.unsetOtherDefaults(tx, id);
      return tx.currency.update({
        where: { id },
        data: {
          code: dto.code,
          name: dto.name,
          symbol: dto.symbol,
          isDefault: dto.isDefault,
        },
      });
    });
    return ok('Currency updated successfully', currency);
  }

  async remove(id: string) {
    await this.lockedTransaction(async (tx) => {
      // Checked under the lock, so it can't become the default meanwhile.
      const currency = await this.getActive(id, tx);
      if (currency.isDefault) {
        throw new BadRequestException(
          errorBody(
            400,
            'The default currency cannot be deleted; make another currency the default first',
            ErrorCode.BAD_REQUEST,
            'isDefault',
          ),
        );
      }
      // Like categories used by products: a currency used by any (not
      // deleted) purchase invoice can't be deleted.
      const invoices = await tx.purchaseInvoice.count({
        where: { currencyId: id, deletedAt: null },
      });
      if (invoices > 0) {
        throw new BadRequestException(
          `Currency is used by ${invoices} purchase invoice(s) and cannot be deleted`,
        );
      }
      await tx.currency.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
    return ok('Currency deleted successfully', null);
  }
}
