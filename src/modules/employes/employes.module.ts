import { Module } from '@nestjs/common';
import { EmployesController } from './employes.controller';
import { EmployesService } from './employes.service';

@Module({
  controllers: [EmployesController],
  providers: [EmployesService],
  exports: [EmployesService],
})
export class EmployesModule {}
