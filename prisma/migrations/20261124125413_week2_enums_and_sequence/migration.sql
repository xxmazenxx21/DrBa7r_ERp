-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('CASH', 'CREDIT');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CONVERTED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PQ', 'PI', 'PR');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('OPENING', 'ADJUSTMENT', 'PURCHASE', 'PURCHASE_CANCEL', 'PURCHASE_RETURN', 'PURCHASE_RETURN_CANCEL');

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "id" TEXT NOT NULL,
    "docType" "DocumentType" NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSequence_docType_year_key" ON "DocumentSequence"("docType", "year");
