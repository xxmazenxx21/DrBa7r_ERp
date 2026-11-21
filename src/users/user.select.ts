import { Prisma } from '../../generated/prisma/client.js';

/** Every user field except `password`. Use it in every query that returns a user. */
export const safeUserSelect = {
  id: true,
  username: true,
  email: true,
  role: true,
  employeeId: true,
  branchId: true,
  lastLoginDate: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;
