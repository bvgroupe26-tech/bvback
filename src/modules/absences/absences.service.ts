import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Absence,
  Prisma,
  StatutAbsence,
  TypeAbsence,
  TypeNotification,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAbsenceDto } from './dto/create-absence.dto';
import { QueryAbsencesDto } from './dto/query-absences.dto';
import { UpdateAbsenceDto } from './dto/update-absence.dto';
import {
  AbsenceDateRange,
  AbsenceWithEmploye,
  absenceWithEmployeInclude,
} from './types/absence-with-employe.type';

@Injectable()
export class AbsencesService {
  private readonly logger = new Logger(AbsencesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  findAll(query: QueryAbsencesDto): Promise<AbsenceWithEmploye[]> {
    return this.prisma.absence.findMany({
      where: this.buildWhere(query),
      include: absenceWithEmployeInclude,
      orderBy: { dateDebut: 'desc' },
    });
  }

  async findOne(id: number): Promise<AbsenceWithEmploye> {
    const absence = await this.prisma.absence.findUnique({
      where: { id },
      include: absenceWithEmployeInclude,
    });

    if (!absence) {
      throw new NotFoundException(`Absence #${id} introuvable`);
    }

    return absence;
  }

  async create(dto: CreateAbsenceDto): Promise<AbsenceWithEmploye> {
    await this.assertEmployeExists(dto.employeId);

    const absence = await this.prisma.absence.create({
      data: {
        employeId: dto.employeId,
        dateDebut: new Date(dto.dateDebut),
        dateFin: new Date(dto.dateFin),
        typeAbsence: dto.typeAbsence,
        justification: dto.justification,
        statut: dto.statut ?? StatutAbsence.en_attente,
      },
      include: absenceWithEmployeInclude,
    });

    if (absence.statut === StatutAbsence.en_attente) {
      const nom = `${absence.employe.prenom} ${absence.employe.nom}`;
      await this.notificationsService.safeNotifyRhTeam(
        'Nouvelle demande d\'absence',
        `${nom} a soumis une demande (${this.formatTypeAbsence(absence.typeAbsence)}) du ${this.formatDate(absence.dateDebut)} au ${this.formatDate(absence.dateFin)}.`,
        TypeNotification.conge,
        {
          absenceId: absence.id,
          employeId: absence.employeId,
          statut: absence.statut,
        },
      );
    }

    return absence;
  }

  async update(id: number, dto: UpdateAbsenceDto): Promise<AbsenceWithEmploye> {
    const existing = await this.findOne(id);

    if (dto.employeId !== undefined) {
      await this.assertEmployeExists(dto.employeId);
    }

    const updated = await this.prisma.absence.update({
      where: { id },
      data: this.toUpdateInput(dto),
      include: absenceWithEmployeInclude,
    });

    if (dto.statut !== undefined && dto.statut !== existing.statut) {
      await this.logStatutChange(existing, dto.statut);
      await this.notifyAbsenceStatutChange(updated, dto.statut);
    }

    return updated;
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.prisma.absence.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findByEmployeUserId(userId: number): Promise<AbsenceWithEmploye[]> {
    const employe = await this.findEmployeByUserId(userId);

    return this.prisma.absence.findMany({
      where: { employeId: employe.id },
      include: absenceWithEmployeInclude,
      orderBy: { dateDebut: 'desc' },
    });
  }

  async getBalanceByUserId(userId: number) {
    const employe = await this.findEmployeByUserId(userId);
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

    const [absencesApprouvees, absencesEnAttente] = await Promise.all([
      this.prisma.absence.findMany({
        where: {
          employeId: employe.id,
          statut: StatutAbsence.approuve,
          dateDebut: { gte: startOfYear, lte: endOfYear },
        },
      }),
      this.prisma.absence.findMany({
        where: {
          employeId: employe.id,
          statut: StatutAbsence.en_attente,
          dateDebut: { gte: startOfYear, lte: endOfYear },
        },
      }),
    ]);

    const ANNUAL_LEAVE_DAYS = 30;

    let joursPris = 0;
    const parType: Record<string, number> = {};

    for (const absence of absencesApprouvees) {
      const jours = this.getDureeJours(absence);
      joursPris += jours;
      const key = absence.typeAbsence;
      parType[key] = (parType[key] ?? 0) + jours;
    }

    const congesPayesPris = parType[TypeAbsence.conge_paye] ?? 0;
    const enAttente = absencesEnAttente.reduce(
      (sum, a) => sum + this.getDureeJours(a),
      0,
    );

    return {
      annee: currentYear,
      droitAnnuel: ANNUAL_LEAVE_DAYS,
      joursPris,
      soldeRestant: Math.max(0, ANNUAL_LEAVE_DAYS - congesPayesPris),
      detailParType: parType,
      total: ANNUAL_LEAVE_DAYS,
      pris: congesPayesPris,
      restant: Math.max(0, ANNUAL_LEAVE_DAYS - congesPayesPris),
      en_attente: enAttente,
    };
  }

  getDureeJours(absence: AbsenceDateRange): number {
    const debut = new Date(absence.dateDebut);
    const fin = new Date(absence.dateFin);

    debut.setHours(0, 0, 0, 0);
    fin.setHours(0, 0, 0, 0);

    const diffMs = fin.getTime() - debut.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    return diffDays + 1;
  }

  private buildWhere(query: QueryAbsencesDto): Prisma.AbsenceWhereInput {
    const conditions: Prisma.AbsenceWhereInput[] = [];

    if (query.employe_id !== undefined) {
      conditions.push({ employeId: query.employe_id });
    }

    if (query.statut) {
      conditions.push({ statut: query.statut });
    }

    if (query.type_absence) {
      conditions.push({ typeAbsence: query.type_absence });
    }

    if (query.date_from && query.date_to) {
      conditions.push({
        dateDebut: { lte: this.endOfDay(query.date_to) },
        dateFin: { gte: this.startOfDay(query.date_from) },
      });
    } else if (query.date_from) {
      conditions.push({ dateFin: { gte: this.startOfDay(query.date_from) } });
    } else if (query.date_to) {
      conditions.push({ dateDebut: { lte: this.endOfDay(query.date_to) } });
    }

    if (conditions.length === 0) {
      return {};
    }

    return { AND: conditions };
  }

  private toUpdateInput(dto: UpdateAbsenceDto): Prisma.AbsenceUpdateInput {
    const data: Prisma.AbsenceUpdateInput = {};

    if (dto.employeId !== undefined) {
      data.employe = { connect: { id: dto.employeId } };
    }
    if (dto.dateDebut !== undefined) data.dateDebut = new Date(dto.dateDebut);
    if (dto.dateFin !== undefined) data.dateFin = new Date(dto.dateFin);
    if (dto.typeAbsence !== undefined) data.typeAbsence = dto.typeAbsence;
    if (dto.justification !== undefined) data.justification = dto.justification;
    if (dto.statut !== undefined) data.statut = dto.statut;

    return data;
  }

  private async logStatutChange(
    absence: Absence,
    nouveauStatut: StatutAbsence,
  ): Promise<void> {
    try {
      await this.prisma.activiteLog.create({
        data: {
          type: 'absence_statut',
          description: `Absence #${absence.id} : ${absence.statut} → ${nouveauStatut}`,
          employeId: absence.employeId,
          meta: {
            absenceId: absence.id,
            ancienStatut: absence.statut,
            nouveauStatut,
            typeAbsence: absence.typeAbsence,
            dureeJours: this.getDureeJours(absence),
          },
        },
      });
    } catch (error) {
      this.logger.warn(
        `Impossible d'enregistrer l'activité pour l'absence #${absence.id}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async findEmployeByUserId(userId: number) {
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

  private async assertEmployeExists(employeId: number): Promise<void> {
    const employe = await this.prisma.employe.findUnique({
      where: { id: employeId },
    });

    if (!employe) {
      throw new NotFoundException(`Employé #${employeId} introuvable`);
    }
  }

  private startOfDay(isoDate: string): Date {
    const date = new Date(isoDate);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private endOfDay(isoDate: string): Date {
    const date = new Date(isoDate);
    date.setHours(23, 59, 59, 999);
    return date;
  }

  private async notifyAbsenceStatutChange(
    absence: AbsenceWithEmploye,
    nouveauStatut: StatutAbsence,
  ): Promise<void> {
    if (
      nouveauStatut !== StatutAbsence.approuve &&
      nouveauStatut !== StatutAbsence.refuse
    ) {
      return;
    }

    const libelle =
      nouveauStatut === StatutAbsence.approuve ? 'acceptée' : 'refusée';

    await this.notificationsService.safeNotifyEmploye(
      absence.employeId,
      `Demande d'absence ${libelle}`,
      `Votre demande du ${this.formatDate(absence.dateDebut)} au ${this.formatDate(absence.dateFin)} (${this.formatTypeAbsence(absence.typeAbsence)}) a été ${libelle} par la RH.`,
      TypeNotification.conge,
      {
        absenceId: absence.id,
        employeId: absence.employeId,
        statut: nouveauStatut,
      },
    );
  }

  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('fr-FR');
  }

  private formatTypeAbsence(type: TypeAbsence): string {
    const labels: Record<TypeAbsence, string> = {
      maladie: 'maladie',
      conge_paye: 'congé payé',
      conge_sans_solde: 'congé sans solde',
      maternite: 'maternité',
      paternite: 'paternité',
      autre: 'autre',
    };
    return labels[type] ?? type;
  }
}
