-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "movementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "StockMovementType" NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "totalCost" DECIMAL(18,2) NOT NULL,
    "balanceAfter" DECIMAL(18,4) NOT NULL,
    "avgCostAfter" DECIMAL(18,4) NOT NULL,
    "sourceType" "DocumentType",
    "sourceId" TEXT,
    "sourceLineId" TEXT,
    "sourceCode" TEXT,
    "reason" VARCHAR(250),
    "createdBy" TEXT NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockMovement_productId_warehouseId_movementDate_idx" ON "StockMovement"("productId", "warehouseId", "movementDate");

-- CreateIndex
CREATE INDEX "StockMovement_sourceType_sourceId_idx" ON "StockMovement"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- Backfill (hand-written): Week 1 stock rows have a quantity but no
-- movements. Rule from now on: ProductInventory.quantity = SUM(movements).
-- 1) Every ACTIVE stock row with a quantity or a cost gets ONE OPENING
--    movement (createdBy = the oldest active SUPERADMIN, else the oldest user).
-- 2) Soft-deleted stock rows are set to quantity 0 (the new DELETE empties the
--    stock first, so a deleted row always has 0). Their cost is kept.
-- =====================================================================
INSERT INTO "StockMovement" (
    "id", "movementDate", "type", "productId", "warehouseId",
    "quantity", "unitCost", "totalCost", "balanceAfter", "avgCostAfter",
    "reason", "createdBy", "createdDate"
)
SELECT
    'backfill-' || pi."id",
    CURRENT_TIMESTAMP,
    'OPENING',
    pi."productId",
    pi."inventoryId",
    pi."quantity",
    pi."costPrice",
    ROUND(pi."quantity" * pi."costPrice", 2),
    pi."quantity",
    pi."costPrice",
    'Week 1 opening balance',
    u."id",
    CURRENT_TIMESTAMP
FROM "ProductInventory" pi
CROSS JOIN (
    SELECT "id" FROM "User"
    ORDER BY ("deletedAt" IS NULL) DESC, ("role" = 'SUPERADMIN') DESC, "createdAt" ASC
    LIMIT 1
) u
WHERE pi."deletedAt" IS NULL
  AND (pi."quantity" <> 0 OR pi."costPrice" <> 0);

UPDATE "ProductInventory"
SET "quantity" = 0
WHERE "deletedAt" IS NOT NULL AND "quantity" <> 0;
