-- CreateTable
CREATE TABLE "ProductUnit" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "itemUnitId" TEXT NOT NULL,
    "factor" DECIMAL(18,4) NOT NULL,
    "barcode" TEXT,
    "retailPrice" DECIMAL(18,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductUnit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductUnit_barcode_key" ON "ProductUnit"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "ProductUnit_productId_itemUnitId_key" ON "ProductUnit"("productId", "itemUnitId");

-- AddForeignKey
ALTER TABLE "ProductUnit" ADD CONSTRAINT "ProductUnit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnit" ADD CONSTRAINT "ProductUnit_itemUnitId_fkey" FOREIGN KEY ("itemUnitId") REFERENCES "ItemUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
