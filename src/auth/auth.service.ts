import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CreateAuthDto } from './dto/create-auth.dto';
import { LoginDto } from './dto/login.dto';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, comparePassword } from '../utils/hash/hash';
import { ok } from '../utils/response/response';
import { safeUserSelect } from '../users/user.select';
import { assertNotUsedByDeleted } from '../utils/unique/deleted-unique';
import { resolveUserBranch } from '../users/user-branch';
import { Role } from '../../generated/prisma/client.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // TEMPORARY: open signup that creates SUPERADMIN accounts. Remove before production.
  async signup(createAuthDto: CreateAuthDto) {
    await assertNotUsedByDeleted(this.prisma.user, 'user', {
      username: createAuthDto.username,
      email: createAuthDto.email,
      employeeId: createAuthDto.employeeId,
    });
    const branchId = await resolveUserBranch(this.prisma, createAuthDto);
    const user = await this.prisma.user.create({
      data: {
        username: createAuthDto.username,
        password: await hashPassword(createAuthDto.password),
        email: createAuthDto.email,
        employeeId: createAuthDto.employeeId,
        branchId,
        role: Role.SUPERADMIN, // always, whatever the client sends
      },
      select: safeUserSelect,
    });
    return ok('User signed up successfully', user);
  }

  /** Used by both POST /auth/login and POST /users/login. */
  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: loginDto.username },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await comparePassword(
      loginDto.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginDate: new Date() },
    });

    const payload = { sub: user.id, username: user.username, role: user.role };

    return ok('Logged in successfully', {
      access_token: await this.jwtService.signAsync(payload),
      user: { id: user.id, username: user.username, role: user.role },
    });
  }
}
