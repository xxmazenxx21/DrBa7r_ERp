-- Week 1: naming fixes + Product enums. Hand-written so existing data is KEPT
-- (Prisma's draft dropped and re-created columns). Renames, not drops.

-- 1) Role: ACCOUNTENT -> ACCOUNTANT (existing users keep their role)
ALTER TYPE "Role" RENAME VALUE 'ACCOUNTENT' TO 'ACCOUNTANT';

-- 2) Product.primaryIteamUnitId -> primaryItemUnitId (values and FK kept)
ALTER TABLE "Product" RENAME COLUMN "primaryIteamUnitId" TO "primaryItemUnitId";
ALTER TABLE "Product" RENAME CONSTRAINT "Product_primaryIteamUnitId_fkey" TO "Product_primaryItemUnitId_fkey";

-- 3) New enums
CREATE TYPE "ItemType" AS ENUM ('STOCK', 'SERVICE');
CREATE TYPE "CostingMethod" AS ENUM ('WEIGHTED_AVERAGE');

-- 4) Product.itemType Int -> ItemType: 2 -> SERVICE, anything else -> STOCK
ALTER TABLE "Product"
  ALTER COLUMN "itemType" TYPE "ItemType"
  USING (CASE WHEN "itemType" = 2 THEN 'SERVICE' ELSE 'STOCK' END)::"ItemType";
ALTER TABLE "Product" ALTER COLUMN "itemType" SET DEFAULT 'STOCK';

-- 5) Product.costingMethod Int? -> CostingMethod (required): every row -> WEIGHTED_AVERAGE
ALTER TABLE "Product"
  ALTER COLUMN "costingMethod" TYPE "CostingMethod"
  USING 'WEIGHTED_AVERAGE'::"CostingMethod";
ALTER TABLE "Product" ALTER COLUMN "costingMethod" SET DEFAULT 'WEIGHTED_AVERAGE';
ALTER TABLE "Product" ALTER COLUMN "costingMethod" SET NOT NULL;
