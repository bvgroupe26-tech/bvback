import { Module } from '@nestjs/common';
import { PaieCalcService } from './paie-calc.service';
import { PaieController } from './paie.controller';
import { PaieService } from './paie.service';

@Module({
  controllers: [PaieController],
  providers: [PaieCalcService, PaieService],
  exports: [PaieCalcService, PaieService],
})
export class PaieModule {}
