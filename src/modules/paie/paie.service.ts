import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Employe, Paie, Prisma, StatutEmploye, StatutPaie } from '@prisma/client';
import { ActiviteService } from '../activite/activite.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePaieDto } from './dto/create-paie.dto';
import { GeneratePaieDto } from './dto/generate-paie.dto';
import { QueryPaieDto } from './dto/query-paie.dto';
import { UpdatePaieDto } from './dto/update-paie.dto';
import { CalcInput, PaieCalcService } from './paie-calc.service';
import {
  GeneratePaieResult,
  PaieEvolutionPoint,
  PaieStatsResponse,
  PaieWithEmploye,
  paieWithEmployeInclude,
} from './types/paie.types';

@Injectable()
export class PaieService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paieCalc: PaieCalcService,
    private readonly activiteService: ActiviteService,
  ) {}

  findAll(query: QueryPaieDto): Promise<PaieWithEmploye[]> {
    return this.prisma.paie.findMany({
      where: this.buildWhere(query),
      include: paieWithEmployeInclude,
      orderBy: [{ annee: 'desc' }, { mois: 'desc' }],
    });
  }

  async findOne(id: number): Promise<PaieWithEmploye> {
    const paie = await this.prisma.paie.findUnique({
      where: { id },
      include: paieWithEmployeInclude,
    });

    if (!paie) {
      throw new NotFoundException(`Bulletin de paie #${id} introuvable`);
    }

    return paie;
  }

  async findByUserId(userId: number): Promise<PaieWithEmploye[]> {
    const employe = await this.findEmployeByUserId(userId);

    return this.prisma.paie.findMany({
      where: { employeId: employe.id, statut: StatutPaie.paye },
      include: paieWithEmployeInclude,
      orderBy: [{ annee: 'desc' }, { mois: 'desc' }],
    });
  }

  generateBulletinText(bulletin: PaieWithEmploye): string {
    const emp = bulletin.employe;
    const nom = emp ? `${emp.nom} ${emp.prenom}` : `Employé #${bulletin.employeId}`;
    const brut =
      bulletin.salaireBase +
      bulletin.primeTransport +
      bulletin.primeLogement +
      bulletin.primePerformance +
      bulletin.autresPrimes;

    const lines = [
      '═══════════════════════════════════════════',
      '           BULLETIN DE PAIE',
      '═══════════════════════════════════════════',
      '',
      `Employé       : ${nom}`,
      `Poste         : ${emp?.poste ?? '-'}`,
      `Département   : ${emp?.departement ?? '-'}`,
      `Période       : ${bulletin.mois}/${bulletin.annee}`,
      '',
      '───────────────────────────────────────────',
      ' RÉMUNÉRATION',
      '───────────────────────────────────────────',
      `Salaire de base      : ${bulletin.salaireBase.toFixed(2)}`,
      `Prime transport      : ${bulletin.primeTransport.toFixed(2)}`,
      `Prime logement       : ${bulletin.primeLogement.toFixed(2)}`,
      `Prime performance    : ${bulletin.primePerformance.toFixed(2)}`,
      `Autres primes        : ${bulletin.autresPrimes.toFixed(2)}`,
      `TOTAL BRUT           : ${brut.toFixed(2)}`,
      '',
      '───────────────────────────────────────────',
      ' RETENUES',
      '───────────────────────────────────────────',
      `CNSS                 : ${bulletin.cnss.toFixed(2)}`,
      `Impôt                : ${bulletin.impot.toFixed(2)}`,
      `Autres retenues      : ${bulletin.autresRetenues.toFixed(2)}`,
      '',
      '═══════════════════════════════════════════',
      `NET À PAYER          : ${(bulletin.salaireNet ?? 0).toFixed(2)}`,
      '═══════════════════════════════════════════',
      '',
      `Statut : ${bulletin.statut}`,
      `Date paiement : ${bulletin.datePaiement ? new Date(bulletin.datePaiement).toLocaleDateString('fr-FR') : '-'}`,
    ];

    return lines.join('\n');
  }

  async createManual(dto: CreatePaieDto): Promise<PaieWithEmploye> {
    await this.assertNotExists(dto.employeId, dto.mois, dto.annee);

    const employe = await this.getEmployeOrThrow(dto.employeId);
    const calc = this.calcFromEmploye(employe, {
      salaireBase: dto.salaireBase,
      primeTransport: dto.primeTransport,
      primeLogement: dto.primeLogement,
      primePerformance: dto.primePerformance,
      autresPrimes: dto.autresPrimes,
      autresRetenues: dto.autresRetenues,
      cnss: dto.cnss,
      impot: dto.impot,
    });

    return this.prisma.paie.create({
      data: {
        employeId: dto.employeId,
        mois: dto.mois,
        annee: dto.annee,
        salaireBase: dto.salaireBase,
        primeTransport: dto.primeTransport,
        primeLogement: dto.primeLogement,
        primePerformance: dto.primePerformance,
        autresPrimes: dto.autresPrimes,
        cnss: calc.cnss,
        impot: calc.impot,
        autresRetenues: dto.autresRetenues,
        salaireNet: calc.salaireNet,
        statut: dto.statut ?? StatutPaie.en_attente,
        datePaiement:
          dto.statut === StatutPaie.paye ? new Date() : null,
      },
      include: paieWithEmployeInclude,
    });
  }

  async generateBulk(dto: GeneratePaieDto): Promise<GeneratePaieResult> {
    const employes = await this.prisma.employe.findMany({
      where: { statut: StatutEmploye.actif },
    });

    const bulletins: PaieWithEmploye[] = [];
    let skipped = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const employe of employes) {
        const exists = await tx.paie.findFirst({
          where: {
            employeId: employe.id,
            mois: dto.mois,
            annee: dto.annee,
          },
        });

        if (exists) {
          skipped++;
          continue;
        }

        const calc = this.calcFromEmploye(employe, {
          salaireBase: employe.salaireBase,
          primeTransport: employe.defPrimeTransport,
          primeLogement: employe.defPrimeLogement,
          primePerformance: employe.defPrimePerformance,
          autresPrimes: employe.defAutresPrimes,
          autresRetenues: 0,
        });

        const bulletin = await tx.paie.create({
          data: {
            employeId: employe.id,
            mois: dto.mois,
            annee: dto.annee,
            salaireBase: employe.salaireBase,
            primeTransport: employe.defPrimeTransport,
            primeLogement: employe.defPrimeLogement,
            primePerformance: employe.defPrimePerformance,
            autresPrimes: employe.defAutresPrimes,
            cnss: calc.cnss,
            impot: calc.impot,
            autresRetenues: 0,
            salaireNet: calc.salaireNet,
            statut: StatutPaie.en_attente,
          },
          include: paieWithEmployeInclude,
        });

        bulletins.push(bulletin);
      }
    });

    const result: GeneratePaieResult = {
      generated: bulletins.length,
      skipped,
      bulletins,
    };

    await this.activiteService.log(
      'paie_generee',
      `${result.generated} bulletins générés pour ${dto.mois}/${dto.annee}`,
      null,
      {
        mois: dto.mois,
        annee: dto.annee,
        count: result.generated,
        skipped: result.skipped,
      },
    );

    return result;
  }

  async update(id: number, dto: UpdatePaieDto): Promise<PaieWithEmploye> {
    const existing = await this.findOne(id);
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
    const calc = this.calcFromEmploye(employe, {
      salaireBase: merged.salaireBase,
      primeTransport: merged.primeTransport,
      primeLogement: merged.primeLogement,
      primePerformance: merged.primePerformance,
      autresPrimes: merged.autresPrimes,
      autresRetenues: merged.autresRetenues,
      cnss: dto.cnss,
      impot: dto.impot,
    });

    let datePaiement = existing.datePaiement;

    if (dto.statut !== undefined) {
      if (dto.statut === StatutPaie.paye) {
        datePaiement = new Date();
      } else if (
        dto.statut === StatutPaie.en_attente ||
        dto.statut === StatutPaie.annule
      ) {
        datePaiement = null;
      }
    }

    return this.prisma.paie.update({
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
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.prisma.paie.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async getStats(): Promise<PaieStatsResponse> {
    const [total, enAttente, paye, annule, netAgg, brutAgg] =
      await Promise.all([
        this.prisma.paie.count(),
        this.prisma.paie.count({ where: { statut: StatutPaie.en_attente } }),
        this.prisma.paie.count({ where: { statut: StatutPaie.paye } }),
        this.prisma.paie.count({ where: { statut: StatutPaie.annule } }),
        this.prisma.paie.aggregate({ _sum: { salaireNet: true } }),
        this.prisma.paie.aggregate({
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
    const keys = Object.keys(record).filter(
      (key) => record[key] !== undefined && record[key] !== null,
    );

    return (
      keys.length === 2 &&
      keys.includes('mois') &&
      keys.includes('annee') &&
      !('employeId' in record) &&
      !('employe_id' in record)
    );
  }

  private buildWhere(query: QueryPaieDto): Prisma.PaieWhereInput {
    const where: Prisma.PaieWhereInput = {};

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

  private async assertNotExists(
    employeId: number,
    mois: string,
    annee: number,
    excludeId?: number,
  ): Promise<void> {
    const existing = await this.prisma.paie.findFirst({
      where: { employeId, mois, annee },
    });

    if (existing && existing.id !== excludeId) {
      throw new ConflictException(
        `Un bulletin existe déjà pour l'employé #${employeId} (${mois}/${annee})`,
      );
    }
  }

  private async findEmployeByUserId(userId: number): Promise<Employe> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const employe = await this.prisma.employe.findFirst({
      where: { email: user.email },
    });

    if (!employe) {
      throw new NotFoundException(
        'Aucun employé associé à ce compte utilisateur',
      );
    }

    return employe;
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
