import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  MoteurPaie,
  Prisma,
  StatutPaie,
  StatutPeriodePaie,
  TypeBulletin,
  TypeNotification,
  TypeRubrique,
} from '@prisma/client';
import { assertNotSelf } from '../../../common/self-action/self-action';
import { ActiviteService } from '../../activite/activite.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PaieSettingsService } from '../../paie-settings/paie-settings.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PayrollEngineContextService } from '../engine/engine-context.service';
import { computePayslip } from '../engine/compute-payslip';
import { MissingPayrollParameterError, NetNegatifError, PayrollRuleConfigError } from '../engine/errors';
import { PayslipResult } from '../engine/types';
import { checkPaieEligibility } from '../paie-eligibility.util';
import { computePayslipHash } from '../pdf/payslip-hash';
import { PayslipPdfService } from '../pdf/payslip-pdf.service';
import { buildEmployeSnapshot, buildEmployeurSnapshot } from '../pdf/payslip-snapshot';
import { PayrollVariablesService } from '../variables/payroll-variables.service';
import { CreatePeriodeDto, PayerPeriodeDto, RappelDto, SaveVariablesDto } from './dto/periods.dto';
import {
  assertPeriodeAction,
  buildNumero,
  computeCompteurs,
  isRecalculable,
  negate,
  negateLines,
  nextPeriodeStatut,
} from './payroll-workflow.rules';

const MODIFIABLES: StatutPeriodePaie[] = [StatutPeriodePaie.ouverte, StatutPeriodePaie.calculee];

const employeSelect = {
  select: { nom: true, prenom: true, poste: true, departement: true, matricule: true },
} as const;

const toStr = (v: { toString(): string } | null | undefined) => (v == null ? null : v.toString());
const pad = (mois: number | string) => String(Number(mois)).padStart(2, '0');

export interface CalculResult {
  periodId: number;
  calcules: number;
  ignores: Array<{ employeId: number; nom: string; raison: string }>;
  erreurs: Array<{ employeId: number; nom: string; message: string }>;
  warnings: Array<{ employeId: number; messages: string[] }>;
}

export interface ValidationResult {
  periodId: number;
  valides: number;
  ignoresAutoValidation: Array<{ paieId: number; employeId: number }>;
  archivageEchoue: Array<{ paieId: number; message: string }>;
}

@Injectable()
export class PayrollPeriodsService {
  private readonly logger = new Logger(PayrollPeriodsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: PayrollEngineContextService,
    private readonly variablesService: PayrollVariablesService,
    private readonly settings: PaieSettingsService,
    private readonly pdf: PayslipPdfService,
    private readonly notifications: NotificationsService,
    private readonly activite: ActiviteService,
  ) {}

  // ─── Périodes ──────────────────────────────────────────────

  async list() {
    const periods = await this.prisma.payrollPeriod.findMany({
      orderBy: [{ annee: 'desc' }, { mois: 'desc' }],
      include: { _count: { select: { bulletins: { where: { deletedAt: null } } } } },
    });
    return periods.map(({ _count, ...p }) => ({ ...p, nbBulletins: _count.bulletins }));
  }

  async create(dto: CreatePeriodeDto) {
    const existing = await this.prisma.payrollPeriod.findUnique({
      where: { annee_mois: { annee: dto.annee, mois: dto.mois } },
    });
    if (existing) throw new ConflictException(`La période ${pad(dto.mois)}/${dto.annee} existe déjà.`);
    return this.prisma.payrollPeriod.create({ data: { annee: dto.annee, mois: dto.mois } });
  }

  async findOne(id: number) {
    const period = await this.getPeriod(id);
    const bulletins = await this.prisma.paie.findMany({
      where: { periodId: id, deletedAt: null },
      include: { employe: employeSelect },
      orderBy: [{ employe: { nom: 'asc' } }, { employe: { prenom: 'asc' } }, { id: 'asc' }],
    });
    return {
      ...period,
      nbBulletins: bulletins.length,
      bulletins: bulletins.map((b) => ({
        id: b.id,
        numero: b.numero,
        employeId: b.employeId,
        employe: b.employe,
        statut: b.statut,
        type: b.type,
        moteur: b.moteur,
        brut: toStr(b.brut),
        netAPayer: toStr(b.netAPayer),
        totalCotisPat: toStr(b.totalCotisPat),
      })),
      compteurs: computeCompteurs(bulletins),
    };
  }

