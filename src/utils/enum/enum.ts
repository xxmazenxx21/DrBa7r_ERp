export enum Role {
  SUPERADMIN = 'SUPERADMIN',
  ADMIN = 'ADMIN',
  ACCOUNTANT = 'ACCOUNTANT',
  SALES = 'SALES',
  USER = 'USER',
}

// Product enums come straight from the Prisma schema (single source of truth).
// ItemType: STOCK = مخزني, SERVICE = خدمي
// CostingMethod: WEIGHTED_AVERAGE = متوسط التكلفة المرجح
export { ItemType, CostingMethod } from '../../../generated/prisma/enums.js';
