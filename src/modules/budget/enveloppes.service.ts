import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  StatutBudgetDepense,
  StatutBudgetEnveloppe,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AlerteBudget, calculerAlerte, STATUTS_ENGAGES } from './depense-rules';
import { CreateEnveloppeDto } from './dto/create-enveloppe.dto';
import { QueryEnveloppesDto } from './dto/query-enveloppes.dto';
import { UpdateEnveloppeDto } from './dto/update-enveloppe.dto';
import {
  EnveloppeWithCount,
  enveloppeWithCountInclude,
} from './types/budget.types';

export type EnveloppeWithMontants = EnveloppeWithCount & {
  montantEngage: number;
  montantRealise: number;
  montantEnAttente: number;
  disponible: number;
  /** Prévu − réalisé (conservé pour l'existant). */
  ecart: number;
  tauxConsommation: number;
  alerte: AlerteBudget;
};

const DEPENSES_ACTIVES: Prisma.BudgetDepenseWhereInput = {
  deletedAt: null,
  statut: { not: StatutBudgetDepense.annulee },
};

@Injectable()
export class EnveloppesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryEnveloppesDto): Promise<EnveloppeWithMontants[]> {
    const enveloppes = await this.prisma.budgetEnveloppe.findMany({
      where: this.buildWhere(query),
      include: enveloppeWithCountInclude,
      orderBy: [{ annee: 'desc' }, { libelle: 'asc' }],
    });
    return this.withMontants(enveloppes);
  }

  async findOne(id: number): Promise<EnveloppeWithMontants> {
    const enveloppe = await this.prisma.budgetEnveloppe.findFirst({
      where: { id, deletedAt: null },
      include: enveloppeWithCountInclude,
    });

    if (!enveloppe) {
      throw new NotFoundException(`Enveloppe budgétaire #${id} introuvable`);
    }

    const [enriched] = await this.withMontants([enveloppe]);
    return enriched;
  }

  private async withMontants(
    enveloppes: EnveloppeWithCount[],
  ): Promise<EnveloppeWithMontants[]> {
    if (enveloppes.length === 0) return [];

    const sums = await this.prisma.budgetDepense.groupBy({
      by: ['enveloppeId', 'statut'],
      where: {
        enveloppeId: { in: enveloppes.map((e) => e.id) },
        deletedAt: null,
      },
      _sum: { montantTtc: true },
    });

    return enveloppes.map((e) => {
      let engage = 0;
      let realise = 0;
      let enAttente = 0;
      for (const row of sums) {
        if (row.enveloppeId !== e.id) continue;
        const montant = row._sum.montantTtc?.toNumber() ?? 0;
        if (row.statut === StatutBudgetDepense.payee) realise += montant;
        else if (STATUTS_ENGAGES.includes(row.statut)) engage += montant;
        else if (row.statut === StatutBudgetDepense.soumise) enAttente += montant;
      }
      const prevu = e.montantPrevu.toNumber();
      return {
        ...e,
        montantEngage: engage,
        montantRealise: realise,
        montantEnAttente: enAttente,
        disponible: prevu - engage - realise,
        ecart: prevu - realise,
        tauxConsommation: prevu > 0 ? Math.round(((engage + realise) / prevu) * 1000) / 10 : 0,
        alerte: calculerAlerte(engage + realise, prevu, e.seuilAlertePct),
      };
    });
  }

  async create(dto: CreateEnveloppeDto): Promise<EnveloppeWithMontants> {
    const created = await this.prisma.budgetEnveloppe.create({
      data: {
        libelle: dto.libelle,
        annee: dto.annee,
        montantPrevu: dto.montantPrevu,
        departement: dto.departement,
        statut: dto.statut ?? StatutBudgetEnveloppe.actif,
        notes: dto.notes,
        seuilAlertePct: dto.seuilAlertePct ?? 80,
        bloquerDepassement: dto.bloquerDepassement ?? false,
      },
    });
    return this.findOne(created.id);
  }

  async update(id: number, dto: UpdateEnveloppeDto): Promise<EnveloppeWithMontants> {
    const existing = await this.findOne(id);

    if (dto.annee !== undefined && dto.annee !== existing.annee) {
      const nb = await this.prisma.budgetDepense.count({
        where: { enveloppeId: id, ...DEPENSES_ACTIVES },
      });
      if (nb > 0) {
        throw new ConflictException(
          "Impossible de changer l'exercice : des dépenses sont déjà imputées sur cette enveloppe.",
        );
      }
    }

    await this.prisma.budgetEnveloppe.update({
      where: { id },
      data: this.toUpdateInput(dto),
    });
    return this.findOne(id);
  }

  /** Archive l'enveloppe seulement si aucune dépense non annulée n'y est imputée. */
  async remove(id: number): Promise<void> {
    await this.findOne(id);
    const nb = await this.prisma.budgetDepense.count({
      where: { enveloppeId: id, ...DEPENSES_ACTIVES },
    });
    if (nb > 0) {
      throw new ConflictException(
        `Cette enveloppe porte ${nb} dépense(s) : clôturez-la plutôt que de la supprimer.`,
      );
    }
    await this.prisma.budgetEnveloppe.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private buildWhere(query: QueryEnveloppesDto): Prisma.BudgetEnveloppeWhereInput {
    const where: Prisma.BudgetEnveloppeWhereInput = { deletedAt: null };

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
    if (dto.seuilAlertePct !== undefined) data.seuilAlertePct = dto.seuilAlertePct;
    if (dto.bloquerDepassement !== undefined) {
      data.bloquerDepassement = dto.bloquerDepassement;
    }

    return data;
  }
}
