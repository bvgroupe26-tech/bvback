import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PeriodicDbTask } from './periodic-db.task';
import { RefreshTokenCleanupTask } from './refresh-token-cleanup.task';

@Module({
  imports: [AuthModule],
  providers: [PeriodicDbTask, RefreshTokenCleanupTask],
})
export class SchedulerAppModule {}
