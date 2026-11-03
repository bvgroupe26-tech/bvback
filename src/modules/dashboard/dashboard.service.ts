import { Injectable, NotFoundException } from '@nestjs/common';
import {
  StatutAbsence,
  StatutCandidature,
  StatutEmploye,
  StatutOffreEmploi,
  StatutPaie,
  StatutPresence,
  TypeFormation,
} from '@prisma/client';
import {
  addDays,
  endOfDayUTC,
  startOfDayUTC,
  todayISO,
} from '../../common/utils/date.util';
import { requireEmployeForUser } from '../../common/employe-link/employe-link';
import { PrismaService } from '../../prisma/prisma.service';
import { computeLeaveBalance } from '../absences/leave-balance';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ActiviteRecente,
  DashboardStatsResponse,
  DepartementStats,
  EmployeeDashboardResponse,
  PresencesChartDay,
  PublicStatsResponse,
  RecrutementPipeline,
  StatistiquesSyntheseResponse,
} from './types/dashboard.types';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getEmployeeDashboard(userId: number): Promise<EmployeeDashboardResponse> {
    const employe = await requireEmployeForUser(this.prisma, userId);

    const [balance, pendingLeaves, lastPaie, unreadNotifications] =
      await Promise.all([
        computeLeaveBalance(this.prisma, employe),
        this.prisma.absence.count({
          where: {
            employeId: employe.id,
            statut: StatutAbsence.en_attente,
          },
        }),
        this.prisma.paie.findFirst({
          where: { employeId: employe.id, statut: StatutPaie.paye },
          orderBy: [{ annee: 'desc' }, { mois: 'desc' }],
        }),
        this.notificationsService.countUnreadForUser(userId),
      ]);

    return {
      employe: {
        id: employe.id,
        nom: employe.nom,
        prenom: employe.prenom,
        poste: employe.poste,
        departement: employe.departement,
      },
      conges: {
        soldeRestant: balance.soldeRestant,
        demandesEnCours: pendingLeaves,
      },
      dernierePaie: lastPaie
        ? {
            mois: lastPaie.mois,
            annee: lastPaie.annee,
            salaireNet: lastPaie.salaireNet,
          }
        : null,
      notificationsNonLues: unreadNotifications,
    };
  }

  async getStats(): Promise<DashboardStatsResponse> {
    const today = todayISO();
    // createdAt est un horodatage réel : début du mois à minuit heure locale (UTC+1).
    const startOfMonth = new Date(`${today.slice(0, 7)}-01T00:00:00+01:00`);

    const startOfToday = startOfDayUTC(today);
    const endOfToday = endOfDayUTC(today);

    const [
      totalEmployes,
      actifsEmployes,
      nouveauxCeMois,
      presencesToday,
      presentsToday,
      absentsToday,
      masseSalarialeAgg,
      bulletinsEnAttente,
      offresOuvertes,
      candidaturesEnCours,
    ] = await Promise.all([
      this.prisma.employe.count({ where: { deletedAt: null } }),
      this.prisma.employe.count({ where: { statut: StatutEmploye.actif, deletedAt: null } }),
      this.prisma.employe.count({
        where: { createdAt: { gte: startOfMonth }, deletedAt: null },
      }),
      this.prisma.presence.count({
        where: { date: { gte: startOfToday, lte: endOfToday } },
      }),
      this.prisma.presence.count({
        where: {
          date: { gte: startOfToday, lte: endOfToday },
          statut: StatutPresence.present,
        },
      }),
      this.prisma.presence.count({
        where: {
          date: { gte: startOfToday, lte: endOfToday },
          statut: StatutPresence.absent,
        },
      }),
      this.prisma.employe.aggregate({
        where: { statut: StatutEmploye.actif, deletedAt: null },
        _sum: { salaireBase: true },
      }),
      this.prisma.paie.count({ where: { statut: StatutPaie.en_attente } }),
      this.prisma.offreEmploi.count({
        where: { statut: StatutOffreEmploi.ouverte },
      }),
      this.prisma.candidature.count({
        where: { statut: StatutCandidature.en_cours },
      }),
    ]);

    const tauxAujourdhui =
      presencesToday > 0
        ? Math.round((presentsToday / presencesToday) * 1000) / 10
        : 0;

    return {
      employes: {
        total: totalEmployes,
        actifs: actifsEmployes,
        nouveauxCeMois,
      },
      presences: {
        tauxAujourdhui,
        presents: presentsToday,
        absents: absentsToday,
      },
      paie: {
        masseSalarialeTotal: masseSalarialeAgg._sum.salaireBase ?? 0,
        bulletinsEnAttente,
      },
      recrutement: {
        offresOuvertes,
        candidaturesEnCours,
      },
    };
  }

  getPublicStats(): Promise<PublicStatsResponse> {
    return this.getStats().then((stats) => ({
      employes: {
        total: stats.employes.total,
        actifs: stats.employes.actifs,
      },
      presences: {
        tauxAujourdhui: stats.presences.tauxAujourdhui,
      },
      recrutement: stats.recrutement,
    }));
  }

  async getPresencesChart(): Promise<PresencesChartDay[]> {
    const todayStart = startOfDayUTC(todayISO());
    const from = addDays(todayStart, -29);

    const groups = await this.prisma.presence.groupBy({
      by: ['date', 'statut'],
      where: { date: { gte: from } },
      _count: { id: true },
    });

    const byDate = new Map<
      string,
      { presents: number; absents: number; retards: number }
    >();

    for (let i = 0; i < 30; i++) {
      const key = addDays(from, i).toISOString().slice(0, 10);
      byDate.set(key, { presents: 0, absents: 0, retards: 0 });
    }

    for (const row of groups) {
      const key = new Date(row.date).toISOString().slice(0, 10);
      const entry = byDate.get(key) ?? {
        presents: 0,
        absents: 0,
        retards: 0,
      };

      const count = row._count.id;

      if (row.statut === StatutPresence.present) {
        entry.presents += count;
      } else if (row.statut === StatutPresence.absent) {
        entry.absents += count;
      } else if (row.statut === StatutPresence.retard) {
        entry.retards += count;
      }

      byDate.set(key, entry);
    }

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({
        date,
        presents: counts.presents,
        absents: counts.absents,
        retards: counts.retards,
      }));
  }

  async getDepartements(): Promise<DepartementStats[]> {
    const thirtyDaysAgo = addDays(startOfDayUTC(todayISO()), -30);

    const [employes, presences] = await Promise.all([
      this.prisma.employe.findMany({
        where: { statut: StatutEmploye.actif },
        select: { id: true, departement: true, salaireBase: true },
      }),
      this.prisma.presence.findMany({
        where: { date: { gte: thirtyDaysAgo } },
        select: { employeId: true, statut: true },
      }),
    ]);

    const deptMap = new Map<
      string,
      { employeIds: number[]; masseSalariale: number }
    >();

    for (const emp of employes) {
      const dept = emp.departement ?? 'Non renseigné';
      const current = deptMap.get(dept) ?? {
        employeIds: [],
        masseSalariale: 0,
      };
      current.employeIds.push(emp.id);
      current.masseSalariale += emp.salaireBase;
      deptMap.set(dept, current);
    }

    const presenceByEmploye = new Map<number, { total: number; present: number }>();

    for (const p of presences) {
      const current = presenceByEmploye.get(p.employeId) ?? {
        total: 0,
        present: 0,
      };
      current.total++;
      if (p.statut === StatutPresence.present) current.present++;
      presenceByEmploye.set(p.employeId, current);
    }

    return Array.from(deptMap.entries())
      .map(([departement, data]) => {
        let totalPres = 0;
        let presentPres = 0;

        for (const empId of data.employeIds) {
          const stats = presenceByEmploye.get(empId);
          if (stats) {
            totalPres += stats.total;
            presentPres += stats.present;
          }
        }

        const tauxPresence =
          totalPres > 0
            ? Math.round((presentPres / totalPres) * 1000) / 10
            : 0;

        return {
          departement,
          effectif: data.employeIds.length,
          masseSalariale: Math.round(data.masseSalariale),
          tauxPresence,
        };
      })
      .sort((a, b) => b.effectif - a.effectif);
  }

  async getActiviteRecente(): Promise<ActiviteRecente[]> {
    const logs = await this.prisma.activiteLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        employe: {
          select: { nom: true, prenom: true },
        },
      },
    });

    return logs.map((log) => ({
      id: log.id,
      type: log.type,
      description: log.description,
      createdAt: log.createdAt,
      employe: log.employe,
    }));
  }

  async getRecrutementsPipeline(): Promise<RecrutementPipeline> {
    const groups = await this.prisma.candidature.groupBy({
      by: ['statut'],
      _count: { id: true },
    });

    const pipeline: RecrutementPipeline = {
      recu: 0,
      en_cours: 0,
      retenu: 0,
      rejete: 0,
    };

    for (const row of groups) {
      pipeline[row.statut] = row._count.id;
    }

    return pipeline;
  }

  async getSynthese(): Promise<StatistiquesSyntheseResponse> {
    const thirtyDaysAgo = addDays(startOfDayUTC(todayISO()), -30);

    const [
      totalEmployes,
      actifs,
      inactifs,
      suspendus,
      paieGroups,
      presences30,
      presents30,
      totalFormations,
      certifications,
      evaluationsAgg,
    ] = await Promise.all([
      this.prisma.employe.count(),
      this.prisma.employe.count({ where: { statut: StatutEmploye.actif } }),
      this.prisma.employe.count({ where: { statut: StatutEmploye.inactif } }),
      this.prisma.employe.count({ where: { statut: StatutEmploye.suspendu } }),
      this.prisma.paie.groupBy({
        by: ['mois', 'annee'],
        where: { statut: { not: StatutPaie.annule } },
        _sum: { salaireNet: true },
        orderBy: [{ annee: 'desc' }, { mois: 'desc' }],
        take: 12,
      }),
      this.prisma.presence.count({ where: { date: { gte: thirtyDaysAgo } } }),
      this.prisma.presence.count({
        where: {
          date: { gte: thirtyDaysAgo },
          statut: StatutPresence.present,
        },
      }),
      this.prisma.formation.count(),
      this.prisma.formation.count({
        where: { type: TypeFormation.certification },
      }),
      this.prisma.evaluation.aggregate({
        _avg: { noteGlobale: true },
      }),
    ]);

    const tauxMoyen30j =
      presences30 > 0
        ? Math.round((presents30 / presences30) * 1000) / 10
        : 0;

    return {
      effectifs: {
        total: totalEmployes,
        actifs,
        inactifs,
        suspendus,
      },
      paie: {
        masseSalariale12mois: paieGroups
          .map((row) => ({
            mois: row.mois,
            annee: row.annee,
            montant: row._sum.salaireNet ?? 0,
          }))
          .reverse(),
      },
      presences: { tauxMoyen30j },
      formations: {
        total: totalFormations,
        certifications,
      },
      evaluations: {
        moyenneGlobale:
          Math.round((evaluationsAgg._avg.noteGlobale ?? 0) * 100) / 100,
      },
    };
  }
}
