import { Injectable } from '@nestjs/common';
import {
  StatutBudgetDepense,
  StatutBudgetEnveloppe,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { calculerAlerte, STATUTS_ENGAGES } from './depense-rules';
import { BudgetSyntheseResponse } from './types/budget.types';

type Bucket = { engage: number; realise: number; enAttente: number };

const STATUTS_SUIVIS: StatutBudgetDepense[] = [
  StatutBudgetDepense.soumise,
  ...STATUTS_ENGAGES,
  StatutBudgetDepense.payee,
];

function emptyBucket(): Bucket {
  return { engage: 0, realise: 0, enAttente: 0 };
}

function addTo(bucket: Bucket, statut: StatutBudgetDepense, montant: number): void {
  if (statut === StatutBudgetDepense.payee) bucket.realise += montant;
  else if (STATUTS_ENGAGES.includes(statut)) bucket.engage += montant;
  else if (statut === StatutBudgetDepense.soumise) bucket.enAttente += montant;
}

function taux(consomme: number, prevu: number): number {
  return prevu > 0 ? Math.round((consomme / prevu) * 1000) / 10 : 0;
}

@Injectable()
export class SyntheseService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Engagé = validee_n1 + validee ; réalisé = payee ; en attente = soumise.
   * Les totaux ne portent que sur les enveloppes actives ; le détail liste toutes celles de l'exercice.
   */
  async getSynthese(annee: number): Promise<BudgetSyntheseResponse> {
    const [enveloppes, depenses] = await Promise.all([
      this.prisma.budgetEnveloppe.findMany({
        where: { annee, deletedAt: null },
        orderBy: { libelle: 'asc' },
      }),
      this.prisma.budgetDepense.findMany({
        where: {
          deletedAt: null,
          statut: { in: STATUTS_SUIVIS },
          enveloppe: { annee, deletedAt: null },
        },
        select: {
          enveloppeId: true,
          categorieId: true,
          fournisseurId: true,
          fournisseur: true,
          statut: true,
          montantTtc: true,
          dateDepense: true,
          categorie: { select: { code: true, libelle: true, compteSyscohada: true } },
          fournisseurRef: { select: { nom: true } },
        },
      }),
    ]);

    const actives = new Set(
      enveloppes.filter((e) => e.statut === StatutBudgetEnveloppe.actif).map((e) => e.id),
    );

    const parEnveloppe = new Map<number, Bucket>();
    const totaux = emptyBucket();
    const parCategorie = new Map<
      string,
      Bucket & { id: number | null; code: string | null; libelle: string; compte: string | null }
    >();
    const parMois = Array.from({ length: 12 }, () => emptyBucket());
    const fournisseurs = new Map<string, { id: number | null; nom: string; total: number }>();

    for (const d of depenses) {
      const montant = d.montantTtc.toNumber();

      const env = parEnveloppe.get(d.enveloppeId) ?? emptyBucket();
      addTo(env, d.statut, montant);
      parEnveloppe.set(d.enveloppeId, env);

      if (!actives.has(d.enveloppeId)) continue;

      addTo(totaux, d.statut, montant);
      addTo(parMois[d.dateDepense.getUTCMonth()], d.statut, montant);

      const catKey = d.categorieId === null ? 'none' : String(d.categorieId);
      const cat = parCategorie.get(catKey) ?? {
        ...emptyBucket(),
        id: d.categorieId,
        code: d.categorie?.code ?? null,
        libelle: d.categorie?.libelle ?? 'Sans catégorie',
        compte: d.categorie?.compteSyscohada ?? null,
      };
      addTo(cat, d.statut, montant);
      parCategorie.set(catKey, cat);

      if (d.statut === StatutBudgetDepense.payee) {
        const nom = d.fournisseurRef?.nom ?? d.fournisseur?.trim() ?? '';
        if (nom) {
          const key = d.fournisseurId ? `id:${d.fournisseurId}` : `txt:${nom.toLowerCase()}`;
          const f = fournisseurs.get(key) ?? { id: d.fournisseurId, nom, total: 0 };
          f.total += montant;
          fournisseurs.set(key, f);
        }
      }
    }

    const prevuActif = enveloppes
      .filter((e) => actives.has(e.id))
      .reduce((sum, e) => sum + e.montantPrevu.toNumber(), 0);

    return {
      annee,
      totaux: {
        prevu: prevuActif,
        engage: totaux.engage,
        realise: totaux.realise,
        disponible: prevuActif - totaux.engage - totaux.realise,
        en_attente: totaux.enAttente,
        taux: taux(totaux.engage + totaux.realise, prevuActif),
      },
      par_enveloppe: enveloppes.map((e) => {
        const b = parEnveloppe.get(e.id) ?? emptyBucket();
        const prevu = e.montantPrevu.toNumber();
        const consomme = b.engage + b.realise;
        return {
          id: e.id,
          libelle: e.libelle,
          departement: e.departement,
          statut: e.statut,
          annee: e.annee,
          prevu,
          engage: b.engage,
          realise: b.realise,
          en_attente: b.enAttente,
          disponible: prevu - consomme,
          taux: taux(consomme, prevu),
          seuil_alerte_pct: e.seuilAlertePct,
          bloquer_depassement: e.bloquerDepassement,
          alerte: calculerAlerte(consomme, prevu, e.seuilAlertePct),
        };
      }),
      par_categorie: [...parCategorie.values()]
        .map((c) => ({
          id: c.id,
          code: c.code,
          libelle: c.libelle,
          compte_syscohada: c.compte,
          realise: c.realise,
          engage: c.engage,
        }))
        .sort((a, b) => b.realise + b.engage - (a.realise + a.engage)),
      depenses_par_mois: parMois.map((m, i) => ({
        mois: String(i + 1).padStart(2, '0'),
        realise: m.realise,
        engage: m.engage,
      })),
      top_fournisseurs: [...fournisseurs.values()]
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
    };
  }
}
