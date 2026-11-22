import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Query string for list endpoints that can be filtered by branch: ?branchId=... */
export class BranchFilterDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  branchId?: string;
}
