import { Module } from '@nestjs/common';
import { EmployesController } from './employes.controller';
import { EmployesService } from './employes.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [EmployesController],
  providers: [EmployesService],
  exports: [EmployesService],
})
export class EmployesModule {}
