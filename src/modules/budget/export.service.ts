import { Injectable } from '@nestjs/common';
import { StatutBudgetDepense } from '@prisma/client';
import { yearBoundsUTC } from '../../common/utils/date.util';
import { PrismaService } from '../../prisma/prisma.service';

const COLONNES = [
  'date',
  'numero',
  'compte_syscohada',
  'categorie',
  'libelle',
  'fournisseur',
  'niu',
  'montant_ht',
  'tva',
  'montant_ttc',
  'mode_paiement',
  'reference_paiement',
  'statut',
] as const;

/** Échappe une cellule CSV (séparateur `;`) et neutralise l'injection de formules Excel. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function numeroDepense(id: number, annee: number): string {
  return `DEP-${annee}-${String(id).padStart(6, '0')}`;
}

@Injectable()
export class BudgetExportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Journal des achats (dépenses payées) de l'exercice, au format CSV UTF-8 avec BOM. */
  async journalAchatsCsv(annee: number): Promise<string> {
    const { start, end } = yearBoundsUTC(annee);
    const depenses = await this.prisma.budgetDepense.findMany({
      where: {
        deletedAt: null,
        statut: StatutBudgetDepense.payee,
        dateDepense: { gte: start, lte: end },
      },
      include: {
        categorie: { select: { libelle: true, compteSyscohada: true } },
        fournisseurRef: { select: { nom: true, niu: true } },
      },
      orderBy: [{ dateDepense: 'asc' }, { id: 'asc' }],
    });

    const lignes = depenses.map((d) =>
      [
        d.dateDepense.toISOString().slice(0, 10),
        numeroDepense(d.id, d.dateDepense.getUTCFullYear()),
        d.categorie?.compteSyscohada ?? '',
        d.categorie?.libelle ?? '',
        d.libelle,
        d.fournisseurRef?.nom ?? d.fournisseur ?? '',
        d.fournisseurRef?.niu ?? '',
        d.montantHt.toNumber(),
        d.montantTva.toNumber(),
        d.montantTtc.toNumber(),
        d.modePaiement ?? '',
        d.referencePaiement ?? '',
        d.statut,
      ]
        .map(csvCell)
        .join(';'),
    );

    return `﻿${[COLONNES.join(';'), ...lignes].join('\r\n')}\r\n`;
  }
}
