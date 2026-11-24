import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertExists } from '../utils/exists/assert-exists';
import { ErrorCode, errorBody } from '../utils/errors/error-codes';

interface UserLinkInput {
  employeeId?: string | null;
  branchId?: string | null;
}

/**
 * Validates a user's employeeId / branchId and returns the branchId to save
 * (undefined = leave it unchanged).
 * - A missing OR soft-deleted employeeId / branchId -> 400 DOES_NOT_EXIST.
 * - A user linked to an employee must be in the employee's branch:
 *   employeeId sent without branchId -> branchId is taken from the employee;
 *   a different branchId -> 400 "branchId must match the employee's branch".
 * On update pass the stored employeeId as `currentEmployeeId`, so changing only
 * branchId is checked against the employee the user already has.
 * `null` unlinks (employeeId) / clears (branchId).
 */
export async function resolveUserBranch(
  prisma: PrismaService,
  input: UserLinkInput,
  currentEmployeeId: string | null = null,
): Promise<string | null | undefined> {
  const { employeeId, branchId } = input;
  if (employeeId === undefined && branchId === undefined) return undefined;

  if (branchId) await assertExists(prisma.branch, 'branchId', branchId);

  let employeeBranchId: string | null = null;
  if (employeeId) {
    const employee = await assertExists(
      prisma.employee,
      'employeeId',
      employeeId,
    );
    employeeBranchId = employee.branchId;
  } else if (employeeId === undefined && currentEmployeeId) {
    // Only branchId changes: compare with the employee already linked.
    const current = await prisma.employee.findUnique({
      where: { id: currentEmployeeId },
      select: { branchId: true },
    });
    employeeBranchId = current?.branchId ?? null;
  }

  if (employeeBranchId === null) return branchId; // no employee: free choice
  if (branchId === undefined) return employeeBranchId; // filled from employee
  if (branchId !== employeeBranchId) {
    throw new BadRequestException(
      errorBody(
        400,
        "branchId must match the employee's branch",
        ErrorCode.BAD_REQUEST,
        'branchId',
      ),
    );
  }
  return branchId;
}