  // ─── Calcul ────────────────────────────────────────────────

  /** `employeIds` absent ou vide = tous les employés ; sinon uniquement ceux-là (ex. un seul bulletin). */
  async calculer(id: number, employeIds?: number[]): Promise<CalculResult> {
    const period = await this.getPeriod(id);
    assertPeriodeAction(period.statut, 'calculer');
    const scope = this.normalizeScope(employeIds);

    const finDeMois = new Date(Date.UTC(period.annee, period.mois, 0)).toISOString().slice(0, 10);
    const statut = await this.settings.statut(finDeMois);
    if (!statut.pret) {
      const codes = [...statut.parametresManquants, ...statut.baremesManquants, ...statut.employeurIncomplet];
      throw new UnprocessableEntityException({
        message: `Paramétrage de paie incomplet : ${codes.join(', ') || 'aucune rubrique active'}`,
        codes,
      });
    }

    const mois = pad(period.mois);
    const employes = await this.prisma.employe.findMany({
      where: { deletedAt: null, ...(scope ? { id: { in: scope } } : {}) },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    });
    if (scope && employes.length !== scope.length) {
      const trouves = new Set(employes.map((e) => e.id));
      throw new BadRequestException(`Employé(s) introuvable(s) : ${scope.filter((i) => !trouves.has(i)).join(', ')}`);
    }
    const existants = await this.prisma.paie.findMany({
      where: {
        employeId: { in: employes.map((e) => e.id) },
        annee: period.annee,
        mois: { in: [mois, String(period.mois)] },
        type: TypeBulletin.normal,
        deletedAt: null,
        statut: { not: StatutPaie.annule },
      },
      select: { id: true, employeId: true, statut: true, moteur: true },
    });
    const parEmploye = new Map(existants.map((p) => [p.employeId, p]));

    const result: CalculResult = { periodId: id, calcules: 0, ignores: [], erreurs: [], warnings: [] };

    for (const employe of employes) {
      const nom = `${employe.prenom} ${employe.nom}`;
      const eligibility = checkPaieEligibility(employe, mois, period.annee);
      if (!eligibility.eligible) {
        result.ignores.push({ employeId: employe.id, nom, raison: eligibility.message ?? 'Non éligible' });
        continue;
      }
      const existant = parEmploye.get(employe.id);
      if (existant && (existant.moteur === MoteurPaie.legacy || !isRecalculable(existant.statut))) {
        result.ignores.push({
          employeId: employe.id,
          nom,
          raison:
            existant.moteur === MoteurPaie.legacy
              ? 'Bulletin legacy déjà saisi pour ce mois'
              : `Bulletin déjà ${existant.statut}, non recalculé`,
        });
        continue;
      }

      let calcul: PayslipResult;
      try {
        calcul = computePayslip(await this.context.buildInputForPeriod(id, employe.id));
      } catch (err) {
        if (err instanceof MissingPayrollParameterError) {
          throw new UnprocessableEntityException({ message: err.message, codes: err.codes });
        }
        if (err instanceof NetNegatifError || err instanceof PayrollRuleConfigError) {
          result.erreurs.push({ employeId: employe.id, nom, message: err.message });
          continue;
        }
        throw err;
      }

      await this.persistCalcul(period, mois, employe.id, existant?.id ?? null, calcul);
      result.calcules++;
      if (calcul.warnings.length) result.warnings.push({ employeId: employe.id, messages: calcul.warnings });
    }

    await this.refreshPeriodStatut(id);
    await this.activite.log('paie_calculee', `Paie ${mois}/${period.annee} calculée : ${result.calcules} bulletin(s)`, scope?.length === 1 ? scope[0] : null, {
      periodId: id,
      calcules: result.calcules,
      erreurs: result.erreurs.length,
      employeIds: scope ?? 'tous',
    });
    return result;
  }

