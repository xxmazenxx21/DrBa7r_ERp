import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { comparePassword, hashPassword } from '../utils/hash/hash';
import { LoginUserDto } from './dto/login.user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService,
    private readonly jwtService: JwtService) { }

  async create(createUserDto: CreateUserDto) {


    const password = await hashPassword(createUserDto.password);
    await this.prisma.user.create({
      data: {
        username: createUserDto.username,
        password: password,
        role: createUserDto.role as any,
        email: createUserDto.email,
        employeeId: createUserDto.employeeId,
        branchId: createUserDto.branchId,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginDate: new Date(),
      }
    })
    return { message: "user created successfully" };
  }





  async login(loginUserDto: LoginUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: loginUserDto.username, deletedAt: null }
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.deletedAt != null) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const isPasswordValid = await comparePassword(loginUserDto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }


    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginDate: new Date() }
    });

    const payload = { sub: user.id, username: user.username, role: user.role };

    return {
      access_token: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    };
  }


  async findAll() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        employeeId: true,
        branchId: true,
        lastLoginDate: true,
        createdAt: true,
        updatedAt: true
      }
    });
    return { data: users, message: "Users retrieved successfully" };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        employeeId: true,
        branchId: true,
        lastLoginDate: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    return { data: user, message: "User retrieved successfully" };
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const existingUser = await this.prisma.user.findFirst({
      where: { id, deletedAt: null }
    });
    if (!existingUser) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    const updateData: any = { ...updateUserDto };

    if (updateData.role) {
      updateData.role = updateData.role as any;
    }

    updateData.updatedAt = new Date();

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        employeeId: true,
        branchId: true,
        lastLoginDate: true,
        createdAt: true,
        updatedAt: true
      }
    });
    return { message: "User updated successfully" };
  }

  async remove(id: string) {
    const existingUser = await this.prisma.user.findFirst({
      where: { id, deletedAt: null }
    });
    if (!existingUser) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    await this.prisma.user.update({
      where: { id },
      data: {

        deletedAt: new Date()
      }
    });
    return { message: "User deleted successfully" };
  }
}
