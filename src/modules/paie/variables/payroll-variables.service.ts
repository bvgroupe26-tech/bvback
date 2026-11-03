import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SourceVariablePaie, StatutAbsence, StatutPeriodePaie } from '@prisma/client';
import { monthBoundsUTC } from '../../../common/utils/date.util';
import { PrismaService } from '../../../prisma/prisma.service';
import { AttendanceRuleCode, buildAttendanceVariables } from './attendance-to-variables';

const RULE_CODES: AttendanceRuleCode[] = ['HS_1', 'HS_2', 'HS_3', 'ABS_NON_PAYEE'];
const SEUIL_HS_CODE = 'HS_SEUIL_TRANCHE1_SEMAINE';
const A_CONFIRMER = /[àa]\s*confirmer/i;
const PERIODES_MODIFIABLES: StatutPeriodePaie[] = [StatutPeriodePaie.ouverte, StatutPeriodePaie.calculee];

export interface BuildVariablesResult {
  periodId: number;
  crees: number;
  warnings: string[];
}

@Injectable()
export class PayrollVariablesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recalcule les variables issues des présences et absences (sources presence/absence).
   * Idempotent : remplace ces variables à chaque appel ; les variables `manuel` ne sont jamais touchées.
   */
  async buildFromAttendance(periodId: number): Promise<BuildVariablesResult> {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException('Période de paie introuvable');
    if (!PERIODES_MODIFIABLES.includes(period.statut)) {
      throw new BadRequestException(`Période ${period.statut} : les variables ne peuvent plus être modifiées`);
    }

    const { start, end } = monthBoundsUTC(period.annee, period.mois);
    const [presences, absences, rules, seuilParam] = await Promise.all([
      this.prisma.presence.findMany({
        where: { date: { gte: start, lte: end } },
        select: { employeId: true, date: true, statut: true, justification: true, heuresSupplementaires: true },
      }),
      this.prisma.absence.findMany({
        where: { statut: StatutAbsence.approuve, dateDebut: { lte: end }, dateFin: { gte: start } },
        select: { employeId: true, dateDebut: true, dateFin: true, typeAbsence: true },
      }),
      this.prisma.payRule.findMany({ where: { code: { in: RULE_CODES }, actif: true }, select: { id: true, code: true } }),
      this.prisma.payParameter.findFirst({
        where: { code: SEUIL_HS_CODE, dateDebut: { lte: end }, OR: [{ dateFin: null }, { dateFin: { gte: end } }] },
        orderBy: { dateDebut: 'desc' },
      }),
    ]);

    const seuil =
      seuilParam && !(seuilParam.description && A_CONFIRMER.test(seuilParam.description))
        ? Number(seuilParam.valeur.toString())
        : null;

    const { variables, warnings } = buildAttendanceVariables({
      periodeDebut: start,
      periodeFin: end,
      presences,
      absencesApprouvees: absences,
      seuilTranche1Semaine: seuil,
    });

    const ruleIds = new Map(rules.map((r) => [r.code, r.id]));
    const absentes = new Set<string>();
    const data = variables.flatMap((v) => {
      const payRuleId = ruleIds.get(v.ruleCode);
      if (!payRuleId) {
        absentes.add(v.ruleCode);
        return [];
      }
      return [
        {
          periodId,
          employeId: v.employeId,
          payRuleId,
          quantite: v.quantite.toString(),
          source: v.source === 'presence' ? SourceVariablePaie.presence : SourceVariablePaie.absence,
          commentaire: v.commentaire,
        },
      ];
    });
    if (absentes.size) {
      warnings.push(`Rubriques absentes ou inactives, variables ignorées : ${[...absentes].join(', ')} (lancer seed:payroll ?)`);
    }

    await this.prisma.$transaction([
      this.prisma.payrollVariable.deleteMany({
        where: { periodId, source: { in: [SourceVariablePaie.presence, SourceVariablePaie.absence] } },
      }),
      this.prisma.payrollVariable.createMany({ data }),
    ]);

    return { periodId, crees: data.length, warnings };
  }
}
