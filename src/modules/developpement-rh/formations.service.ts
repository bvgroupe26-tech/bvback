import { Injectable, NotFoundException } from '@nestjs/common';
import { Formation, Prisma, TypeFormation } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFormationDto } from './dto/create-formation.dto';
import { QueryFormationsDto } from './dto/query-formations.dto';
import { UpdateFormationDto } from './dto/update-formation.dto';

@Injectable()
export class FormationsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: QueryFormationsDto): Promise<Formation[]> {
    return this.prisma.formation.findMany({
      where: this.buildWhere(query),
      include: { employe: { select: { nom: true, prenom: true, poste: true } } },
      orderBy: { dateObtention: 'desc' },
    });
  }

  async findOne(id: number): Promise<Formation> {
    const formation = await this.prisma.formation.findUnique({
      where: { id },
    });

    if (!formation) {
      throw new NotFoundException(`Formation #${id} introuvable`);
    }

    return formation;
  }

  async create(dto: CreateFormationDto): Promise<Formation> {
    await this.assertEmployeExists(dto.employeId);

    return this.prisma.formation.create({
      data: {
        employeId: dto.employeId,
        titre: dto.titre,
        type: dto.type ?? TypeFormation.formation,
        organisme: dto.organisme,
        dateObtention: dto.dateObtention
          ? new Date(dto.dateObtention)
          : new Date(),
        dateExpiration: dto.dateExpiration
          ? new Date(dto.dateExpiration)
          : null,
        fichierPath: dto.fichierPath,
      },
    });
  }

  async update(id: number, dto: UpdateFormationDto): Promise<Formation> {
    await this.findOne(id);

    const data: Prisma.FormationUpdateInput = {};

    if (dto.titre !== undefined) data.titre = dto.titre;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.organisme !== undefined) data.organisme = dto.organisme;
    if (dto.dateObtention !== undefined) {
      data.dateObtention = new Date(dto.dateObtention);
    }
    if (dto.dateExpiration !== undefined) {
      data.dateExpiration = dto.dateExpiration
        ? new Date(dto.dateExpiration)
        : null;
    }
    if (dto.fichierPath !== undefined) data.fichierPath = dto.fichierPath;

    return this.prisma.formation.update({
      where: { id },
      data,
    });
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.prisma.formation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private buildWhere(query: QueryFormationsDto): Prisma.FormationWhereInput {
    const where: Prisma.FormationWhereInput = {};

    if (query.employe_id !== undefined) where.employeId = query.employe_id;
    if (query.type) where.type = query.type;

    return where;
  }

  private async assertEmployeExists(employeId: number): Promise<void> {
    const employe = await this.prisma.employe.findUnique({
      where: { id: employeId },
    });

    if (!employe) {
      throw new NotFoundException(`Employé #${employeId} introuvable`);
    }
  }
}
