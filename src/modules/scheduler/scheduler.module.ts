import { Module } from '@nestjs/common';
import { PeriodicDbTask } from './periodic-db.task';

@Module({
  providers: [PeriodicDbTask],
})
export class SchedulerAppModule {}
