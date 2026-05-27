import { Injectable, NotFoundException } from '@nestjs/common';
import { Evaluation, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { QueryEvaluationsDto } from './dto/query-evaluations.dto';

@Injectable()
export class EvaluationsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: QueryEvaluationsDto): Promise<Evaluation[]> {
    return this.prisma.evaluation.findMany({
      where: this.buildWhere(query),
      orderBy: { dateEvaluation: 'desc' },
    });
  }

  async findOne(id: number): Promise<Evaluation> {
    const evaluation = await this.prisma.evaluation.findUnique({
      where: { id },
    });

    if (!evaluation) {
      throw new NotFoundException(`Évaluation #${id} introuvable`);
    }

    return evaluation;
  }

  async create(dto: CreateEvaluationDto): Promise<Evaluation> {
    await this.assertEmployeExists(dto.employeId);

    const noteGlobale = this.calcNoteGlobale(
      dto.ponctualite,
      dto.qualiteTravail,
      dto.travailEquipe,
      dto.initiative,
    );

    return this.prisma.evaluation.create({
      data: {
        employeId: dto.employeId,
        periode: dto.periode,
        ponctualite: dto.ponctualite,
        qualiteTravail: dto.qualiteTravail,
        travailEquipe: dto.travailEquipe,
        initiative: dto.initiative,
        noteGlobale,
        commentaire: dto.commentaire,
        evaluateur: dto.evaluateur,
      },
    });
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.prisma.evaluation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  calcNoteGlobale(
    ponctualite: number,
    qualiteTravail: number,
    travailEquipe: number,
    initiative: number,
  ): number {
    return parseFloat(
      ((ponctualite + qualiteTravail + travailEquipe + initiative) / 4).toFixed(
        2,
      ),
    );
  }

  private buildWhere(query: QueryEvaluationsDto): Prisma.EvaluationWhereInput {
    const where: Prisma.EvaluationWhereInput = {};

    if (query.employe_id !== undefined) where.employeId = query.employe_id;
    if (query.periode) where.periode = query.periode;

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
