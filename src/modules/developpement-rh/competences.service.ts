import { Injectable, NotFoundException } from '@nestjs/common';
import { Competence, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCompetenceDto } from './dto/create-competence.dto';
import { QueryCompetencesDto } from './dto/query-competences.dto';
import { UpdateCompetenceDto } from './dto/update-competence.dto';

@Injectable()
export class CompetencesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: QueryCompetencesDto): Promise<Competence[]> {
    return this.prisma.competence.findMany({
      where: this.buildWhere(query),
      orderBy: { nomCompetence: 'asc' },
    });
  }

  async findOne(id: number): Promise<Competence> {
    const competence = await this.prisma.competence.findUnique({
      where: { id },
    });

    if (!competence) {
      throw new NotFoundException(`Compétence #${id} introuvable`);
    }

    return competence;
  }

  async create(dto: CreateCompetenceDto): Promise<Competence> {
    await this.assertEmployeExists(dto.employeId);

    return this.prisma.competence.create({
      data: {
        employeId: dto.employeId,
        nomCompetence: dto.nomCompetence,
        niveau: dto.niveau,
        categorie: dto.categorie,
      },
    });
  }

  async update(id: number, dto: UpdateCompetenceDto): Promise<Competence> {
    await this.findOne(id);

    return this.prisma.competence.update({
      where: { id },
      data: {
        nomCompetence: dto.nomCompetence,
        niveau: dto.niveau,
        categorie: dto.categorie,
      },
    });
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.prisma.competence.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private buildWhere(query: QueryCompetencesDto): Prisma.CompetenceWhereInput {
    const where: Prisma.CompetenceWhereInput = {};

    if (query.employe_id !== undefined) where.employeId = query.employe_id;
    if (query.categorie) where.categorie = query.categorie;
    if (query.niveau) where.niveau = query.niveau;

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
