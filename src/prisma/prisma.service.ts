import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from './prisma-client';

const SOFT_DELETE_MODELS = new Set([
  'User',
  'Employe',
  'Presence',
  'Absence',
  'Paie',
  'OffreEmploi',
  'Candidature',
  'Competence',
  'Formation',
  'Evaluation',
  'ActiviteLog',
  'BudgetCategorie',
  'BudgetEnveloppe',
  'BudgetDepense',
  'DocumentRh',
  'Notification',
  'PushSubscription',
]);

function withActiveOnly(
  where: unknown,
  uniqueOp = false,
): Record<string, unknown> {
  if (where === undefined || where === null) {
    return { deletedAt: null };
  }
  if (typeof where !== 'object' || Array.isArray(where)) {
    return { AND: [{ deletedAt: null }, where as object] };
  }
  const w = where as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(w, 'deletedAt')) {
    return w;
  }
  if (uniqueOp) {
    return { ...w, deletedAt: null };
  }
  return { AND: [{ deletedAt: null }, w] };
}

/** Client Prisma avec filtre deletedAt sur lectures / mises à jour (Prisma 6 : $extends). */
export function createPrismaClientWithSoftDelete(): PrismaClient {
  const base = new PrismaClient();
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) {
            return query(args);
          }
          const ops = new Set([
            'findMany',
            'findFirst',
            'findUnique',
            'count',
            'aggregate',
            'groupBy',
            'update',
            'updateMany',
            'upsert',
          ]);
          if (!ops.has(operation)) {
            return query(args);
          }
          const uniqueOps = new Set(['findUnique', 'update', 'upsert']);
          const nextArgs = { ...(args as Record<string, unknown>) };
          nextArgs.where = withActiveOnly(nextArgs.where, uniqueOps.has(operation));
          return query(nextArgs);
        },
      },
    },
  }) as unknown as PrismaClient;
}

/** Jeton d’injection — l’instance réelle vient de `prismaServiceProvider`. */
export class PrismaService extends PrismaClient {}

export const prismaServiceProvider = {
  provide: PrismaService,
  useFactory: (): PrismaClient => createPrismaClientWithSoftDelete(),
};

@Injectable()
export class PrismaLifecycle implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaLifecycle.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const maxAttempts = 5;
    const delayMs = 2000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.prisma.$connect();
        if (attempt > 1) {
          this.logger.log(`Connexion PostgreSQL établie (tentative ${attempt})`);
        }
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryable =
          message.includes("Can't reach database") ||
          message.includes('P1001');

        if (!retryable || attempt === maxAttempts) {
          throw error;
        }

        this.logger.warn(
          `PostgreSQL injoignable (tentative ${attempt}/${maxAttempts}), nouvel essai dans ${delayMs / 1000}s…`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
