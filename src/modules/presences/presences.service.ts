import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StatutPresence } from '@prisma/client';
import {
  addDays,
  endOfDayUTC,
  parseDateOnly,
  startOfDayUTC,
  todayISO,
} from '../../common/utils/date.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePresenceDto } from './dto/create-presence.dto';
import { QueryPresencesDto } from './dto/query-presences.dto';
import { UpdatePresenceDto } from './dto/update-presence.dto';
import {
  PresenceWithEmploye,
  presenceWithEmployeInclude,
  PresencesStatsResponse,
} from './types/presence-with-employe.type';

const DEFAULT_PRESENCES_LIMIT = 1000;
const MAX_PRESENCES_LIMIT = 5000;

@Injectable()
export class PresencesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: QueryPresencesDto): Promise<PresenceWithEmploye[]> {
    const where = this.buildWhere(query);

    return this.prisma.presence.findMany({
      where,
      include: presenceWithEmployeInclude,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: Math.min(query.limit ?? DEFAULT_PRESENCES_LIMIT, MAX_PRESENCES_LIMIT),
      ...(query.offset ? { skip: query.offset } : {}),
    });
  }

  findToday(date?: string): Promise<PresenceWithEmploye[]> {
    return this.findAll({ date: date ?? todayISO(), limit: MAX_PRESENCES_LIMIT });
  }

  async getStats(): Promise<PresencesStatsResponse> {
    const from = addDays(startOfDayUTC(todayISO()), -30);

    const where: Prisma.PresenceWhereInput = {
      date: { gte: from },
    };

    const [total, presents, absents, retards, conges, missions, heuresAgg] =
      await Promise.all([
        this.prisma.presence.count({ where }),
        this.prisma.presence.count({
          where: { ...where, statut: StatutPresence.present },
        }),
        this.prisma.presence.count({
          where: { ...where, statut: StatutPresence.absent },
        }),
        this.prisma.presence.count({
          where: { ...where, statut: StatutPresence.retard },
        }),
        this.prisma.presence.count({
          where: { ...where, statut: StatutPresence.conge },
        }),
        this.prisma.presence.count({
          where: { ...where, statut: StatutPresence.mission },
        }),
        this.prisma.presence.aggregate({
          where,
          _sum: { heuresSupplementaires: true },
        }),
      ]);

    const tauxPresence =
      total > 0 ? ((presents / total) * 100).toFixed(1) : '0.0';

    return {
      total,
      presents,
      absents,
      retards,
      conges,
      missions,
      tauxPresence,
      heuresSupplementairesTotales:
        heuresAgg._sum.heuresSupplementaires ?? 0,
    };
  }

  async findOne(id: number): Promise<PresenceWithEmploye> {
    const presence = await this.prisma.presence.findUnique({
      where: { id },
      include: presenceWithEmployeInclude,
    });

    if (!presence) {
      throw new NotFoundException(`Présence #${id} introuvable`);
    }

    return presence;
  }

  async create(dto: CreatePresenceDto): Promise<PresenceWithEmploye> {
    await this.assertEmployeExists(dto.employeId);
    this.assertHeures(dto.heureEntree, dto.heureSortie);
    await this.assertNoDuplicate(dto.employeId, dto.date);

    const presence = await this.prisma.presence.create({
      data: {
        employeId: dto.employeId,
        date: parseDateOnly(dto.date),
        heureEntree: dto.heureEntree,
        heureSortie: dto.heureSortie,
        statut: dto.statut,
        justification: dto.justification,
        heuresSupplementaires: dto.heuresSupplementaires ?? 0,
      },
      include: presenceWithEmployeInclude,
    });

    return presence;
  }

  async update(id: number, dto: UpdatePresenceDto): Promise<PresenceWithEmploye> {
    const existing = await this.findOne(id);

    if (dto.employeId !== undefined) {
      await this.assertEmployeExists(dto.employeId);
    }

    this.assertHeures(
      dto.heureEntree !== undefined ? dto.heureEntree : existing.heureEntree,
      dto.heureSortie !== undefined ? dto.heureSortie : existing.heureSortie,
    );

    if (dto.employeId !== undefined || dto.date !== undefined) {
      await this.assertNoDuplicate(
        dto.employeId ?? existing.employeId,
        dto.date ?? existing.date,
        id,
      );
    }

    return this.prisma.presence.update({
      where: { id },
      data: this.toUpdateInput(dto),
      include: presenceWithEmployeInclude,
    });
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.prisma.presence.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private buildWhere(query: QueryPresencesDto): Prisma.PresenceWhereInput {
    const conditions: Prisma.PresenceWhereInput[] = [];

    if (query.date) {
      conditions.push({
        date: { gte: startOfDayUTC(query.date), lte: endOfDayUTC(query.date) },
      });
    } else if (query.date_from || query.date_to) {
      conditions.push({
        date: {
          ...(query.date_from ? { gte: startOfDayUTC(query.date_from) } : {}),
          ...(query.date_to ? { lte: endOfDayUTC(query.date_to) } : {}),
        },
      });
    }

    if (query.employe_id !== undefined) {
      conditions.push({ employeId: query.employe_id });
    }

    if (query.statut) {
      conditions.push({ statut: query.statut });
    }

    if (conditions.length === 0) {
      return {};
    }

    return { AND: conditions };
  }

  private assertHeures(entree?: string | null, sortie?: string | null): void {
    if (entree && sortie && sortie <= entree) {
      throw new BadRequestException(
        "L'heure de sortie doit être postérieure à l'heure d'entrée.",
      );
    }
  }

  private async assertNoDuplicate(
    employeId: number,
    date: string | Date,
    excludeId?: number,
  ): Promise<void> {
    const existing = await this.prisma.presence.findFirst({
      where: {
        employeId,
        date: { gte: startOfDayUTC(date), lte: endOfDayUTC(date) },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        'Un pointage existe déjà pour cet employé à cette date.',
      );
    }
  }

  private toUpdateInput(dto: UpdatePresenceDto): Prisma.PresenceUpdateInput {
    const data: Prisma.PresenceUpdateInput = {};

    if (dto.employeId !== undefined) {
      data.employe = { connect: { id: dto.employeId } };
    }
    if (dto.date !== undefined) data.date = parseDateOnly(dto.date);
    if (dto.heureEntree !== undefined) data.heureEntree = dto.heureEntree;
    if (dto.heureSortie !== undefined) data.heureSortie = dto.heureSortie;
    if (dto.statut !== undefined) data.statut = dto.statut;
    if (dto.justification !== undefined) data.justification = dto.justification;
    if (dto.heuresSupplementaires !== undefined) {
      data.heuresSupplementaires = dto.heuresSupplementaires;
    }

    return data;
  }

  private async assertEmployeExists(employeId: number): Promise<void> {
    const employe = await this.prisma.employe.findUnique({
      where: { id: employeId },
    });

    if (!employe) {
      throw new NotFoundException(`Employé #${employeId} introuvable`);
    }
  }
}
