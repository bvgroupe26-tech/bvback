import { Injectable, NotFoundException } from '@nestjs/common';
import {
  OffreEmploi,
  Prisma,
  StatutCandidature,
  StatutOffreEmploi,
  TypeContratOffre,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOffreDto } from './dto/create-offre.dto';
import { QueryOffresDto } from './dto/query-offres.dto';
import { UpdateOffreDto } from './dto/update-offre.dto';
import {
  OffresStatsResponse,
  OffreWithCandidaturesCount,
} from './types/recrutement.types';

@Injectable()
export class OffresService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: QueryOffresDto): Promise<OffreEmploi[]> {
    return this.prisma.offreEmploi.findMany({
      where: this.buildWhere(query),
      orderBy: { datePublication: 'desc' },
    });
  }

  async findOne(id: number): Promise<OffreWithCandidaturesCount> {
    const offre = await this.prisma.offreEmploi.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            candidatures: { where: { deletedAt: null } },
          },
        },
      },
    });

    if (!offre) {
      throw new NotFoundException(`Offre d'emploi #${id} introuvable`);
    }

    return offre;
  }

  create(dto: CreateOffreDto): Promise<OffreEmploi> {
    return this.prisma.offreEmploi.create({
      data: {
        titre: dto.titre,
        departement: dto.departement,
        typeContrat: dto.typeContrat ?? TypeContratOffre.CDI,
        description: dto.description,
        competencesRequises: dto.competencesRequises,
        cibleCandidats: dto.cibleCandidats ?? 10,
        dateCloture: dto.dateCloture ? new Date(dto.dateCloture) : null,
        statut: dto.statut ?? StatutOffreEmploi.ouverte,
      },
    });
  }

  async update(id: number, dto: UpdateOffreDto): Promise<OffreEmploi> {
    await this.findOne(id);

    return this.prisma.offreEmploi.update({
      where: { id },
      data: this.toUpdateInput(dto),
    });
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.candidature.updateMany({
        where: { offreId: id },
        data: { deletedAt: now },
      }),
      this.prisma.offreEmploi.update({
        where: { id },
        data: { deletedAt: now },
      }),
    ]);
  }

  async getStats(): Promise<OffresStatsResponse> {
    const [
      totalOffres,
      ouvertes,
      fermees,
      pourvues,
      totalCandidatures,
      retenues,
      parStatutGroups,
    ] = await Promise.all([
      this.prisma.offreEmploi.count(),
      this.prisma.offreEmploi.count({
        where: { statut: StatutOffreEmploi.ouverte },
      }),
      this.prisma.offreEmploi.count({
        where: { statut: StatutOffreEmploi.fermee },
      }),
      this.prisma.offreEmploi.count({
        where: { statut: StatutOffreEmploi.pourvue },
      }),
      this.prisma.candidature.count(),
      this.prisma.candidature.count({
        where: { statut: StatutCandidature.retenu },
      }),
      this.prisma.candidature.groupBy({
        by: ['statut'],
        _count: { id: true },
        orderBy: { statut: 'asc' },
      }),
    ]);

    const parStatut = parStatutGroups.map((row) => ({
      statut: row.statut,
      count: row._count.id,
    }));

    const tauxConversion =
      totalCandidatures > 0
        ? Math.round((retenues / totalCandidatures) * 1000) / 10
        : 0;

    return {
      totalOffres,
      ouvertes,
      fermees,
      pourvues,
      totalCandidatures,
      parStatut,
      tauxConversion,
    };
  }

  private buildWhere(query: QueryOffresDto): Prisma.OffreEmploiWhereInput {
    const where: Prisma.OffreEmploiWhereInput = {};

    if (query.statut) where.statut = query.statut;
    if (query.type_contrat) where.typeContrat = query.type_contrat;
    if (query.departement) where.departement = query.departement;

    return where;
  }

  private toUpdateInput(dto: UpdateOffreDto): Prisma.OffreEmploiUpdateInput {
    const data: Prisma.OffreEmploiUpdateInput = {};

    if (dto.titre !== undefined) data.titre = dto.titre;
    if (dto.departement !== undefined) data.departement = dto.departement;
    if (dto.typeContrat !== undefined) data.typeContrat = dto.typeContrat;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.competencesRequises !== undefined) {
      data.competencesRequises = dto.competencesRequises;
    }
    if (dto.cibleCandidats !== undefined) data.cibleCandidats = dto.cibleCandidats;
    if (dto.dateCloture !== undefined) {
      data.dateCloture = dto.dateCloture ? new Date(dto.dateCloture) : null;
    }
    if (dto.statut !== undefined) data.statut = dto.statut;

    return data;
  }
}
