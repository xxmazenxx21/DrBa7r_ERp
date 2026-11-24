-- CreateTable
CREATE TABLE "PurchaseQuotation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "quotationDate" DATE NOT NULL,
    "validUntil" DATE,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "supplierId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "subTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discountValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "convertedToInvoiceId" TEXT,
    "notes" VARCHAR(500),
    "createdBy" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedBy" TEXT,
    "modifiedDate" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PurchaseQuotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseQuotationLine" (
    "id" TEXT NOT NULL,
    "purchaseQuotationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "itemUnitId" TEXT NOT NULL,
    "unitFactor" DECIMAL(18,4) NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "discountPercent" DECIMAL(5,2),
    "discountValue" DECIMAL(18,4),
    "lineTotal" DECIMAL(18,4) NOT NULL,
    "notes" VARCHAR(250),

    CONSTRAINT "PurchaseQuotationLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseQuotation_code_key" ON "PurchaseQuotation"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseQuotation_convertedToInvoiceId_key" ON "PurchaseQuotation"("convertedToInvoiceId");

-- CreateIndex
CREATE INDEX "PurchaseQuotation_supplierId_idx" ON "PurchaseQuotation"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseQuotation_branchId_idx" ON "PurchaseQuotation"("branchId");

-- CreateIndex
CREATE INDEX "PurchaseQuotation_quotationDate_idx" ON "PurchaseQuotation"("quotationDate");

-- CreateIndex
CREATE INDEX "PurchaseQuotationLine_purchaseQuotationId_idx" ON "PurchaseQuotationLine"("purchaseQuotationId");

-- AddForeignKey
ALTER TABLE "PurchaseQuotation" ADD CONSTRAINT "PurchaseQuotation_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseQuotation" ADD CONSTRAINT "PurchaseQuotation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseQuotation" ADD CONSTRAINT "PurchaseQuotation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Inventory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseQuotation" ADD CONSTRAINT "PurchaseQuotation_convertedToInvoiceId_fkey" FOREIGN KEY ("convertedToInvoiceId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseQuotation" ADD CONSTRAINT "PurchaseQuotation_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseQuotation" ADD CONSTRAINT "PurchaseQuotation_modifiedBy_fkey" FOREIGN KEY ("modifiedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseQuotationLine" ADD CONSTRAINT "PurchaseQuotationLine_purchaseQuotationId_fkey" FOREIGN KEY ("purchaseQuotationId") REFERENCES "PurchaseQuotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseQuotationLine" ADD CONSTRAINT "PurchaseQuotationLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseQuotationLine" ADD CONSTRAINT "PurchaseQuotationLine_itemUnitId_fkey" FOREIGN KEY ("itemUnitId") REFERENCES "ItemUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
