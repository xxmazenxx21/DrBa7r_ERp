import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../utils/hash/hash';
import { ok } from '../utils/response/response';
import { safeUserSelect } from './user.select';
import { assertNotUsedByDeleted } from '../utils/unique/deleted-unique';
import { resolveUserBranch } from './user-branch';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    await assertNotUsedByDeleted(this.prisma.user, 'user', {
      username: createUserDto.username,
      email: createUserDto.email,
      employeeId: createUserDto.employeeId,
    });
    const branchId = await resolveUserBranch(this.prisma, createUserDto);
    const user = await this.prisma.user.create({
      data: {
        username: createUserDto.username,
        password: await hashPassword(createUserDto.password),
        role: createUserDto.role,
        email: createUserDto.email,
        employeeId: createUserDto.employeeId,
        branchId,
        // lastLoginDate stays null until the first login
      },
      select: safeUserSelect,
    });
    return ok('user created successfully', user);
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      select: safeUserSelect,
    });
    return ok('Users retrieved successfully', users);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: safeUserSelect,
    });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return ok('User retrieved successfully', user);
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const { data: current } = await this.findOne(id);
    await assertNotUsedByDeleted(this.prisma.user, 'user', {
      username: updateUserDto.username,
      email: updateUserDto.email,
      employeeId: updateUserDto.employeeId,
    });
    const branchId = await resolveUserBranch(
      this.prisma,
      updateUserDto,
      current.employeeId,
    );

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        username: updateUserDto.username,
        password: updateUserDto.password
          ? await hashPassword(updateUserDto.password)
          : undefined,
        role: updateUserDto.role,
        email: updateUserDto.email,
        employeeId: updateUserDto.employeeId,
        branchId,
      },
      select: safeUserSelect,
    });
    return ok('User updated successfully', user);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return ok('User deleted successfully', null);
  }
}
