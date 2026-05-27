import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardPublicController } from './public.controller';
import { StatistiquesController } from './statistiques.controller';

@Module({
  controllers: [
    DashboardController,
    StatistiquesController,
    DashboardPublicController,
  ],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
