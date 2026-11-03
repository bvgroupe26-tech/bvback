import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { plainToInstance } from 'class-transformer';
import { normalizeEmail } from '../../common/employe-link/employe-link';
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
    return this.prisma.user.findFirst({
      where: { email: { equals: normalizeEmail(email), mode: 'insensitive' } },
      orderBy: { id: 'asc' },
    });
  }

  findById(id: number): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByIdOrThrow(id: number): Promise<UserResponseDto> {
    const user = await this.findById(id);

    if (!user) {
      throw new NotFoundException(`Utilisateur #${id} introuvable`);
    }

    const employe = await this.employesService.findEmployeForUser(user);

    return this.toResponse(user, employe?.id ?? null);
  }

  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { id: 'asc' },
    });

    const employes = users.length
      ? await this.prisma.employe.findMany({
          where: { userId: { in: users.map((u) => u.id) } },
          select: { id: true, userId: true },
        })
      : [];
    const byUserId = new Map(employes.map((e) => [e.userId, e.id]));

    return users.map((user) => this.toResponse(user, byUserId.get(user.id) ?? null));
  }

  /** `creatorRole` absent = appel interne (seed, scripts). */
  async create(dto: CreateUserDto, creatorRole?: UserRole): Promise<UserResponseDto> {
    if (creatorRole && !this.canCreateRole(creatorRole, dto.role)) {
      throw new ForbiddenException(
        "Votre rôle ne permet pas de créer ce type de compte",
      );
    }

    const email = normalizeEmail(dto.email);
    const existing = await this.findByEmail(email);

    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.bcryptRounds);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        nom: dto.nom,
        prenom: dto.prenom,
        role: dto.role,
      },
    });

    const employe = await this.employesService.ensureStaffEmployeForUser({
      id: user.id,
      email: user.email,
      nom: user.nom,
      prenom: user.prenom,
      role: user.role,
      salaireBase: dto.salaireBase,
    });

    return this.toResponse(user, employe?.id ?? null);
  }

  async update(id: number, dto: UpdateUserDto): Promise<UserResponseDto> {
    const existing = await this.findById(id);

    if (!existing) {
      throw new NotFoundException(`Utilisateur #${id} introuvable`);
    }

    if (dto.email && normalizeEmail(dto.email) !== existing.email) {
      const emailTaken = await this.findByEmail(dto.email);

      if (emailTaken && emailTaken.id !== id) {
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

    if (dto.email !== undefined) data.email = normalizeEmail(dto.email);
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
    await this.prisma.$transaction([
      this.prisma.employe.updateMany({
        where: { userId: id },
        data: { userId: null },
      }),
      this.prisma.user.update({
        where: { id },
        data: { email: archivedEmail, deletedAt: new Date() },
      }),
    ]);
  }

  async updateLastLogin(id: number): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLogin: new Date() },
    });
  }

  async ensureEmployeForUser(id: number): Promise<{ employe_id: number }> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException(`Utilisateur #${id} introuvable`);

    const employe = await this.employesService.ensureStaffEmployeForUser({
      id: user.id,
      email: user.email,
      nom: user.nom,
      prenom: user.prenom,
      role: user.role,
    });

    if (!employe) {
      throw new BadRequestException(
        "Ce compte n'est pas un rôle staff (admin/rh/manager)",
      );
    }

    return { employe_id: employe.id };
  }

  toResponse(user: User, employe_id: number | null = null): UserResponseDto {
    const dto = plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
    dto.employe_id = employe_id;
    return dto;
  }

  private canCreateRole(creatorRole: UserRole, targetRole: UserRole): boolean {
    if (creatorRole === USER_ROLE.admin) return true;
    if (creatorRole === USER_ROLE.rh) {
      return targetRole === USER_ROLE.rh || targetRole === USER_ROLE.manager;
    }
    return false;
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
