import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ActiviteLogWithEmploye,
  activiteWithEmployeInclude,
} from './types/activite.types';

@Injectable()
export class ActiviteService {
  private readonly logger = new Logger(ActiviteService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(
    type: string,
    description: string,
    employeId?: number | null,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.activiteLog.create({
        data: {
          type,
          description,
          employeId: employeId ?? null,
          meta: meta ? (meta as Prisma.InputJsonValue) : undefined,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Impossible d'enregistrer l'activité [${type}] : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  findAll(limit = 50): Promise<ActiviteLogWithEmploye[]> {
    return this.prisma.activiteLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: activiteWithEmployeInclude,
    });
  }

  findByEmploye(employeId: number, limit = 20): Promise<ActiviteLogWithEmploye[]> {
    return this.prisma.activiteLog.findMany({
      where: { employeId },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: activiteWithEmployeInclude,
    });
  }
}
