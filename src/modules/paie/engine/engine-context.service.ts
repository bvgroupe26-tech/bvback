import { Injectable, NotFoundException } from '@nestjs/common';
import { ModeCalculRubrique, MoteurPaie, StatutPaie, TypeBulletin } from '@prisma/client';
import Decimal from 'decimal.js';
import { countBusinessDays, monthBoundsUTC, parseDateOnly } from '../../../common/utils/date.util';
import { PrismaService } from '../../../prisma/prisma.service';
import { EngineCumuls, EngineTaxBracket, OPTIONAL_PARAMETER_DEFAULTS, PayslipInput } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const A_CONFIRMER = /[àa]\s*confirmer/i;

export type ProrataMode = 0 | 1 | 2;

/** Jours de la période et jours en contrat, selon le mode de prorata (0 = base fixe, 1 = calendaires, 2 = ouvrés). */
export function computeProrataDays(args: {
  debut: Date;
  fin: Date;
  dateEmbauche?: Date | null;
  dateFinContrat?: Date | null;
  mode: ProrataMode;
  baseJours: number;
}): { joursPeriode: number; joursTravailles: number } {
  const debut = parseDateOnly(args.debut);
  const fin = parseDateOnly(args.fin);
  const start = args.dateEmbauche && parseDateOnly(args.dateEmbauche) > debut ? parseDateOnly(args.dateEmbauche) : debut;
  const end = args.dateFinContrat && parseDateOnly(args.dateFinContrat) < fin ? parseDateOnly(args.dateFinContrat) : fin;
  const calendaires = Math.round((fin.getTime() - debut.getTime()) / DAY_MS) + 1;
  const enContrat = end < start ? 0 : Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;

  if (args.mode === 1) return { joursPeriode: calendaires, joursTravailles: enContrat };
  if (args.mode === 2) {
    return {
      joursPeriode: countBusinessDays(debut, fin),
      joursTravailles: end < start ? 0 : countBusinessDays(start, end),
    };
  }
  const base = args.baseJours > 0 ? args.baseJours : OPTIONAL_PARAMETER_DEFAULTS.BASE_JOURS_MOIS;
  const joursTravailles = enContrat === calendaires ? base : Math.max(0, Math.min(base, base - (calendaires - enContrat)));
  return { joursPeriode: base, joursTravailles };
}

/** Charge depuis la base tout ce dont le moteur pur a besoin pour un salarié et un mois. */
@Injectable()
export class PayrollEngineContextService {
  constructor(private readonly prisma: PrismaService) {}

  async buildInputForPeriod(periodId: number, employeId: number): Promise<PayslipInput> {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException('Période de paie introuvable');
    return this.buildInput({ annee: period.annee, mois: period.mois, employeId, periodId });
  }

