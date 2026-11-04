import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Employe,
  MoteurPaie,
  Paie,
  Prisma,
  StatutPaie,
  StatutPeriodePaie,
  TypeNotification,
  UserRole,
} from '@prisma/client';
import { ActiviteService } from '../activite/activite.service';
import { NotificationsService } from '../notifications/notifications.service';
import { requireEmployeForUser } from '../../common/employe-link/employe-link';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePaieDto } from './dto/create-paie.dto';
import { GeneratePaieDto } from './dto/generate-paie.dto';
import { QueryPaieDto } from './dto/query-paie.dto';
import { UpdatePaieDto } from './dto/update-paie.dto';
import { CalcInput, PaieCalcService } from './paie-calc.service';
import {
  applyPaieProrata,
  buildProratedPaieAmounts,
  checkPaieEligibility,
  createEmptyPaieSkipSummary,
} from './paie-eligibility.util';
import {
  GeneratePaieResult,
  PaieEvolutionPoint,
  PaieSkippedEntry,
  PaieStatsResponse,
  PaieDetail,
  paieDetailInclude,
  PaieWithEmploye,
  paieWithEmployeInclude,
} from './types/paie.types';

@Injectable()
export class PaieService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paieCalc: PaieCalcService,
    private readonly activiteService: ActiviteService,
    private readonly notificationsService: NotificationsService,
  ) {}

  findAll(query: QueryPaieDto): Promise<PaieWithEmploye[]> {
    return this.prisma.paie.findMany({
      where: this.buildWhere(query),
      include: paieWithEmployeInclude,
      orderBy: [{ annee: 'desc' }, { mois: 'desc' }],
    });
  }

  async findOne(id: number): Promise<PaieDetail> {
    const paie = await this.prisma.paie.findFirst({
      where: { id, deletedAt: null },
      include: paieDetailInclude,
    });

    if (!paie) {
      throw new NotFoundException(`Bulletin de paie #${id} introuvable`);
    }

    return paie;
  }

  async findByUserId(userId: number): Promise<PaieWithEmploye[]> {
    const employe = await this.findEmployeByUserId(userId);

    return this.prisma.paie.findMany({
      where: { employeId: employe.id, statut: StatutPaie.paye, deletedAt: null },
      include: paieWithEmployeInclude,
      orderBy: [{ annee: 'desc' }, { mois: 'desc' }],
    });
  }

  async createManual(dto: CreatePaieDto): Promise<PaieWithEmploye> {
    await this.assertNotExists(dto.employeId, dto.mois, dto.annee);

    const employe = await this.getEmployeOrThrow(dto.employeId);
    const eligibility = this.assertPaieEligible(employe, dto.mois, dto.annee);
    // Les montants saisis sont mensuels pleins : même prorata que la génération en masse.
    const taux = eligibility.tauxProrata ?? 1;
    const montants = {
      salaireBase: applyPaieProrata(dto.salaireBase, taux),
      primeTransport: applyPaieProrata(dto.primeTransport, taux),
      primeLogement: applyPaieProrata(dto.primeLogement, taux),
      primePerformance: applyPaieProrata(dto.primePerformance, taux),
      autresPrimes: applyPaieProrata(dto.autresPrimes, taux),
    };
    const calc = this.calcFromEmploye(employe, {
      ...montants,
      autresRetenues: dto.autresRetenues,
      cnss: dto.cnss,
      impot: dto.impot,
    });

    const statut = StatutPaie.en_attente;

    const bulletin = await this.prisma.paie.create({
      data: {
        employeId: dto.employeId,
        mois: dto.mois,
        annee: dto.annee,
        ...montants,
        cnss: calc.cnss,
        impot: calc.impot,
        autresRetenues: dto.autresRetenues,
        salaireNet: calc.salaireNet,
        joursTravailles: eligibility.joursTravailles,
        joursPeriode: eligibility.joursPeriode,
        statut,
      },
      include: paieWithEmployeInclude,
    });

    await this.notificationsService.safeNotifyEmploye(
      bulletin.employeId,
      'Bulletin de paie préparé',
      `Votre bulletin de paie pour ${dto.mois}/${dto.annee} a été enregistré par la RH.`,
      TypeNotification.paie,
      {
        paieId: bulletin.id,
        employeId: bulletin.employeId,
        mois: dto.mois,
        annee: dto.annee,
        statut,
      },
    );

    return bulletin;
  }

  async generateBulk(dto: GeneratePaieDto): Promise<GeneratePaieResult> {
    const employes = dto.employeId
      ? [await this.getEmployeOrThrow(dto.employeId)]
      : await this.prisma.employe.findMany({
          where: { deletedAt: null },
          orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
        });

    const skippedDetails: PaieSkippedEntry[] = [];
    const summary = createEmptyPaieSkipSummary();
    const toCreate: Prisma.PaieCreateManyInput[] = [];

    const createdIds = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.paie.findMany({
        where: {
          employeId: { in: employes.map((e) => e.id) },
          mois: dto.mois,
          annee: dto.annee,
          deletedAt: null,
          statut: { not: StatutPaie.annule },
        },
        select: { employeId: true },
      });
      const existingIds = new Set(existing.map((p) => p.employeId));

      for (const employe of employes) {
        if (existingIds.has(employe.id)) {
          summary.deja_existant++;
          skippedDetails.push({
            employeId: employe.id,
            nom: employe.nom,
            prenom: employe.prenom,
            reason: 'deja_existant',
            message: `Bulletin déjà existant pour ${dto.mois}/${dto.annee}`,
          });
          continue;
        }

        const eligibility = checkPaieEligibility(employe, dto.mois, dto.annee);
        if (!eligibility.eligible && eligibility.reason) {
          summary[eligibility.reason]++;
          skippedDetails.push({
            employeId: employe.id,
            nom: employe.nom,
            prenom: employe.prenom,
            reason: eligibility.reason,
            message: eligibility.message ?? 'Non éligible à la paie',
          });
          continue;
        }

        const prorata = buildProratedPaieAmounts(employe, dto.mois, dto.annee);

        const calc = this.calcFromEmploye(employe, {
          salaireBase: prorata.salaireBase,
          primeTransport: prorata.primeTransport,
          primeLogement: prorata.primeLogement,
          primePerformance: prorata.primePerformance,
          autresPrimes: prorata.autresPrimes,
          autresRetenues: 0,
        });

        toCreate.push({
          employeId: employe.id,
          mois: dto.mois,
          annee: dto.annee,
          salaireBase: prorata.salaireBase,
          primeTransport: prorata.primeTransport,
          primePerformance: prorata.primePerformance,
          primeLogement: prorata.primeLogement,
          autresPrimes: prorata.autresPrimes,
          cnss: calc.cnss,
          impot: calc.impot,
          autresRetenues: 0,
          salaireNet: calc.salaireNet,
          joursTravailles: prorata.joursTravailles,
          joursPeriode: prorata.joursPeriode,
          statut: StatutPaie.en_attente,
        });
      }

      if (toCreate.length === 0) return [] as number[];

      // skipDuplicates s'appuie sur l'index unique paie (employé, mois, année) s'il existe.
      await tx.paie.createMany({ data: toCreate, skipDuplicates: true });
      return toCreate.map((row) => row.employeId);
    }, { timeout: 60000, maxWait: 10000 });

    const bulletins: PaieWithEmploye[] = createdIds.length
      ? await this.prisma.paie.findMany({
          where: {
            employeId: { in: createdIds },
            mois: dto.mois,
            annee: dto.annee,
            deletedAt: null,
            statut: StatutPaie.en_attente,
          },
          include: paieWithEmployeInclude,
          orderBy: [{ employe: { nom: 'asc' } }, { employe: { prenom: 'asc' } }],
        })
      : [];

    const result: GeneratePaieResult = {
      generated: bulletins.length,
      skipped: skippedDetails.length,
      summary,
      skippedDetails,
      bulletins,
    };

    await this.activiteService.log(
      'paie_generee',
      `${result.generated} bulletins générés pour ${dto.mois}/${dto.annee} (${result.skipped} ignorés)`,
      null,
      {
        mois: dto.mois,
        annee: dto.annee,
        count: result.generated,
        skipped: result.skipped,
        summary: result.summary,
      },
    );

    await this.notifyBulletinsGenerated(bulletins, dto.mois, dto.annee);

    return result;
  }

  async update(
    id: number,
    dto: UpdatePaieDto,
    actorRole?: UserRole,
  ): Promise<PaieWithEmploye> {
    const existing = await this.findOne(id);

    if (existing.moteur === MoteurPaie.v2) {
      throw new ConflictException(
        'Bulletin du moteur v2 : le modifier par le workflow de période (recalcul, contre-bulletin ou rappel).',
      );
    }

    if (existing.statut === StatutPaie.paye) {
      return this.updatePaidBulletin(existing, dto, actorRole);
    }

    const employe = await this.getEmployeOrThrow(
      dto.employeId ?? existing.employeId,
    );

    if (
      (dto.mois && dto.mois !== existing.mois) ||
      (dto.annee && dto.annee !== existing.annee) ||
      (dto.employeId && dto.employeId !== existing.employeId)
    ) {
      await this.assertNotExists(
        dto.employeId ?? existing.employeId,
        dto.mois ?? existing.mois,
        dto.annee ?? existing.annee,
        id,
      );
    }

    const merged = this.mergePaieFields(existing, dto);
    const amountsChanged =
      merged.salaireBase !== existing.salaireBase ||
      merged.primeTransport !== existing.primeTransport ||
      merged.primeLogement !== existing.primeLogement ||
      merged.primePerformance !== existing.primePerformance ||
      merged.autresPrimes !== existing.autresPrimes ||
      merged.autresRetenues !== existing.autresRetenues ||
      employe.id !== existing.employeId;

    // Sans changement de montant, on conserve CNSS/impôt existants (éventuellement saisis à la main).
    const calc = this.calcFromEmploye(employe, {
      salaireBase: merged.salaireBase,
      primeTransport: merged.primeTransport,
      primeLogement: merged.primeLogement,
      primePerformance: merged.primePerformance,
      autresPrimes: merged.autresPrimes,
      autresRetenues: merged.autresRetenues,
      cnss: dto.cnss ?? (amountsChanged ? undefined : existing.cnss),
      impot: dto.impot ?? (amountsChanged ? undefined : existing.impot),
    });

    let datePaiement = existing.datePaiement;

    if (dto.statut !== undefined) {
      if (dto.statut === StatutPaie.paye) {
        datePaiement = existing.datePaiement ?? new Date();
      } else if (
        dto.statut === StatutPaie.en_attente ||
        dto.statut === StatutPaie.annule
      ) {
        datePaiement = null;
      }
    }

    const updated = await this.prisma.paie.update({
      where: { id },
      data: {
        employeId: dto.employeId,
        mois: dto.mois,
        annee: dto.annee,
        salaireBase: merged.salaireBase,
        primeTransport: merged.primeTransport,
        primeLogement: merged.primeLogement,
        primePerformance: merged.primePerformance,
        autresPrimes: merged.autresPrimes,
        cnss: calc.cnss,
        impot: calc.impot,
        autresRetenues: merged.autresRetenues,
        salaireNet: calc.salaireNet,
        statut: dto.statut,
        datePaiement,
      },
      include: paieWithEmployeInclude,
    });

    if (dto.statut === StatutPaie.paye) {
      await this.notifyBulletinPaye(updated);
    }

    return updated;
  }

  private async updatePaidBulletin(
    existing: PaieWithEmploye,
    dto: UpdatePaieDto,
    actorRole?: UserRole,
  ): Promise<PaieWithEmploye> {
    const otherFields = (Object.keys(dto) as (keyof UpdatePaieDto)[]).filter(
      (key) => key !== 'statut' && dto[key] !== undefined && dto[key] !== null,
    );
    const changesSomething = otherFields.some(
      (key) => dto[key] !== (existing as unknown as Record<string, unknown>)[key],
    );

    if (changesSomething) {
      throw new BadRequestException(
        'Bulletin payé verrouillé : ses montants ne peuvent plus être modifiés.',
      );
    }

    if (dto.statut === undefined || dto.statut === StatutPaie.paye) {
      return existing;
    }

    if (dto.statut === StatutPaie.annule && actorRole === UserRole.admin) {
      return this.prisma.paie.update({
        where: { id: existing.id },
        data: { statut: StatutPaie.annule },
        include: paieWithEmployeInclude,
      });
    }

    throw new BadRequestException(
      dto.statut === StatutPaie.annule
        ? 'Seul un administrateur peut annuler un bulletin déjà payé.'
        : 'Un bulletin payé ne peut pas repasser en attente.',
    );
  }

  async remove(id: number): Promise<void> {
    const paie = await this.findOne(id);
    if (paie.statut === StatutPaie.paye || paie.statut === StatutPaie.valide || paie.numero) {
      throw new ConflictException(
        'Bulletin validé ou payé : il ne se supprime pas, il s’annule (contre-bulletin pour le moteur v2).',
      );
    }
    if (paie.period?.statut === StatutPeriodePaie.cloturee) {
      throw new ConflictException('Période clôturée : plus aucune écriture possible.');
    }
    await this.prisma.paie.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async getStats(mois?: string, annee?: number): Promise<PaieStatsResponse> {
    const now = new Date();
    const period: Prisma.PaieWhereInput = {
      deletedAt: null,
      mois: mois ?? String(now.getMonth() + 1).padStart(2, '0'),
      annee: annee ?? now.getFullYear(),
    };
    const dueThisPeriod: Prisma.PaieWhereInput = {
      ...period,
      statut: { not: StatutPaie.annule },
    };

    const [total, enAttente, paye, annule, netAgg, brutAgg] =
      await Promise.all([
        this.prisma.paie.count({ where: period }),
        this.prisma.paie.count({
          where: { ...period, statut: StatutPaie.en_attente },
        }),
        this.prisma.paie.count({ where: { ...period, statut: StatutPaie.paye } }),
        this.prisma.paie.count({ where: { ...period, statut: StatutPaie.annule } }),
        this.prisma.paie.aggregate({
          where: dueThisPeriod,
          _sum: { salaireNet: true },
        }),
        this.prisma.paie.aggregate({
          where: dueThisPeriod,
          _sum: {
            salaireBase: true,
            primeTransport: true,
            primeLogement: true,
            primePerformance: true,
            autresPrimes: true,
          },
        }),
      ]);

    const sums = brutAgg._sum;
    const masseSalarialeBrut =
      (sums.salaireBase ?? 0) +
      (sums.primeTransport ?? 0) +
      (sums.primeLogement ?? 0) +
      (sums.primePerformance ?? 0) +
      (sums.autresPrimes ?? 0);

    return {
      total,
      enAttente,
      paye,
      annule,
      masseSalarialeNet: netAgg._sum.salaireNet ?? 0,
      masseSalarialeBrut,
    };
  }

  async getEvolution(): Promise<PaieEvolutionPoint[]> {
    const rows = await this.prisma.paie.groupBy({
      by: ['mois', 'annee'],
      where: { deletedAt: null, statut: { not: StatutPaie.annule } },
      _sum: { salaireNet: true },
      orderBy: [{ annee: 'desc' }, { mois: 'desc' }],
      take: 12,
    });

    return rows
      .map((row) => ({
        mois: row.mois,
        annee: row.annee,
        masseSalariale: row._sum.salaireNet ?? 0,
      }))
      .reverse();
  }

  isGenerateMode(body: Record<string, unknown>): boolean {
    const record = body;
    if (!('mois' in record) || !('annee' in record)) {
      return false;
    }

    const manualFields = [
      'salaireBase',
      'primeTransport',
      'primeLogement',
      'primePerformance',
      'autresPrimes',
      'autresRetenues',
      'cnss',
      'impot',
      'statut',
    ];

    return !manualFields.some(
      (field) => record[field] !== undefined && record[field] !== null,
    );
  }

  private buildWhere(query: QueryPaieDto): Prisma.PaieWhereInput {
    const where: Prisma.PaieWhereInput = { deletedAt: null };

    if (query.mois) where.mois = query.mois;
    if (query.annee !== undefined) where.annee = query.annee;
    if (query.statut) where.statut = query.statut;
    if (query.employe_id !== undefined) where.employeId = query.employe_id;

    return where;
  }

  private calcFromEmploye(
    employe: Employe,
    overrides: {
      salaireBase: number;
      primeTransport: number;
      primeLogement: number;
      primePerformance: number;
      autresPrimes: number;
      autresRetenues: number;
      cnss?: number;
      impot?: number;
    },
  ): ReturnType<PaieCalcService['calcSalaireNet']> {
    const input: CalcInput = {
      salaireBase: overrides.salaireBase,
      primeTransport: overrides.primeTransport,
      primeLogement: overrides.primeLogement,
      primePerformance: overrides.primePerformance,
      autresPrimes: overrides.autresPrimes,
      defTauxCnss: employe.defTauxCnss,
      defTauxImpot: employe.defTauxImpot,
      autresRetenues: overrides.autresRetenues,
      ...(overrides.cnss !== undefined && { cnssManuel: overrides.cnss }),
      ...(overrides.impot !== undefined && { impotManuel: overrides.impot }),
    };

    return this.paieCalc.calcSalaireNet(input);
  }

  private mergePaieFields(
    existing: Paie,
    dto: UpdatePaieDto,
  ): {
    salaireBase: number;
    primeTransport: number;
    primeLogement: number;
    primePerformance: number;
    autresPrimes: number;
    autresRetenues: number;
  } {
    return {
      salaireBase: dto.salaireBase ?? existing.salaireBase,
      primeTransport: dto.primeTransport ?? existing.primeTransport,
      primeLogement: dto.primeLogement ?? existing.primeLogement,
      primePerformance: dto.primePerformance ?? existing.primePerformance,
      autresPrimes: dto.autresPrimes ?? existing.autresPrimes,
      autresRetenues: dto.autresRetenues ?? existing.autresRetenues,
    };
  }

  private assertPaieEligible(
    employe: Employe,
    mois: string,
    annee: number,
  ): ReturnType<typeof checkPaieEligibility> {
    const eligibility = checkPaieEligibility(employe, mois, annee);
    if (!eligibility.eligible) {
      throw new BadRequestException(
        `Paie impossible pour ${employe.prenom} ${employe.nom} : ${eligibility.message}`,
      );
    }
    return eligibility;
  }

  private async assertNotExists(
    employeId: number,
    mois: string,
    annee: number,
    excludeId?: number,
  ): Promise<void> {
    const existing = await this.prisma.paie.findFirst({
      where: {
        employeId,
        mois,
        annee,
        deletedAt: null,
        statut: { not: StatutPaie.annule },
      },
    });

    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        `Un bulletin existe déjà pour l'employé #${employeId} (${mois}/${annee})`,
      );
    }
  }

  private findEmployeByUserId(userId: number): Promise<Employe> {
    return requireEmployeForUser(this.prisma, userId);
  }

  private async notifyBulletinsGenerated(
    bulletins: PaieWithEmploye[],
    mois: string,
    annee: number,
  ): Promise<void> {
    const periode = `${mois}/${annee}`;

    for (const bulletin of bulletins) {
      const prorata =
        bulletin.joursTravailles != null &&
        bulletin.joursPeriode != null &&
        bulletin.joursTravailles < bulletin.joursPeriode
          ? ` (prorata ${bulletin.joursTravailles}/${bulletin.joursPeriode} jours)`
          : '';

      await this.notificationsService.safeNotifyEmploye(
        bulletin.employeId,
        'Bulletin de paie préparé',
        `Votre bulletin de paie pour ${periode} a été préparé par la RH${prorata}. Il sera visible dès validation du paiement.`,
        TypeNotification.paie,
        {
          paieId: bulletin.id,
          employeId: bulletin.employeId,
          mois,
          annee,
          statut: StatutPaie.en_attente,
        },
      );
    }
  }

  private async notifyBulletinPaye(bulletin: PaieWithEmploye): Promise<void> {
    const periode = `${bulletin.mois}/${bulletin.annee}`;
    const net = bulletin.salaireNet?.toLocaleString('fr-FR') ?? '—';

    await this.notificationsService.safeNotifyEmploye(
      bulletin.employeId,
      'Bulletin de paie disponible',
      `Votre bulletin de paie ${periode} est disponible (net à payer : ${net} FCFA). Consultez-le dans l'application.`,
      TypeNotification.paie,
      {
        paieId: bulletin.id,
        employeId: bulletin.employeId,
        mois: bulletin.mois,
        annee: bulletin.annee,
        statut: StatutPaie.paye,
      },
    );
  }

  private async getEmployeOrThrow(employeId: number): Promise<Employe> {
    const employe = await this.prisma.employe.findUnique({
      where: { id: employeId },
    });

    if (!employe) {
      throw new NotFoundException(`Employé #${employeId} introuvable`);
    }

    return employe;
  }
}
