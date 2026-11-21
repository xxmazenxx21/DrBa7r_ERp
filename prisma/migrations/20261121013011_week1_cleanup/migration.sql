/*
  Warnings:

  - You are about to alter the column `quantity` on the `ProductInventory` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,4)`.
  - You are about to alter the column `costPrice` on the `ProductInventory` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(18,4)`.
  - You are about to drop the column `isDeleted` on the `PurchaseInvoice` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Categories" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "ItemUnit" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "ProductInventory" ALTER COLUMN "quantity" SET DEFAULT 0,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "costPrice" SET DEFAULT 0,
ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "PurchaseInvoice" DROP COLUMN "isDeleted";
