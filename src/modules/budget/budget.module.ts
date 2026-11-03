import { Module } from '@nestjs/common';
import { BudgetController } from './budget.controller';
import { BudgetStorageService } from './budget-storage.service';
import { CategoriesService } from './categories.service';
import { DepenseWorkflowService } from './depense-workflow.service';
import { DepensesService } from './depenses.service';
import { EnveloppesService } from './enveloppes.service';
import { BudgetExportService } from './export.service';
import { ParametresFinanceService } from './parametres-finance.service';
import { SyntheseService } from './synthese.service';

@Module({
  controllers: [BudgetController],
  providers: [
    CategoriesService,
    EnveloppesService,
    DepensesService,
    DepenseWorkflowService,
    SyntheseService,
    BudgetExportService,
    ParametresFinanceService,
    BudgetStorageService,
  ],
  exports: [
    CategoriesService,
    EnveloppesService,
    DepensesService,
    SyntheseService,
    ParametresFinanceService,
  ],
})
export class BudgetModule {}
