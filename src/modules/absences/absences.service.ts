import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Absence,
  Employe,
  Prisma,
  StatutAbsence,
  TypeAbsence,
  TypeNotification,
} from '@prisma/client';
import {
  endOfDayUTC,
  parseDateOnly,
  startOfDayUTC,
} from '../../common/utils/date.util';
import { NotificationsService } from '../notifications/notifications.service';
import {
  findUserIdForEmploye,
  requireEmployeForUser,
} from '../../common/employe-link/employe-link';
import { assertNotSelf } from '../../common/self-action/self-action';
import { PrismaService } from '../../prisma/prisma.service';
import { absenceBusinessDays, computeLeaveBalance } from './leave-balance';
import { CreateAbsenceDto } from './dto/create-absence.dto';
import { QueryAbsencesDto } from './dto/query-absences.dto';
import { UpdateAbsenceDto } from './dto/update-absence.dto';
import {
  AbsenceDateRange,
  AbsenceWithEmploye,
  absenceWithEmployeInclude,
} from './types/absence-with-employe.type';

const VALIDER_SA_DEMANDE = 'approuver ou refuser votre propre demande d\'absence';

@Injectable()
export class AbsencesService {
  private readonly logger = new Logger(AbsencesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAll(query: QueryAbsencesDto): Promise<AbsenceWithEmploye[]> {
    const absences = await this.prisma.absence.findMany({
      where: this.buildWhere(query),
      include: absenceWithEmployeInclude,
      orderBy: { dateDebut: 'desc' },
    });
    return this.withDuree(absences);
  }

  private withDuree<T extends AbsenceDateRange>(absences: T[]): (T & { dureeJours: number })[] {
    return absences.map((a) => ({ ...a, dureeJours: absenceBusinessDays(a) }));
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

  /** Demande faite depuis « Mon espace » : toujours sur sa propre fiche, toujours en attente. */
  async createMine(userId: number, dto: CreateAbsenceDto): Promise<AbsenceWithEmploye> {
    const employe = await this.findEmployeByUserId(userId);
    return this.create({ ...dto, employeId: employe.id, statut: StatutAbsence.en_attente });
  }

  async create(dto: CreateAbsenceDto, actorUserId?: number): Promise<AbsenceWithEmploye> {
    const employe = await this.getEmployeOrThrow(dto.employeId);
    const statut = dto.statut ?? StatutAbsence.en_attente;
    if (actorUserId !== undefined && statut !== StatutAbsence.en_attente) {
      await assertNotSelf(this.prisma, actorUserId, dto.employeId, VALIDER_SA_DEMANDE);
    }
    const dateDebut = parseDateOnly(dto.dateDebut);
    const dateFin = parseDateOnly(dto.dateFin);

    await this.assertDemandeValide(employe, {
      dateDebut,
      dateFin,
      typeAbsence: dto.typeAbsence,
      statut,
      isNew: true,
    });

    const absence = await this.prisma.absence.create({
      data: {
        employeId: dto.employeId,
        dateDebut,
        dateFin,
        typeAbsence: dto.typeAbsence,
        justification: dto.justification,
        statut,
      },
      include: absenceWithEmployeInclude,
    });

    if (absence.statut === StatutAbsence.en_attente) {
      const nom = `${absence.employe.prenom} ${absence.employe.nom}`;
      // Un RH demandeur n'est pas notifié de sa propre demande : ce sont les autres RH qui la traitent.
      const demandeurUserId = await findUserIdForEmploye(this.prisma, absence.employeId);
      await this.notificationsService.safeNotifyRhTeam(
        'Nouvelle demande d\'absence',
        `${nom} a soumis une demande (${this.formatTypeAbsence(absence.typeAbsence)}) du ${this.formatDate(absence.dateDebut)} au ${this.formatDate(absence.dateFin)}.`,
        TypeNotification.conge,
        {
          absenceId: absence.id,
          employeId: absence.employeId,
          statut: absence.statut,
        },
        demandeurUserId ? [demandeurUserId] : [],
      );
    }

    return absence;
  }

  async update(
    id: number,
    dto: UpdateAbsenceDto,
    actorUserId?: number,
  ): Promise<AbsenceWithEmploye> {
    const existing = await this.findOne(id);
    const employe = await this.getEmployeOrThrow(dto.employeId ?? existing.employeId);
    if (actorUserId !== undefined && dto.statut !== undefined && dto.statut !== existing.statut) {
      await assertNotSelf(this.prisma, actorUserId, employe.id, VALIDER_SA_DEMANDE);
    }

    const dateDebut =
      dto.dateDebut !== undefined ? parseDateOnly(dto.dateDebut) : existing.dateDebut;
    const dateFin =
      dto.dateFin !== undefined ? parseDateOnly(dto.dateFin) : existing.dateFin;
    const touchesDemande =
      dto.dateDebut !== undefined ||
      dto.dateFin !== undefined ||
      dto.employeId !== undefined ||
      dto.typeAbsence !== undefined ||
      (dto.statut !== undefined && dto.statut !== existing.statut);

    if (touchesDemande) {
      await this.assertDemandeValide(employe, {
        dateDebut,
        dateFin,
        typeAbsence: dto.typeAbsence ?? existing.typeAbsence,
        statut: dto.statut ?? existing.statut,
        excludeId: id,
        isNew: false,
      });
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

    const absences = await this.prisma.absence.findMany({
      where: { employeId: employe.id },
      include: absenceWithEmployeInclude,
      orderBy: { dateDebut: 'desc' },
    });
    return this.withDuree(absences);
  }

  async getBalanceByUserId(userId: number) {
    const employe = await this.findEmployeByUserId(userId);
    const balance = await computeLeaveBalance(this.prisma, employe);

    return {
      annee: balance.annee,
      droitAnnuel: balance.droitAnnuel,
      joursPris: balance.joursPris,
      soldeRestant: balance.soldeRestant,
      detailParType: balance.detailParType,
      total: balance.droitAnnuel,
      pris: balance.congesPayesPris,
      restant: balance.soldeRestant,
      en_attente: balance.enAttente,
      unite: 'jours_ouvres' as const,
    };
  }

  /** Durée en jours ouvrés (lundi→vendredi). */
  getDureeJours(absence: AbsenceDateRange): number {
    return absenceBusinessDays(absence);
  }

  private async assertDemandeValide(
    employe: Employe,
    demande: {
      dateDebut: Date;
      dateFin: Date;
      typeAbsence: TypeAbsence;
      statut: StatutAbsence;
      excludeId?: number;
      isNew: boolean;
    },
  ): Promise<void> {
    const { dateDebut, dateFin, typeAbsence, statut, excludeId } = demande;

    if (dateFin < dateDebut) {
      throw new BadRequestException('dateFin doit être postérieure ou égale à dateDebut');
    }

    const active =
      statut === StatutAbsence.en_attente || statut === StatutAbsence.approuve;
    if (!active) return;

    const chevauchement = await this.prisma.absence.findFirst({
      where: {
        employeId: employe.id,
        statut: { in: [StatutAbsence.en_attente, StatutAbsence.approuve] },
        dateDebut: { lte: dateFin },
        dateFin: { gte: dateDebut },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, dateDebut: true, dateFin: true },
    });

    if (chevauchement) {
      throw new ConflictException(
        `Chevauchement avec l'absence #${chevauchement.id} du ${this.formatDate(chevauchement.dateDebut)} au ${this.formatDate(chevauchement.dateFin)}.`,
      );
    }

    if (typeAbsence !== TypeAbsence.conge_paye) return;

    const jours = absenceBusinessDays({ dateDebut, dateFin });
    const balance = await computeLeaveBalance(
      this.prisma,
      employe,
      dateDebut.getUTCFullYear(),
      excludeId,
    );
    // À la demande, on réserve aussi les jours déjà en attente ; à l'approbation, seuls les jours approuvés comptent.
    const disponible =
      statut === StatutAbsence.approuve
        ? balance.soldeRestant
        : balance.soldeRestant - balance.enAttente;

    if (jours > disponible) {
      throw new BadRequestException(
        `Solde de congés insuffisant : ${jours} jour(s) ouvré(s) demandé(s), ${Math.max(0, disponible)} disponible(s).`,
      );
    }
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
    if (dto.dateDebut !== undefined) data.dateDebut = parseDateOnly(dto.dateDebut);
    if (dto.dateFin !== undefined) data.dateFin = parseDateOnly(dto.dateFin);
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

  private findEmployeByUserId(userId: number): Promise<Employe> {
    return requireEmployeForUser(this.prisma, userId);
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

  private startOfDay(isoDate: string): Date {
    return startOfDayUTC(isoDate);
  }

  private endOfDay(isoDate: string): Date {
    return endOfDayUTC(isoDate);
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
