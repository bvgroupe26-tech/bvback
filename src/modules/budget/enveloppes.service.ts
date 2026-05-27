import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  StatutBudgetEnveloppe,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEnveloppeDto } from './dto/create-enveloppe.dto';
import { QueryEnveloppesDto } from './dto/query-enveloppes.dto';
import { UpdateEnveloppeDto } from './dto/update-enveloppe.dto';
import {
  EnveloppeWithCount,
  enveloppeWithCountInclude,
} from './types/budget.types';

@Injectable()
export class EnveloppesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: QueryEnveloppesDto): Promise<EnveloppeWithCount[]> {
    return this.prisma.budgetEnveloppe.findMany({
      where: this.buildWhere(query),
      include: enveloppeWithCountInclude,
      orderBy: [{ annee: 'desc' }, { libelle: 'asc' }],
    });
  }

  async findOne(id: number): Promise<EnveloppeWithCount> {
    const enveloppe = await this.prisma.budgetEnveloppe.findUnique({
      where: { id },
      include: enveloppeWithCountInclude,
    });

    if (!enveloppe) {
      throw new NotFoundException(`Enveloppe budgétaire #${id} introuvable`);
    }

    return enveloppe;
  }

  create(dto: CreateEnveloppeDto): Promise<EnveloppeWithCount> {
    return this.prisma.budgetEnveloppe.create({
      data: {
        libelle: dto.libelle,
        annee: dto.annee,
        montantPrevu: dto.montantPrevu,
        departement: dto.departement,
        statut: dto.statut ?? StatutBudgetEnveloppe.actif,
        notes: dto.notes,
      },
      include: enveloppeWithCountInclude,
    });
  }

  async update(id: number, dto: UpdateEnveloppeDto): Promise<EnveloppeWithCount> {
    await this.findOne(id);

    return this.prisma.budgetEnveloppe.update({
      where: { id },
      data: this.toUpdateInput(dto),
      include: enveloppeWithCountInclude,
    });
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.budgetDepense.updateMany({
        where: { enveloppeId: id },
        data: { deletedAt: now },
      }),
      this.prisma.budgetEnveloppe.update({
        where: { id },
        data: { deletedAt: now },
      }),
    ]);
  }

  private buildWhere(query: QueryEnveloppesDto): Prisma.BudgetEnveloppeWhereInput {
    const where: Prisma.BudgetEnveloppeWhereInput = {};

    if (query.annee !== undefined) where.annee = query.annee;
    if (query.statut) where.statut = query.statut;

    return where;
  }

  private toUpdateInput(
    dto: UpdateEnveloppeDto,
  ): Prisma.BudgetEnveloppeUpdateInput {
    const data: Prisma.BudgetEnveloppeUpdateInput = {};

    if (dto.libelle !== undefined) data.libelle = dto.libelle;
    if (dto.annee !== undefined) data.annee = dto.annee;
    if (dto.montantPrevu !== undefined) data.montantPrevu = dto.montantPrevu;
    if (dto.departement !== undefined) data.departement = dto.departement;
    if (dto.statut !== undefined) data.statut = dto.statut;
    if (dto.notes !== undefined) data.notes = dto.notes;

    return data;
  }
}
