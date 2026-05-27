import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatutPresence } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePresenceDto } from './dto/create-presence.dto';
import { QueryPresencesDto } from './dto/query-presences.dto';
import { UpdatePresenceDto } from './dto/update-presence.dto';
import {
  PresenceWithEmploye,
  presenceWithEmployeInclude,
  PresencesStatsResponse,
} from './types/presence-with-employe.type';

@Injectable()
export class PresencesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: QueryPresencesDto): Promise<PresenceWithEmploye[]> {
    const where = this.buildWhere(query);

    return this.prisma.presence.findMany({
      where,
      include: presenceWithEmployeInclude,
      orderBy: { date: 'desc' },
      ...(query.limit ? { take: query.limit } : {}),
    });
  }

  findToday(): Promise<PresenceWithEmploye[]> {
    const today = new Date().toISOString().slice(0, 10);

    return this.findAll({ date: today });
  }

  async getStats(): Promise<PresencesStatsResponse> {
    const from = new Date();
    from.setDate(from.getDate() - 30);
    from.setHours(0, 0, 0, 0);

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

    const presence = await this.prisma.presence.create({
      data: {
        employeId: dto.employeId,
        date: new Date(dto.date),
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
    await this.findOne(id);

    if (dto.employeId !== undefined) {
      await this.assertEmployeExists(dto.employeId);
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
      conditions.push({ date: this.toDayRange(query.date) });
    } else if (query.date_from && query.date_to) {
      conditions.push({
        date: {
          gte: this.startOfDay(query.date_from),
          lte: this.endOfDay(query.date_to),
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

  private toDayRange(isoDate: string): Prisma.DateTimeFilter {
    return {
      gte: this.startOfDay(isoDate),
      lte: this.endOfDay(isoDate),
    };
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

  private toUpdateInput(dto: UpdatePresenceDto): Prisma.PresenceUpdateInput {
    const data: Prisma.PresenceUpdateInput = {};

    if (dto.employeId !== undefined) {
      data.employe = { connect: { id: dto.employeId } };
    }
    if (dto.date !== undefined) data.date = new Date(dto.date);
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
