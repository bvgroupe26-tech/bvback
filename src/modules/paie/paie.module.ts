import { Module } from '@nestjs/common';
import { PaieSettingsModule } from '../paie-settings/paie-settings.module';
import { PaieEngineModule } from './engine/paie-engine.module';
import { PaieCalcService } from './paie-calc.service';
import { PaieController } from './paie.controller';
import { PaieService } from './paie.service';
import { PaiePdfModule } from './pdf/paie-pdf.module';
import { PayrollPeriodsController } from './periods/payroll-periods.controller';
import { PayrollPeriodsService } from './periods/payroll-periods.service';

@Module({
  imports: [PaieEngineModule, PaiePdfModule, PaieSettingsModule],
  // Périodes d'abord : `paie/periodes` ne doit pas être capté par `paie/:id`.
  controllers: [PayrollPeriodsController, PaieController],
  providers: [PaieCalcService, PaieService, PayrollPeriodsService],
  exports: [PaieCalcService, PaieService],
})
export class PaieModule {}