  /** Un bulletin et ses lignes par transaction ; recalcul = remplacement complet des lignes. */
  private async persistCalcul(
    period: { id: number; annee: number },
    mois: string,
    employeId: number,
    existingId: number | null,
    calcul: PayslipResult,
  ): Promise<void> {
    const t = calcul.totaux;
    const somme = (type: string) =>
      calcul.lignes.filter((l) => l.type === type).reduce((s, l) => s + l.montantSalarial.toNumber(), 0);
    const data = {
      periodId: period.id,
      moteur: MoteurPaie.v2,
      type: TypeBulletin.normal,
      statut: StatutPaie.calcule,
      brut: t.brut.toString(),
      brutImposable: t.brutImposable.toString(),
      netImposable: t.netImposable.toString(),
      totalCotisSal: t.totalCotisSal.toString(),
      totalCotisPat: t.totalCotisPat.toString(),
      netAPayer: t.netAPayer.toString(),
      cumuls: Object.fromEntries(Object.entries(calcul.cumuls).map(([k, v]) => [k, v.toNumber()])),
      // Champs legacy renseignés pour les statistiques et exports existants.
      salaireBase: t.brut.toNumber(),
      primeTransport: 0,
      primeLogement: 0,
      primePerformance: 0,
      autresPrimes: 0,
      cnss: somme('cotisation'),
      impot: somme('impot'),
      autresRetenues: somme('retenue'),
      salaireNet: t.netAPayer.toNumber(),
    } satisfies Prisma.PaieUncheckedUpdateInput;
    const lignes = calcul.lignes.map((l) => ({
      payRuleId: l.ruleId ?? null,
      code: l.code,
      libelle: l.libelle,
      ordre: l.ordre,
      type: l.type as TypeRubrique,
      base: toStr(l.base),
      taux: toStr(l.taux),
      quantite: toStr(l.quantite),
      montantSalarial: l.montantSalarial.toString(),
      montantPatronal: l.montantPatronal.toString(),
      imposable: l.imposable,
    }));

    await this.prisma.$transaction(async (tx) => {
      let paieId = existingId;
      if (paieId) {
        await tx.paie.update({ where: { id: paieId }, data });
        await tx.payslipLine.deleteMany({ where: { paieId } });
      } else {
        paieId = (await tx.paie.create({ data: { ...data, employeId, mois, annee: period.annee } })).id;
      }
      if (lignes.length) await tx.payslipLine.createMany({ data: lignes.map((l) => ({ ...l, paieId: paieId! })) });
    });
  }

  // ─── Validation ────────────────────────────────────────────

  async valider(id: number, validatorUserId: number, employeIds?: number[]): Promise<ValidationResult> {
    const period = await this.getPeriod(id);
    assertPeriodeAction(period.statut, 'valider');
    const scope = this.normalizeScope(employeIds);

    const bulletins = await this.prisma.paie.findMany({
      where: {
        periodId: id,
        deletedAt: null,
        moteur: MoteurPaie.v2,
        statut: StatutPaie.calcule,
        ...(scope ? { employeId: { in: scope } } : {}),
      },
      include: { employe: true, lignes: true },
    });
    if (scope && bulletins.length === 0) {
      throw new ConflictException('Aucun bulletin calculé à valider pour cette sélection.');
    }
    const employeur = buildEmployeurSnapshot(await this.prisma.employeurSettings.findUnique({ where: { id: 1 } })) as unknown as Prisma.InputJsonValue;
    const result: ValidationResult = { periodId: id, valides: 0, ignoresAutoValidation: [], archivageEchoue: [] };

    for (const b of bulletins) {
      try {
        await assertNotSelf(this.prisma, validatorUserId, b.employeId, 'valider votre propre bulletin de paie');
      } catch {
        result.ignoresAutoValidation.push({ paieId: b.id, employeId: b.employeId });
        continue;
      }
      await this.sceller(b, validatorUserId, buildEmployeSnapshot(b.employe) as unknown as Prisma.InputJsonValue, employeur);
      result.valides++;
      await this.archiver(b.id, result);
    }

    await this.refreshPeriodStatut(id);
    await this.activite.log('paie_validee', `Paie ${pad(period.mois)}/${period.annee} : ${result.valides} bulletin(s) validé(s)`, scope?.length === 1 ? scope[0] : null, {
      periodId: id,
      valides: result.valides,
      ignores: result.ignoresAutoValidation.length,
      employeIds: scope ?? 'tous',
    });
    return result;
  }

