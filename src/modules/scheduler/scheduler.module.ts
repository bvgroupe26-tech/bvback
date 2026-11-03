import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RefreshTokenCleanupTask } from './refresh-token-cleanup.task';

@Module({
  imports: [AuthModule],
  providers: [RefreshTokenCleanupTask],
})
export class SchedulerAppModule {}
