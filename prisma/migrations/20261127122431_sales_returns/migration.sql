-- CreateTable
CREATE TABLE "SalesReturn" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "returnDate" DATE NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" VARCHAR(250),
    "salesInvoiceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "subTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discountValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "refundAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "postedDate" TIMESTAMP(3),
    "postedBy" TEXT,
    "cancelledDate" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "notes" VARCHAR(500),
    "createdBy" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT,
    "modifiedDate" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SalesReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesReturnLine" (
    "id" TEXT NOT NULL,
    "salesReturnId" TEXT NOT NULL,
    "salesInvoiceLineId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "itemUnitId" TEXT NOT NULL,
    "unitFactor" DECIMAL(18,4) NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "baseQuantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "lineTotal" DECIMAL(18,4) NOT NULL,
    "stockUnitCost" DECIMAL(18,4) NOT NULL,
    "lineCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" VARCHAR(250),

    CONSTRAINT "SalesReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesReturn_code_key" ON "SalesReturn"("code");

-- CreateIndex
CREATE INDEX "SalesReturn_customerId_idx" ON "SalesReturn"("customerId");

-- CreateIndex
CREATE INDEX "SalesReturn_salesInvoiceId_idx" ON "SalesReturn"("salesInvoiceId");

-- CreateIndex
CREATE INDEX "SalesReturn_returnDate_idx" ON "SalesReturn"("returnDate");

-- CreateIndex
CREATE INDEX "SalesReturnLine_salesReturnId_idx" ON "SalesReturnLine"("salesReturnId");

-- CreateIndex
CREATE INDEX "SalesReturnLine_salesInvoiceLineId_idx" ON "SalesReturnLine"("salesInvoiceLineId");

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_postedBy_fkey" FOREIGN KEY ("postedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_cancelledBy_fkey" FOREIGN KEY ("cancelledBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_modifiedBy_fkey" FOREIGN KEY ("modifiedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnLine" ADD CONSTRAINT "SalesReturnLine_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "SalesReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnLine" ADD CONSTRAINT "SalesReturnLine_salesInvoiceLineId_fkey" FOREIGN KEY ("salesInvoiceLineId") REFERENCES "SalesInvoiceLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnLine" ADD CONSTRAINT "SalesReturnLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnLine" ADD CONSTRAINT "SalesReturnLine_itemUnitId_fkey" FOREIGN KEY ("itemUnitId") REFERENCES "ItemUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
