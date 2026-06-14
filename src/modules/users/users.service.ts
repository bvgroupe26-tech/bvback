import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../../prisma/prisma.service';
import { USER_ROLE, type UserRole } from '../../prisma/user-role';
import { EmployesService } from '../employes/employes.service';

type User = NonNullable<
  Awaited<ReturnType<PrismaService['user']['findFirst']>>
>;
type UserUpdateInput = Parameters<PrismaService['user']['update']>[0]['data'];
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class UsersService {
  private readonly bcryptRounds = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly employesService: EmployesService,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { email } });
  }

  findById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByIdOrThrow(id: number): Promise<UserResponseDto> {
    const user = await this.findById(id);

    if (!user) {
      throw new NotFoundException(`Utilisateur #${id} introuvable`);
    }

    return this.toResponse(user);
  }

  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { id: 'asc' },
    });

    return users.map((user) => this.toResponse(user));
  }

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const existing = await this.findByEmail(dto.email);

    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        nom: dto.nom,
        prenom: dto.prenom,
        role: dto.role,
      },
    });

    await this.employesService.ensureStaffEmployeForUser({
      email: user.email,
      nom: user.nom,
      prenom: user.prenom,
      role: user.role,
      salaireBase: dto.salaireBase,
    });

    return this.toResponse(user);
  }

  async update(id: number, dto: UpdateUserDto): Promise<UserResponseDto> {
    const existing = await this.findById(id);

    if (!existing) {
      throw new NotFoundException(`Utilisateur #${id} introuvable`);
    }

    if (dto.email && dto.email !== existing.email) {
      const emailTaken = await this.findByEmail(dto.email);

      if (emailTaken) {
        throw new ConflictException('Cet email est déjà utilisé');
      }
    }

    if (dto.role && dto.role !== existing.role) {
      await this.assertCanChangeAdminRole(existing, dto.role);
    }

    if (dto.isActive === false) {
      await this.assertCanDeactivateUser(existing);
    }

    const data: UserUpdateInput = {};

    if (dto.email !== undefined) data.email = dto.email;
    if (dto.nom !== undefined) data.nom = dto.nom;
    if (dto.prenom !== undefined) data.prenom = dto.prenom;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
    });

    return this.toResponse(user);
  }

  async remove(id: number): Promise<void> {
    const user = await this.findById(id);

    if (!user) {
      throw new NotFoundException(`Utilisateur #${id} introuvable`);
    }

    if (user.role === USER_ROLE.admin) {
      const adminCount = await this.prisma.user.count({
        where: { role: USER_ROLE.admin },
      });

      if (adminCount <= 1) {
        throw new ForbiddenException(
          'Impossible de supprimer le dernier administrateur',
        );
      }
    }

    const archivedEmail = `archived+user${id}+${Date.now()}@bvgroupe.invalid`;
    await this.prisma.user.update({
      where: { id },
      data: { email: archivedEmail, deletedAt: new Date() },
    });
  }

  async updateLastLogin(id: number): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLogin: new Date() },
    });
  }

  toResponse(user: User): UserResponseDto {
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  private async assertCanDeactivateUser(user: User): Promise<void> {
    if (user.role !== USER_ROLE.admin) {
      return;
    }

    const activeAdminCount = await this.prisma.user.count({
      where: { role: USER_ROLE.admin, isActive: true },
    });

    if (activeAdminCount <= 1) {
      throw new ForbiddenException(
        'Impossible de désactiver le dernier administrateur actif',
      );
    }
  }

  private async assertCanChangeAdminRole(
    user: User,
    newRole: UserRole,
  ): Promise<void> {
    if (user.role !== USER_ROLE.admin || newRole === USER_ROLE.admin) {
      return;
    }

    const adminCount = await this.prisma.user.count({
      where: { role: USER_ROLE.admin },
    });

    if (adminCount <= 1) {
      throw new ForbiddenException(
        'Impossible de rétrograder le dernier administrateur',
      );
    }
  }
}
