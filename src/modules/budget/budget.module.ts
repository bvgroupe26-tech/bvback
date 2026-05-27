import { Module } from '@nestjs/common';
import { BudgetController } from './budget.controller';
import { CategoriesService } from './categories.service';
import { DepensesService } from './depenses.service';
import { EnveloppesService } from './enveloppes.service';
import { SyntheseService } from './synthese.service';

@Module({
  controllers: [BudgetController],
  providers: [
    CategoriesService,
    EnveloppesService,
    DepensesService,
    SyntheseService,
  ],
  exports: [
    CategoriesService,
    EnveloppesService,
    DepensesService,
    SyntheseService,
  ],
})
export class BudgetModule {}
