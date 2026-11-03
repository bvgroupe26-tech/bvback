import { Module } from '@nestjs/common';
import { PayrollVariablesService } from '../variables/payroll-variables.service';
import { PayrollEngineContextService } from './engine-context.service';

@Module({
  providers: [PayrollEngineContextService, PayrollVariablesService],
  exports: [PayrollEngineContextService, PayrollVariablesService],
})
export class PaieEngineModule {}