  async buildInput(args: { annee: number; mois: number; employeId: number; periodId?: number }): Promise<PayslipInput> {
    const { annee, mois, employeId, periodId } = args;
    const { start: dateDebut, end: dateFin } = monthBoundsUTC(annee, mois);

    const employe = await this.prisma.employe.findFirst({ where: { id: employeId } });
    if (!employe) throw new NotFoundException('Employé introuvable');

    const enVigueur = { dateDebut: { lte: dateFin }, OR: [{ dateFin: null }, { dateFin: { gte: dateFin } }] };

    const [rules, fixes, variables, parametres, tranches, anterieurs] = await Promise.all([
      this.prisma.payRule.findMany({ where: { actif: true }, orderBy: [{ ordre: 'asc' }, { code: 'asc' }] }),
      this.prisma.employeeRubrique.findMany({
        where: {
          employeId,
          dateDebut: { lte: dateFin },
          OR: [{ dateFin: null }, { dateFin: { gte: dateDebut } }],
        },
        include: { payRule: { select: { code: true } } },
      }),
      periodId
        ? this.prisma.payrollVariable.findMany({
            where: { periodId, employeId },
            include: { payRule: { select: { code: true } } },
          })
        : Promise.resolve([]),
      this.prisma.payParameter.findMany({ where: enVigueur, orderBy: { dateDebut: 'desc' } }),
      this.prisma.taxBracket.findMany({ where: enVigueur, orderBy: [{ dateDebut: 'desc' }, { borneMin: 'asc' }] }),
      this.prisma.paie.findMany({
        where: {
          employeId,
          annee,
          moteur: MoteurPaie.v2,
          statut: { in: [StatutPaie.valide, StatutPaie.paye] },
          // L'original annulé est déjà exclu : compter son contre-bulletin le déduirait deux fois.
          type: { not: TypeBulletin.contre_bulletin },
          deletedAt: null,
        },
        select: {
          mois: true,
          brut: true,
          brutImposable: true,
          netImposable: true,
          netAPayer: true,
          lignes: { where: { payRule: { mode: ModeCalculRubrique.bareme } }, select: { montantSalarial: true } },
        },
      }),
    ]);

    const paramMap = new Map<string, Decimal.Value>();
    const aConfirmer = new Set<string>();
    for (const p of parametres) {
      if (paramMap.has(p.code) || aConfirmer.has(p.code)) continue;
      if (p.description && A_CONFIRMER.test(p.description)) aConfirmer.add(p.code);
      else paramMap.set(p.code, p.valeur.toString());
    }

    const baremes = new Map<string, EngineTaxBracket[]>();
    const versionRetenue = new Map<string, number>();
    for (const t of tranches) {
      const version = t.dateDebut.getTime();
      const retenue = versionRetenue.get(t.bareme);
      if (retenue !== undefined && retenue !== version) continue;
      versionRetenue.set(t.bareme, version);
      const list = baremes.get(t.bareme) ?? [];
      list.push({ borneMin: t.borneMin.toString(), borneMax: t.borneMax?.toString() ?? null, taux: t.taux.toString() });
      baremes.set(t.bareme, list);
    }

    const cumulsAnterieurs: EngineCumuls = { brut: 0, brutImposable: 0, netImposable: 0, irpp: 0, net: 0 };
    const add = (a: Decimal.Value, b: { toString(): string } | null) => new Decimal(a).plus(b ? b.toString() : 0);
    for (const p of anterieurs.filter((x) => Number(x.mois) < mois)) {
      cumulsAnterieurs.brut = add(cumulsAnterieurs.brut, p.brut);
      cumulsAnterieurs.brutImposable = add(cumulsAnterieurs.brutImposable, p.brutImposable);
      cumulsAnterieurs.netImposable = add(cumulsAnterieurs.netImposable, p.netImposable);
      cumulsAnterieurs.net = add(cumulsAnterieurs.net, p.netAPayer);
      for (const l of p.lignes) cumulsAnterieurs.irpp = add(cumulsAnterieurs.irpp, l.montantSalarial);
    }

    const modeRaw = paramMap.has('PRORATA_MODE') ? Number(paramMap.get('PRORATA_MODE')) : 0;
    const mode: ProrataMode = modeRaw === 1 || modeRaw === 2 ? modeRaw : 0;
    const baseJours = paramMap.has('BASE_JOURS_MOIS') ? Number(paramMap.get('BASE_JOURS_MOIS')) : 0;
    const jours = computeProrataDays({
      debut: dateDebut,
      fin: dateFin,
      dateEmbauche: employe.dateEmbauche,
      dateFinContrat: employe.dateFinContrat,
      mode,
      baseJours,
    });

    return {
      periode: { annee, mois, dateDebut, dateFin },
      employe: {
        id: employe.id,
        salaireBase: employe.salaireBase,
        dateEmbauche: employe.dateEmbauche,
        dateFin: employe.dateFinContrat,
        situationFamiliale: employe.situationFamiliale,
        nbEnfants: employe.nombreEnfants,
        categorie: employe.categorie,
        echelon: employe.echelon,
      },
      rubriques: rules.map((r) => ({
        id: r.id,
        code: r.code,
        libelle: r.libelle,
        type: r.type,
        mode: r.mode,
        ordre: r.ordre,
        imposable: r.imposable,
        soumisCnss: r.soumisCnss,
        baseCode: r.baseCode,
        tauxSalarialCode: r.tauxSalarialCode,
        tauxPatronalCode: r.tauxPatronalCode,
        plafondCode: r.plafondCode,
        baremeCode: r.baremeCode,
      })),
      elementsFixes: fixes.map((f) => ({
        ruleCode: f.payRule.code,
        montant: f.montant?.toString() ?? null,
        taux: f.taux?.toString() ?? null,
      })),
      variables: variables.map((v) => ({
        ruleCode: v.payRule.code,
        quantite: v.quantite?.toString() ?? null,
        montant: v.montant?.toString() ?? null,
      })),
      parametres: paramMap,
      parametresAConfirmer: aConfirmer,
      baremes,
      cumulsAnterieurs,
      ...jours,
    };
  }
}
