-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxNumber" TEXT,
    "commercialRecord" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "creditLimit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "primaryIteamUnitId" TEXT NOT NULL,
    "itemType" INTEGER NOT NULL,
    "costingMethod" INTEGER,
    "retailPrice" DECIMAL(18,4) NOT NULL,
    "wholesalePrice" DECIMAL(18,4) NOT NULL,
    "bulkWholesalePrice" DECIMAL(18,4) NOT NULL,
    "reorderLimit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "hasExpiryDate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductInventory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "costPrice" DECIMAL(65,30) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductInventory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "ProductInventory_productId_inventoryId_key" ON "ProductInventory"("productId", "inventoryId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_primaryIteamUnitId_fkey" FOREIGN KEY ("primaryIteamUnitId") REFERENCES "ItemUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInventory" ADD CONSTRAINT "ProductInventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductInventory" ADD CONSTRAINT "ProductInventory_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