  /** Numéro, empreinte, snapshots : à partir d'ici le bulletin ne change plus. */
  private async sceller(
    b: Prisma.PaieGetPayload<{ include: { lignes: true } }>,
    validatorUserId: number,
    employeSnapshot: Prisma.InputJsonValue,
    employeurSnapshot: Prisma.InputJsonValue,
    statut: StatutPaie = StatutPaie.valide,
  ): Promise<void> {
    const numero = b.numero ?? buildNumero(b.annee, b.mois, b.id);
    const hashSha256 = computePayslipHash({ ...b, numero });
    await this.prisma.paie.update({
      where: { id: b.id },
      data: {
        statut,
        numero,
        hashSha256,
        employeSnapshot,
        employeurSnapshot,
        validatedAt: new Date(),
        validatedById: validatorUserId,
      },
    });
  }

  private async archiver(paieId: number, result: { archivageEchoue: Array<{ paieId: number; message: string }> }) {
    try {
      await this.pdf.archive(paieId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Archivage du bulletin #${paieId} impossible : ${message}`);
      result.archivageEchoue.push({ paieId, message });
    }
  }

  // ─── Paiement, clôture ─────────────────────────────────────

  async payer(id: number, dto: PayerPeriodeDto, actorUserId: number) {
    const period = await this.getPeriod(id);
    assertPeriodeAction(period.statut, 'payer');
    const datePaiement = new Date(dto.datePaiement);
    if (Number.isNaN(datePaiement.getTime())) throw new BadRequestException('datePaiement invalide');

    const scope = this.normalizeScope(dto.employeIds);

    const bulletins = await this.prisma.paie.findMany({
      where: {
        periodId: id,
        deletedAt: null,
        statut: StatutPaie.valide,
        ...(scope ? { employeId: { in: scope } } : {}),
      },
      select: { id: true, employeId: true, netAPayer: true, mois: true, annee: true, type: true },
    });
    if (bulletins.length === 0) {
      throw new ConflictException('Aucun bulletin validé à payer' + (scope ? ' pour cette sélection.' : '.'));
    }
    for (const b of bulletins) {
      await assertNotSelf(this.prisma, actorUserId, b.employeId, 'payer votre propre bulletin de paie');
    }
    await this.prisma.paie.updateMany({
      where: { id: { in: bulletins.map((b) => b.id) } },
      data: { statut: StatutPaie.paye, datePaiement },
    });

    for (const b of bulletins) {
      if (b.type === TypeBulletin.contre_bulletin) continue;
      const net = b.netAPayer ? Number(b.netAPayer.toString()).toLocaleString('fr-FR') : '—';
      await this.notifications.safeNotifyEmploye(
        b.employeId,
        'Bulletin de paie disponible',
        `Votre bulletin de paie ${b.mois}/${b.annee} est disponible (net à payer : ${net} FCFA).`,
        TypeNotification.paie,
        { paieId: b.id, employeId: b.employeId, mois: b.mois, annee: b.annee, statut: StatutPaie.paye },
      );
    }

    await this.refreshPeriodStatut(id);
    await this.activite.log('paie_payee', `Paie ${pad(period.mois)}/${period.annee} payée : ${bulletins.length} bulletin(s)`, scope?.length === 1 ? scope[0] : null, {
      periodId: id,
      payes: bulletins.length,
      employeIds: scope ?? 'tous',
      modePaiement: dto.modePaiement ?? null,
      datePaiement: dto.datePaiement,
    });
    return { periodId: id, payes: bulletins.length };
  }

  async cloturer(id: number, actorUserId: number) {
    const period = await this.getPeriod(id);
    assertPeriodeAction(period.statut, 'cloturer');
    const enCours = await this.prisma.paie.count({
      where: { periodId: id, deletedAt: null, statut: { in: [StatutPaie.brouillon, StatutPaie.calcule, StatutPaie.valide] } },
    });
    if (enCours > 0) throw new ConflictException(`${enCours} bulletin(s) non payé(s) : clôture impossible.`);
    return this.prisma.payrollPeriod.update({
      where: { id },
      data: { statut: StatutPeriodePaie.cloturee, clotureAt: new Date(), clotureById: actorUserId },
    });
  }

  // ─── Variables ─────────────────────────────────────────────

  async getVariables(id: number) {
    await this.getPeriod(id);
    return this.prisma.payrollVariable.findMany({
      where: { periodId: id },
      include: {
        employe: { select: { nom: true, prenom: true } },
        payRule: { select: { id: true, code: true, libelle: true } },
      },
      orderBy: [{ employe: { nom: 'asc' } }, { payRule: { ordre: 'asc' } }],
    });
  }

  /** Remplace la liste : lignes absentes supprimées, `id` = mise à jour, sans `id` = création. */
  async saveVariables(id: number, dto: SaveVariablesDto) {
    const period = await this.getPeriod(id);
    assertPeriodeAction(period.statut, 'variables');

    const ruleIds = [...new Set(dto.variables.map((v) => v.payRuleId))];
    const rules = await this.prisma.payRule.count({ where: { id: { in: ruleIds } } });
    if (rules !== ruleIds.length) throw new BadRequestException('Rubrique inconnue dans les variables.');
    const vide = dto.variables.find((v) => v.quantite == null && v.montant == null);
    if (vide) throw new BadRequestException('Chaque variable doit avoir une quantité ou un montant.');

    const gardes = dto.variables.filter((v) => v.id).map((v) => v.id!);
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollVariable.deleteMany({ where: { periodId: id, id: { notIn: gardes } } });
      for (const v of dto.variables) {
        const data = {
          employeId: v.employeId,
          payRuleId: v.payRuleId,
          quantite: v.quantite ?? null,
          montant: v.montant ?? null,
          source: v.source ?? 'manuel',
          commentaire: v.commentaire ?? null,
        } as const;
        if (v.id) {
          const res = await tx.payrollVariable.updateMany({ where: { id: v.id, periodId: id }, data });
          if (res.count === 0) throw new BadRequestException(`Variable #${v.id} introuvable dans cette période.`);
        } else {
          await tx.payrollVariable.create({ data: { ...data, periodId: id } });
        }
      }
    });
    return this.getVariables(id);
  }

  async importerVariables(id: number) {
    const period = await this.getPeriod(id);
    assertPeriodeAction(period.statut, 'variables');
    return this.variablesService.buildFromAttendance(id);
  }

  // ─── Contre-bulletin, rappel ───────────────────────────────

  /** Annule un bulletin v2 validé ou payé : lignes opposées, original passé en « annule ». */
  async contreBulletin(paieId: number, actorUserId: number) {
    const original = await this.prisma.paie.findFirst({
      where: { id: paieId, deletedAt: null },
      include: { lignes: true, period: true, contreBulletins: { where: { deletedAt: null }, select: { id: true } } },
    });
    if (!original) throw new NotFoundException(`Bulletin #${paieId} introuvable`);
    if (original.moteur !== MoteurPaie.v2) throw new ConflictException('Contre-bulletin réservé aux bulletins du moteur v2.');
    if (original.type === TypeBulletin.contre_bulletin) throw new ConflictException('Un contre-bulletin ne s’annule pas.');
    if (original.statut !== StatutPaie.valide && original.statut !== StatutPaie.paye) {
      throw new ConflictException('Seul un bulletin validé ou payé s’annule par contre-bulletin ; recalculez-le sinon.');
    }
    if (original.contreBulletins.length) throw new ConflictException('Ce bulletin a déjà un contre-bulletin.');
    await assertNotSelf(this.prisma, actorUserId, original.employeId, 'annuler votre propre bulletin de paie');

    const periodeOuverte = original.period && original.period.statut !== StatutPeriodePaie.cloturee;
    const contre = await this.prisma.$transaction(async (tx) => {
      const created = await tx.paie.create({
        data: {
          employeId: original.employeId,
          mois: original.mois,
          annee: original.annee,
          periodId: periodeOuverte ? original.periodId : null,
          moteur: MoteurPaie.v2,
          type: TypeBulletin.contre_bulletin,
          statut: original.statut,
          annuleBulletinId: original.id,
          datePaiement: original.datePaiement,
          brut: negate(original.brut),
          brutImposable: negate(original.brutImposable),
          netImposable: negate(original.netImposable),
          totalCotisSal: negate(original.totalCotisSal),
          totalCotisPat: negate(original.totalCotisPat),
          netAPayer: negate(original.netAPayer),
          salaireBase: -original.salaireBase,
          cnss: -original.cnss,
          impot: -original.impot,
          autresRetenues: -original.autresRetenues,
          salaireNet: original.salaireNet == null ? null : -original.salaireNet,
          lignes: { create: negateLines(original.lignes) },
        },
        include: { lignes: true },
      });
      await tx.paie.update({ where: { id: original.id }, data: { statut: StatutPaie.annule } });
      return created;
    });

    await this.sceller(contre, actorUserId, (original.employeSnapshot ?? {}) as Prisma.InputJsonValue,
      (original.employeurSnapshot ?? {}) as Prisma.InputJsonValue, original.statut);
    const result = { archivageEchoue: [] as Array<{ paieId: number; message: string }> };
    await this.archiver(contre.id, result);
    await this.activite.log('paie_contre_bulletin', `Contre-bulletin du bulletin ${original.numero ?? `#${original.id}`}`, original.employeId, {
      paieId: original.id,
      contreBulletinId: contre.id,
    });
    return { ...(await this.prisma.paie.findUnique({ where: { id: contre.id }, include: { lignes: true } })), ...result };
  }

  /**
   * Rappel de salaire : bulletin complémentaire calculé à partir des lignes saisies, placé dans une
   * période ouverte, puis validé et payé avec elle. Cotisations non recalculées (à saisir en lignes).
   */
  async rappel(paieId: number, dto: RappelDto) {
    const original = await this.prisma.paie.findFirst({ where: { id: paieId, deletedAt: null }, include: { period: true } });
    if (!original) throw new NotFoundException(`Bulletin #${paieId} introuvable`);
    if (original.statut !== StatutPaie.valide && original.statut !== StatutPaie.paye) {
      throw new ConflictException('Un rappel ne porte que sur un bulletin validé ou payé.');
    }
    if (dto.lignes.length === 0) throw new BadRequestException('Au moins une ligne est requise.');

    const period = dto.periodId ? await this.getPeriod(dto.periodId) : original.period;
    if (!period || !MODIFIABLES.includes(period.statut)) {
      throw new ConflictException('Indiquez une période ouverte (periodId) pour porter le rappel.');
    }

    const gains = dto.lignes.filter((l) => l.type === TypeRubrique.gain);
    const retenues = dto.lignes.filter((l) => l.type === TypeRubrique.retenue);
    const total = (ls: typeof dto.lignes) => ls.reduce((s, l) => s + Math.round(l.montant), 0);
    const brut = total(gains);
    const imposable = total(gains.filter((l) => l.imposable !== false));
    const net = brut - total(retenues);
    if (net < 0) throw new BadRequestException('Le rappel ne peut pas avoir un net négatif.');

    const created = await this.prisma.paie.create({
      data: {
        employeId: original.employeId,
        mois: pad(period.mois),
        annee: period.annee,
        periodId: period.id,
        moteur: MoteurPaie.v2,
        type: TypeBulletin.rappel,
        statut: StatutPaie.calcule,
        brut,
        brutImposable: imposable,
        netImposable: imposable,
        totalCotisSal: 0,
        totalCotisPat: 0,
        netAPayer: net,
        salaireBase: brut,
        autresRetenues: total(retenues),
        salaireNet: net,
        lignes: {
          create: dto.lignes.map((l, i) => ({
            code: l.code,
            libelle: l.libelle,
            ordre: 900 + i,
            type: l.type,
            montantSalarial: Math.round(l.montant),
            imposable: l.type === TypeRubrique.gain && l.imposable !== false,
          })),
        },
      },
      include: { lignes: true },
    });
    await this.refreshPeriodStatut(period.id);
    return created;
  }

  // ─── Utilitaires ───────────────────────────────────────────

  /** Liste d'employés dédoublonnée, ou null (= toute la période) si absente ou vide. */
  private normalizeScope(employeIds?: number[]): number[] | null {
    return employeIds?.length ? [...new Set(employeIds)] : null;
  }

  private async getPeriod(id: number) {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id } });
    if (!period) throw new NotFoundException(`Période de paie #${id} introuvable`);
    return period;
  }

  private async refreshPeriodStatut(id: number): Promise<void> {
    const period = await this.getPeriod(id);
    const rows = await this.prisma.paie.findMany({ where: { periodId: id, deletedAt: null }, select: { statut: true } });
    const statut = nextPeriodeStatut(period.statut, rows.map((r) => r.statut));
    if (statut !== period.statut) await this.prisma.payrollPeriod.update({ where: { id }, data: { statut } });
  }
}
