-- AlterTable
ALTER TABLE "Currency" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "symbol" TEXT;
