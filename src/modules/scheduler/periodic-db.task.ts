import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Tâche périodique : lit la base à intervalle fixe (défaut 2 min).
 * Désactiver : ENABLE_PERIODIC_DB_TASK=0 dans .env
 */
@Injectable()
export class PeriodicDbTask {
  private readonly logger = new Logger(PeriodicDbTask.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** 120 000 ms = 2 minutes */
  @Interval(120000)
  async run(): Promise<void> {
    const enabled = this.config.get<string>('ENABLE_PERIODIC_DB_TASK', '1');
    if (enabled === '0' || enabled === 'false') {
      return;
    }

    try {
      const [users, employes] = await Promise.all([
        this.prisma.user.count(),
        this.prisma.employe.count(),
      ]);

      this.logger.log(
        `Lecture périodique DB — utilisateurs: ${users}, employés: ${employes}`,
      );
      // Ici : ajouter d’autres requêtes métier (alertes, sync, stats cache, etc.)
    } catch (err) {
      this.logger.error('Échec lecture DB (tâche périodique)', err);
    }
  }
}
