-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentType" ADD VALUE 'SQ';
ALTER TYPE "DocumentType" ADD VALUE 'SI';
ALTER TYPE "DocumentType" ADD VALUE 'SR';
ALTER TYPE "DocumentType" ADD VALUE 'ST';
ALTER TYPE "DocumentType" ADD VALUE 'SC';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'SALE';
ALTER TYPE "StockMovementType" ADD VALUE 'SALE_CANCEL';
ALTER TYPE "StockMovementType" ADD VALUE 'SALE_RETURN';
ALTER TYPE "StockMovementType" ADD VALUE 'SALE_RETURN_CANCEL';
ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFER_OUT';
ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFER_IN';
ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFER_OUT_CANCEL';
ALTER TYPE "StockMovementType" ADD VALUE 'TRANSFER_IN_CANCEL';
