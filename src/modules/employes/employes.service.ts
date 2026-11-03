import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Employe, Prisma, StatutEmploye, UserRole } from '@prisma/client';
import * as path from 'path';
import { ActiviteService } from '../activite/activite.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  findEmployeForUser,
  normalizeEmail,
} from '../../common/employe-link/employe-link';
import { SupabaseStorageService } from '../supabase/supabase-storage.service';
import { CreateEmployeDto } from './dto/create-employe.dto';
import { QueryEmployesDto } from './dto/query-employes.dto';
import { UpdateEmployeDto } from './dto/update-employe.dto';
import { UpdateEmployeMeDto } from './dto/update-employe-me.dto';
import {
  ContratCount,
  DepartementCount,
  EmployesStatsResponse,
} from './types/employes-stats.type';

@Injectable()
export class EmployesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activiteService: ActiviteService,
    private readonly supabaseStorage: SupabaseStorageService,
  ) {}

  findAll(query: QueryEmployesDto): Promise<Employe[]> {
    const where = this.buildWhere(query);
    const orderBy = this.buildOrderBy(query.sort);

    return this.prisma.employe.findMany({
      where,
      orderBy,
      ...(query.limit ? { take: query.limit } : {}),
    });
  }

  async findOne(id: number): Promise<Employe> {
    const employe = await this.prisma.employe.findUnique({ where: { id } });

    if (!employe) {
      throw new NotFoundException(`Employé #${id} introuvable`);
    }

    return this.ensureMatricule(employe);
  }

  async findByUserId(userId: number): Promise<Employe> {
    const employe = await findEmployeForUser(this.prisma, { id: userId });

    if (!employe) {
      throw new NotFoundException(
        'Aucun employé associé à ce compte utilisateur',
      );
    }

    return this.ensureMatricule(employe);
  }

  /** Lecture seule (hors rattachement par email) : ne crée jamais de fiche. */
  findEmployeForUser(user: { id: number; email?: string | null }): Promise<Employe | null> {
    return findEmployeForUser(this.prisma, user);
  }

  /** À appeler à la création d'un compte staff : retrouve ou crée sa fiche liée. */
  async ensureStaffEmployeForUser(user: {
    id: number;
    email: string;
    nom: string;
    prenom: string;
    role: UserRole;
    salaireBase?: number;
  }): Promise<Employe | null> {
    const existing = await findEmployeForUser(this.prisma, user);

    if (existing) {
      return existing;
    }

    if (!this.isStaffRole(user.role)) {
      return null;
    }

    return this.createStaffEmployeFromUser(user);
  }

  async listPostesReferentiel(): Promise<string[]> {
    await this.syncPostesFromEmployes();
    const rows = await this.prisma.posteReferentiel.findMany({
      orderBy: { label: 'asc' },
    });
    return rows.map((row) => row.label);
  }

  async addPosteReferentiel(label: string): Promise<string[]> {
    const normalized = this.normalizePosteLabel(label);
    if (!normalized) {
      throw new BadRequestException('Libellé de poste invalide');
    }

    try {
      await this.prisma.posteReferentiel.create({ data: { label: normalized } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ce poste existe déjà');
      }
      throw error;
    }

    return this.listPostesReferentiel();
  }

  async removePosteReferentiel(label: string): Promise<string[]> {
    const normalized = this.normalizePosteLabel(label);
    if (!normalized) {
      throw new BadRequestException('Libellé de poste invalide');
    }

    await this.prisma.posteReferentiel.deleteMany({
      where: { label: normalized },
    });

    return this.listPostesReferentiel();
  }

  async updateByUserId(
    userId: number,
    dto: UpdateEmployeMeDto,
  ): Promise<Employe> {
    const employe = await this.findByUserId(userId);
    return this.prisma.employe.update({
      where: { id: employe.id },
      data: {
        telephone: dto.telephone,
        adresse: dto.adresse,
        situationFamiliale: dto.situationFamiliale,
      },
    });
  }

  async updateAvatarByUserId(
    userId: number,
    file: Express.Multer.File,
  ): Promise<Employe> {
    const employe = await this.findByUserId(userId);
    return this.updateAvatar(employe.id, file);
  }

  async create(dto: CreateEmployeDto): Promise<Employe> {
    const employe = await this.prisma.employe.create({
      data: this.toCreateInput(dto),
    });
    return this.ensureMatricule(employe);
  }

  async update(id: number, dto: UpdateEmployeDto): Promise<Employe> {
    await this.findOne(id);

    return this.prisma.employe.update({
      where: { id },
      data: this.toUpdateInput(dto),
    });
  }

  async remove(id: number): Promise<void> {
    const employe = await this.findOne(id);
    const now = new Date();

    // Les bulletins de paie ne sont pas archivés : conservation légale de l'historique salarial.
    await this.prisma.$transaction([
      this.prisma.presence.updateMany({
        where: { employeId: id },
        data: { deletedAt: now },
      }),
      this.prisma.absence.updateMany({
        where: { employeId: id },
        data: { deletedAt: now },
      }),
      this.prisma.competence.updateMany({
        where: { employeId: id },
        data: { deletedAt: now },
      }),
      this.prisma.formation.updateMany({
        where: { employeId: id },
        data: { deletedAt: now },
      }),
      this.prisma.evaluation.updateMany({
        where: { employeId: id },
        data: { deletedAt: now },
      }),
      this.prisma.activiteLog.updateMany({
        where: { employeId: id },
        data: { deletedAt: now },
      }),
      this.prisma.employe.update({
        where: { id },
        data: { deletedAt: now, userId: null },
      }),
    ]);

    // Journalisé après l'archivage, sans employeId, pour ne pas être masqué avec les logs de la fiche.
    await this.activiteService.log(
      'employe_supprime',
      `Employé ${employe.nom} ${employe.prenom} supprimé`,
      null,
      { employeId: employe.id, matricule: employe.matricule },
    );
  }

  private static readonly SAFE_IMAGE_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };

  async updateAvatar(id: number, file: Express.Multer.File): Promise<Employe> {
    await this.findOne(id);

    if (!file) {
      throw new BadRequestException('Aucun fichier envoyé');
    }

    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const mimetype =
      EmployesService.SAFE_IMAGE_TYPES[ext] ?? 'image/jpeg';
    const filename = `avatar-${id}-${Date.now()}${ext}`;

    const publicUrl = await this.supabaseStorage.uploadAvatar(
      file.buffer,
      filename,
      mimetype,
    );

    return this.prisma.employe.update({
      where: { id },
      data: { avatar: publicUrl },
    });
  }

  async getStats(): Promise<EmployesStatsResponse> {
    const [
      total,
      actifs,
      inactifs,
      suspendus,
      masseAgg,
      departementGroups,
      contratGroups,
    ] = await Promise.all([
      this.prisma.employe.count({ where: { deletedAt: null } }),
      this.prisma.employe.count({ where: { statut: StatutEmploye.actif, deletedAt: null } }),
      this.prisma.employe.count({ where: { statut: StatutEmploye.inactif, deletedAt: null } }),
      this.prisma.employe.count({ where: { statut: StatutEmploye.suspendu, deletedAt: null } }),
      this.prisma.employe.aggregate({
        where: { statut: StatutEmploye.actif, deletedAt: null },
        _sum: { salaireBase: true },
      }),
      this.prisma.employe.groupBy({
        by: ['departement'],
        where: { deletedAt: null },
        _count: { id: true },
        orderBy: { departement: 'asc' },
      }),
      this.prisma.employe.groupBy({
        by: ['typeContrat'],
        where: { typeContrat: { not: null }, deletedAt: null },
        _count: { id: true },
        orderBy: { typeContrat: 'asc' },
      }),
    ]);

    const parDepartement: DepartementCount[] = departementGroups.map((row) => ({
      departement: row.departement ?? 'Non renseigné',
      count: row._count.id,
    }));

    const parContrat: ContratCount[] = contratGroups
      .filter((row) => row.typeContrat !== null)
      .map((row) => ({
        typeContrat: row.typeContrat!,
        count: row._count.id,
      }));

    return {
      total,
      actifs,
      inactifs,
      suspendus,
      parDepartement,
      parContrat,
      masseSalariale: masseAgg._sum.salaireBase ?? 0,
    };
  }

  private buildWhere(query: QueryEmployesDto): Prisma.EmployeWhereInput {
    const conditions: Prisma.EmployeWhereInput[] = [{ deletedAt: null }];

    if (query.search?.trim()) {
      const term = query.search.trim();
      conditions.push({
        OR: [
          { nom: { contains: term, mode: 'insensitive' } },
          { prenom: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { poste: { contains: term, mode: 'insensitive' } },
        ],
      });
    }

    if (query.departement) {
      conditions.push({ departement: query.departement });
    }

    if (query.type_contrat) {
      conditions.push({ typeContrat: query.type_contrat });
    }

    if (query.statut) {
      conditions.push({ statut: query.statut });
    }

    if (conditions.length === 0) {
      return {};
    }

    return { AND: conditions };
  }

  private buildOrderBy(
    sort?: QueryEmployesDto['sort'],
  ): Prisma.EmployeOrderByWithRelationInput | Prisma.EmployeOrderByWithRelationInput[] {
    switch (sort) {
      case 'recent':
        return { createdAt: 'desc' };
      case 'date_embauche':
        return { dateEmbauche: 'asc' };
      case 'salaire_base':
        return { salaireBase: 'asc' };
      case 'nom':
      default:
        return [{ nom: 'asc' }, { prenom: 'asc' }];
    }
  }

  private toCreateInput(dto: CreateEmployeDto): Prisma.EmployeCreateInput {
    return {
      matricule: dto.matricule,
      nom: dto.nom,
      prenom: dto.prenom,
      dateNaissance: dto.dateNaissance ? new Date(dto.dateNaissance) : undefined,
      telephone: dto.telephone,
      email: normalizeEmail(dto.email),
      adresse: dto.adresse,
      situationFamiliale: dto.situationFamiliale,
      nombreEnfants: dto.nombreEnfants,
      typeContrat: dto.typeContrat,
      poste: dto.poste,
      departement: dto.departement,
      dateEmbauche: dto.dateEmbauche ? new Date(dto.dateEmbauche) : undefined,
      dateFinContrat: dto.dateFinContrat
        ? new Date(dto.dateFinContrat)
        : undefined,
      statut: dto.statut,
      salaireBase: dto.salaireBase,
      defPrimeTransport: dto.defPrimeTransport,
      defPrimeLogement: dto.defPrimeLogement,
      defPrimePerformance: dto.defPrimePerformance,
      defAutresPrimes: dto.defAutresPrimes,
      defTauxCnss: dto.defTauxCnss,
      defTauxImpot: dto.defTauxImpot,
    };
  }

  private toUpdateInput(dto: UpdateEmployeDto): Prisma.EmployeUpdateInput {
    const data: Prisma.EmployeUpdateInput = {};

    if (dto.matricule !== undefined) data.matricule = dto.matricule;
    if (dto.nom !== undefined) data.nom = dto.nom;
    if (dto.prenom !== undefined) data.prenom = dto.prenom;
    if (dto.dateNaissance !== undefined) {
      data.dateNaissance = dto.dateNaissance
        ? new Date(dto.dateNaissance)
        : null;
    }
    if (dto.telephone !== undefined) data.telephone = dto.telephone;
    if (dto.email !== undefined) data.email = normalizeEmail(dto.email);
    if (dto.adresse !== undefined) data.adresse = dto.adresse;
    if (dto.situationFamiliale !== undefined) {
      data.situationFamiliale = dto.situationFamiliale;
    }
    if (dto.nombreEnfants !== undefined) data.nombreEnfants = dto.nombreEnfants;
    if (dto.typeContrat !== undefined) data.typeContrat = dto.typeContrat;
    if (dto.poste !== undefined) data.poste = dto.poste;
    if (dto.departement !== undefined) data.departement = dto.departement;
    if (dto.dateEmbauche !== undefined) {
      data.dateEmbauche = dto.dateEmbauche ? new Date(dto.dateEmbauche) : null;
    }
    if (dto.dateFinContrat !== undefined) {
      data.dateFinContrat = dto.dateFinContrat
        ? new Date(dto.dateFinContrat)
        : null;
    }
    if (dto.statut !== undefined) data.statut = dto.statut;
    if (dto.salaireBase !== undefined) data.salaireBase = dto.salaireBase;
    if (dto.defPrimeTransport !== undefined) {
      data.defPrimeTransport = dto.defPrimeTransport;
    }
    if (dto.defPrimeLogement !== undefined) {
      data.defPrimeLogement = dto.defPrimeLogement;
    }
    if (dto.defPrimePerformance !== undefined) {
      data.defPrimePerformance = dto.defPrimePerformance;
    }
    if (dto.defAutresPrimes !== undefined) data.defAutresPrimes = dto.defAutresPrimes;
    if (dto.defTauxCnss !== undefined) data.defTauxCnss = dto.defTauxCnss;
    if (dto.defTauxImpot !== undefined) data.defTauxImpot = dto.defTauxImpot;

    return data;
  }

  private isStaffRole(role: UserRole): boolean {
    return (
      role === UserRole.admin ||
      role === UserRole.rh ||
      role === UserRole.manager
    );
  }

  private normalizePosteLabel(value: string): string | null {
    const label = value.trim().replace(/\s+/g, ' ');
    return label.length >= 2 ? label : null;
  }

  private async syncPostesFromEmployes(): Promise<void> {
    const rows = await this.prisma.employe.findMany({
      where: { poste: { not: null }, deletedAt: null },
      select: { poste: true },
      distinct: ['poste'],
    });

    for (const row of rows) {
      const label = row.poste ? this.normalizePosteLabel(row.poste) : null;
      if (!label) continue;
      await this.prisma.posteReferentiel.upsert({
        where: { label },
        create: { label },
        update: {},
      });
    }
  }

  private async createStaffEmployeFromUser(user: {
    id: number;
    email: string;
    nom: string;
    prenom: string;
    role: UserRole;
    salaireBase?: number;
  }): Promise<Employe> {
    const posteByRole: Partial<Record<UserRole, string>> = {
      [UserRole.rh]: 'Responsable RH',
      [UserRole.manager]: 'Manager',
      [UserRole.admin]: 'Administrateur',
    };

    const employe = await this.prisma.employe.create({
      data: {
        nom: user.nom,
        prenom: user.prenom,
        email: normalizeEmail(user.email),
        userId: user.id,
        poste: posteByRole[user.role] ?? 'Collaborateur',
        departement: 'RH',
        typeContrat: 'CDI',
        dateEmbauche: new Date(),
        statut: StatutEmploye.actif,
        salaireBase: user.salaireBase ?? 0,
      },
    });

    await this.activiteService.log(
      'employe_ajout',
      `Fiche employé liée au compte ${user.role} : ${user.prenom} ${user.nom}`,
      employe.id,
    );

    return this.ensureMatricule(employe);
  }

  private formatMatricule(id: number): string {
    return `EMP-${String(id).padStart(6, '0')}`;
  }

  private async ensureMatricule(employe: Employe): Promise<Employe> {
    if (employe.matricule) {
      return employe;
    }

    return this.prisma.employe.update({
      where: { id: employe.id },
      data: { matricule: this.formatMatricule(employe.id) },
    });
  }
}
