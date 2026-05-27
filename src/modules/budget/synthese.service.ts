import { Injectable } from '@nestjs/common';
import {
  StatutBudgetDepense,
  StatutBudgetEnveloppe,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BudgetSyntheseResponse } from './types/budget.types';

const STATUTS_REALISES: StatutBudgetDepense[] = [
  StatutBudgetDepense.approuve,
  StatutBudgetDepense.paye,
];

@Injectable()
export class SyntheseService {
  constructor(private readonly prisma: PrismaService) {}

  async getSynthese(annee: number): Promise<BudgetSyntheseResponse> {
    const [enveloppes, depensesRealisees] = await Promise.all([
      this.prisma.budgetEnveloppe.findMany({
        where: { annee, statut: StatutBudgetEnveloppe.actif },
        orderBy: { libelle: 'asc' },
      }),
      this.prisma.budgetDepense.findMany({
        where: {
          statut: { in: STATUTS_REALISES },
          enveloppe: { annee, deletedAt: null },
        },
        select: { enveloppeId: true, montant: true },
      }),
    ]);

    const totalPrevu = enveloppes.reduce((sum, env) => sum + env.montantPrevu, 0);

    const realiseByEnveloppe = new Map<number, number>();

    for (const depense of depensesRealisees) {
      const current = realiseByEnveloppe.get(depense.enveloppeId) ?? 0;
      realiseByEnveloppe.set(depense.enveloppeId, current + depense.montant);
    }

    const totalRealise = depensesRealisees.reduce(
      (sum, dep) => sum + dep.montant,
      0,
    );

    const tauxConsommation =
      totalPrevu > 0
        ? ((totalRealise / totalPrevu) * 100).toFixed(1)
        : '0.0';

    const parEnveloppe = enveloppes.map((env) => {
      const realise = realiseByEnveloppe.get(env.id) ?? 0;
      const taux =
        env.montantPrevu > 0
          ? ((realise / env.montantPrevu) * 100).toFixed(1)
          : '0.0';

      return {
        id: env.id,
        libelle: env.libelle,
        montantPrevu: env.montantPrevu,
        realise,
        taux,
      };
    });

    return {
      annee,
      totalPrevu,
      totalRealise,
      tauxConsommation,
      parEnveloppe,
    };
  }
}
