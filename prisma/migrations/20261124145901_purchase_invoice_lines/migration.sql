-- Task 7: purchase invoices get an API, lines and enum statuses.
-- Hand-written: status / paymentType are converted IN PLACE (Prisma's draft
-- dropped and re-created them). The table never had an API, so it is expected
-- to be empty; the CASE mappings only matter if someone inserted rows by hand
-- (old ints: paymentType 1 = cash, 2 = credit; status 3 = posted, 4 = cancelled).

-- status: Int -> DocumentStatus (default DRAFT)
ALTER TABLE "PurchaseInvoice" ALTER COLUMN "status" TYPE "DocumentStatus"
  USING (CASE "status" WHEN 3 THEN 'POSTED' WHEN 4 THEN 'CANCELLED' ELSE 'DRAFT' END)::"DocumentStatus";
ALTER TABLE "PurchaseInvoice" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- paymentType: Int -> PaymentType
ALTER TABLE "PurchaseInvoice" ALTER COLUMN "paymentType" TYPE "PaymentType"
  USING (CASE "paymentType" WHEN 2 THEN 'CREDIT' ELSE 'CASH' END)::"PaymentType";

-- isPosted is replaced by status
ALTER TABLE "PurchaseInvoice" DROP COLUMN "isPosted";

-- new columns
ALTER TABLE "PurchaseInvoice"
  ADD COLUMN "cancelledBy" TEXT,
  ADD COLUMN "cancelledDate" TIMESTAMP(3),
  ADD COLUMN "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ALTER COLUMN "subTotal" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "PurchaseInvoiceLine" (
    "id" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "itemUnitId" TEXT NOT NULL,
    "unitFactor" DECIMAL(18,4) NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "baseQuantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "discountPercent" DECIMAL(5,2),
    "discountValue" DECIMAL(18,4),
    "lineTotal" DECIMAL(18,4) NOT NULL,
    "stockUnitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "batchNumber" VARCHAR(50),
    "expiryDate" DATE,
    "notes" VARCHAR(250),

    CONSTRAINT "PurchaseInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseInvoiceLine_purchaseInvoiceId_idx" ON "PurchaseInvoiceLine"("purchaseInvoiceId");
CREATE INDEX "PurchaseInvoice_supplierId_idx" ON "PurchaseInvoice"("supplierId");
CREATE INDEX "PurchaseInvoice_branchId_idx" ON "PurchaseInvoice"("branchId");
CREATE INDEX "PurchaseInvoice_invoiceDate_idx" ON "PurchaseInvoice"("invoiceDate");

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_cancelledBy_fkey" FOREIGN KEY ("cancelledBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_itemUnitId_fkey" FOREIGN KEY ("itemUnitId") REFERENCES "ItemUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
