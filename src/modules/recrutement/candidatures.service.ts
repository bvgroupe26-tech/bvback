import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatutCandidature } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCandidatureDto } from './dto/create-candidature.dto';
import { QueryCandidaturesDto } from './dto/query-candidatures.dto';
import { UpdateCandidatureDto } from './dto/update-candidature.dto';
import {
  CandidatureWithOffre,
  candidatureWithOffreInclude,
} from './types/recrutement.types';

@Injectable()
export class CandidaturesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: QueryCandidaturesDto): Promise<CandidatureWithOffre[]> {
    return this.prisma.candidature.findMany({
      where: this.buildWhere(query),
      include: candidatureWithOffreInclude,
      orderBy: { dateCandidature: 'desc' },
    });
  }

  async findOne(id: number): Promise<CandidatureWithOffre> {
    const candidature = await this.prisma.candidature.findUnique({
      where: { id },
      include: candidatureWithOffreInclude,
    });

    if (!candidature) {
      throw new NotFoundException(`Candidature #${id} introuvable`);
    }

    return candidature;
  }

  async create(dto: CreateCandidatureDto): Promise<CandidatureWithOffre> {
    await this.assertOffreExists(dto.offreId);

    if (!dto.email?.trim()) {
      throw new BadRequestException('L\'email est requis pour une candidature');
    }

    return this.prisma.candidature.create({
      data: {
        offreId: dto.offreId,
        nom: dto.nom,
        prenom: dto.prenom,
        email: dto.email.trim(),
        telephone: dto.telephone,
        cvPath: dto.cvPath,
        lettreMotivation: dto.lettreMotivation,
        statut: dto.statut ?? StatutCandidature.recu,
      },
      include: candidatureWithOffreInclude,
    });
  }

  async update(
    id: number,
    dto: UpdateCandidatureDto,
  ): Promise<CandidatureWithOffre> {
    await this.findOne(id);

    return this.prisma.candidature.update({
      where: { id },
      data: this.toUpdateInput(dto),
      include: candidatureWithOffreInclude,
    });
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.prisma.candidature.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private buildWhere(query: QueryCandidaturesDto): Prisma.CandidatureWhereInput {
    const where: Prisma.CandidatureWhereInput = {};

    if (query.offre_id !== undefined) where.offreId = query.offre_id;
    if (query.statut) where.statut = query.statut;

    return where;
  }

  private toUpdateInput(
    dto: UpdateCandidatureDto,
  ): Prisma.CandidatureUpdateInput {
    const data: Prisma.CandidatureUpdateInput = {};

    if (dto.nom !== undefined) data.nom = dto.nom;
    if (dto.prenom !== undefined) data.prenom = dto.prenom;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.telephone !== undefined) data.telephone = dto.telephone;
    if (dto.cvPath !== undefined) data.cvPath = dto.cvPath;
    if (dto.lettreMotivation !== undefined) {
      data.lettreMotivation = dto.lettreMotivation;
    }
    if (dto.statut !== undefined) data.statut = dto.statut;

    return data;
  }

  private async assertOffreExists(offreId: number): Promise<void> {
    const offre = await this.prisma.offreEmploi.findUnique({
      where: { id: offreId },
    });

    if (!offre) {
      throw new NotFoundException(`Offre d'emploi #${offreId} introuvable`);
    }
  }
}
