import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Employe, Prisma, StatutEmploye } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { ActiviteService } from '../activite/activite.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmployeDto } from './dto/create-employe.dto';
import { QueryEmployesDto } from './dto/query-employes.dto';
import { UpdateEmployeDto } from './dto/update-employe.dto';
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
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const employe = await this.prisma.employe.findFirst({
      where: { email: user.email, deletedAt: null },
    });

    if (!employe) {
      throw new NotFoundException(
        'Aucun employé associé à ce compte utilisateur',
      );
    }

    return this.ensureMatricule(employe);
  }

  async updateByUserId(
    userId: number,
    dto: UpdateEmployeDto,
  ): Promise<Employe> {
    const employe = await this.findByUserId(userId);
    return this.update(employe.id, dto);
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

    await this.activiteService.log(
      'employe_supprime',
      `Employé ${employe.nom} ${employe.prenom} supprimé`,
      employe.id,
    );

    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.presence.updateMany({
        where: { employeId: id },
        data: { deletedAt: now },
      }),
      this.prisma.absence.updateMany({
        where: { employeId: id },
        data: { deletedAt: now },
      }),
      this.prisma.paie.updateMany({
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
        data: { deletedAt: now },
      }),
    ]);
  }

  async updateAvatar(id: number, file: Express.Multer.File): Promise<Employe> {
    await this.findOne(id);

    if (!file) {
      throw new BadRequestException('Aucun fichier envoyé');
    }

    const uploadsDir = path.join(process.cwd(), 'uploads', 'avatars');

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const ext = path.extname(file.originalname) || '.png';
    const filename = `avatar-${id}-${Date.now()}${ext}`;
    const filepath = path.join(uploadsDir, filename);

    fs.writeFileSync(filepath, file.buffer);

    return this.prisma.employe.update({
      where: { id },
      data: { avatar: `/uploads/avatars/${filename}` },
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
      this.prisma.employe.count(),
      this.prisma.employe.count({ where: { statut: StatutEmploye.actif } }),
      this.prisma.employe.count({ where: { statut: StatutEmploye.inactif } }),
      this.prisma.employe.count({ where: { statut: StatutEmploye.suspendu } }),
      this.prisma.employe.aggregate({
        where: { statut: StatutEmploye.actif },
        _sum: { salaireBase: true },
      }),
      this.prisma.employe.groupBy({
        by: ['departement'],
        _count: { id: true },
        orderBy: { departement: 'asc' },
      }),
      this.prisma.employe.groupBy({
        by: ['typeContrat'],
        where: { typeContrat: { not: null } },
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
      email: dto.email,
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
    if (dto.email !== undefined) data.email = dto.email;
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
