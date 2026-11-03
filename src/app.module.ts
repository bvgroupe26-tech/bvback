import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { GlobalAuthGuard } from './common/guards/global-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuthModule } from './modules/auth/auth.module';
import { AbsencesModule } from './modules/absences/absences.module';
import { EmployesModule } from './modules/employes/employes.module';
import { PaieModule } from './modules/paie/paie.module';
import { PaiePdfModule } from './modules/paie/pdf/paie-pdf.module';
import { PaieSettingsModule } from './modules/paie-settings/paie-settings.module';
import { BudgetModule } from './modules/budget/budget.module';
import { FournisseursModule } from './modules/fournisseurs/fournisseurs.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DeveloppementRhModule } from './modules/developpement-rh/developpement-rh.module';
import { RecrutementModule } from './modules/recrutement/recrutement.module';
import { PresencesModule } from './modules/presences/presences.module';
import { HealthModule } from './modules/health/health.module';
import { PublicModule } from './modules/public/public.module';
import { UsersModule } from './modules/users/users.module';
import { ActiviteModule } from './modules/activite/activite.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PushNotificationsModule } from './modules/push-notifications/push-notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { SchedulerAppModule } from './modules/scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    // Appliqué seulement aux routes d'auth via AuthThrottlerGuard (pas de guard global).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    PrismaModule,
    SchedulerAppModule,
    ActiviteModule,
    AuthModule,
    UsersModule,
    EmployesModule,
    PresencesModule,
    AbsencesModule,
    // Avant PaieModule : `paie/verify/:numero` ne doit pas être capté par une route `paie/:id/...`.
    PaiePdfModule,
    PaieModule,
    PaieSettingsModule,
    RecrutementModule,
    DeveloppementRhModule,
    DashboardModule,
    BudgetModule,
    FournisseursModule,
    DocumentsModule,
    NotificationsModule,
    PushNotificationsModule,
    HealthModule,
    PublicModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: GlobalAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
