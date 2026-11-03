import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatutBudgetDepense } from '@prisma/client';
import {
  endOfDayUTC,
  parseDateOnly,
  startOfDayUTC,
} from '../../common/utils/date.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDepenseDto } from './dto/create-depense.dto';
import { QueryDepensesDto } from './dto/query-depenses.dto';
import { UpdateDepenseDto } from './dto/update-depense.dto';
import {
  DepenseWithRelations,
  depenseWithRelationsInclude,
} from './types/budget.types';

@Injectable()
export class DepensesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: QueryDepensesDto): Promise<DepenseWithRelations[]> {
    return this.prisma.budgetDepense.findMany({
      where: this.buildWhere(query),
      include: depenseWithRelationsInclude,
      orderBy: { dateDepense: 'desc' },
    });
  }

  async findOne(id: number): Promise<DepenseWithRelations> {
    const depense = await this.prisma.budgetDepense.findUnique({
      where: { id },
      include: depenseWithRelationsInclude,
    });

    if (!depense) {
      throw new NotFoundException(`Dépense budgétaire #${id} introuvable`);
    }

    return depense;
  }

  async create(dto: CreateDepenseDto): Promise<DepenseWithRelations> {
    await this.assertEnveloppeExists(dto.enveloppeId);

    if (dto.categorieId !== undefined) {
      await this.assertCategorieExists(dto.categorieId);
    }

    return this.prisma.budgetDepense.create({
      data: {
        enveloppeId: dto.enveloppeId,
        categorieId: dto.categorieId ?? null,
        libelle: dto.libelle,
        montantHt: dto.montant,
        montantTtc: dto.montant,
        dateDepense: parseDateOnly(dto.dateDepense),
        fournisseur: dto.fournisseur,
        referencePiece: dto.referencePiece,
        statut: dto.statut ?? StatutBudgetDepense.soumise,
        commentaire: dto.commentaire,
      },
      include: depenseWithRelationsInclude,
    });
  }

  async update(id: number, dto: UpdateDepenseDto): Promise<DepenseWithRelations> {
    const existing = await this.findOne(id);

    if (dto.enveloppeId !== undefined && dto.enveloppeId !== existing.enveloppeId) {
      await this.assertEnveloppeExists(dto.enveloppeId);
    }

    if (dto.categorieId !== undefined && dto.categorieId !== null) {
      await this.assertCategorieExists(dto.categorieId);
    }

    return this.prisma.budgetDepense.update({
      where: { id },
      data: this.toUpdateInput(dto),
      include: depenseWithRelationsInclude,
    });
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.prisma.budgetDepense.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private buildWhere(query: QueryDepensesDto): Prisma.BudgetDepenseWhereInput {
    const where: Prisma.BudgetDepenseWhereInput = {};

    if (query.enveloppe_id !== undefined) where.enveloppeId = query.enveloppe_id;
    if (query.categorie_id !== undefined) where.categorieId = query.categorie_id;
    if (query.statut) where.statut = query.statut;

    if (query.date_from && query.date_to) {
      where.dateDepense = {
        gte: this.startOfDay(query.date_from),
        lte: this.endOfDay(query.date_to),
      };
    } else if (query.date_from) {
      where.dateDepense = { gte: this.startOfDay(query.date_from) };
    } else if (query.date_to) {
      where.dateDepense = { lte: this.endOfDay(query.date_to) };
    }

    return where;
  }

  private toUpdateInput(dto: UpdateDepenseDto): Prisma.BudgetDepenseUpdateInput {
    const data: Prisma.BudgetDepenseUpdateInput = {};

    if (dto.enveloppeId !== undefined) {
      data.enveloppe = { connect: { id: dto.enveloppeId } };
    }
    if (dto.categorieId !== undefined) {
      data.categorie =
        dto.categorieId === null
          ? { disconnect: true }
          : { connect: { id: dto.categorieId } };
    }
    if (dto.libelle !== undefined) data.libelle = dto.libelle;
    if (dto.montant !== undefined) {
      data.montantHt = dto.montant;
      data.montantTva = 0;
      data.montantTtc = dto.montant;
    }
    if (dto.dateDepense !== undefined) {
      data.dateDepense = parseDateOnly(dto.dateDepense);
    }
    if (dto.fournisseur !== undefined) data.fournisseur = dto.fournisseur;
    if (dto.referencePiece !== undefined) {
      data.referencePiece = dto.referencePiece;
    }
    if (dto.statut !== undefined) data.statut = dto.statut;
    if (dto.commentaire !== undefined) data.commentaire = dto.commentaire;

    return data;
  }

  private async assertEnveloppeExists(enveloppeId: number): Promise<void> {
    const enveloppe = await this.prisma.budgetEnveloppe.findUnique({
      where: { id: enveloppeId },
    });

    if (!enveloppe) {
      throw new NotFoundException(`Enveloppe budgétaire #${enveloppeId} introuvable`);
    }
  }

  private async assertCategorieExists(categorieId: number): Promise<void> {
    const categorie = await this.prisma.budgetCategorie.findUnique({
      where: { id: categorieId },
    });

    if (!categorie) {
      throw new NotFoundException(`Catégorie budgétaire #${categorieId} introuvable`);
    }
  }

  private startOfDay(isoDate: string): Date {
    return startOfDayUTC(isoDate);
  }

  private endOfDay(isoDate: string): Date {
    return endOfDayUTC(isoDate);
  }
}
