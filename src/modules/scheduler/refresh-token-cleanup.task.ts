import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { RefreshTokenService } from '../auth/refresh-token.service';

@Injectable()
export class RefreshTokenCleanupTask {
  private readonly logger = new Logger(RefreshTokenCleanupTask.name);

  constructor(
    private readonly refreshTokenService: RefreshTokenService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_WEEK, {
    name: 'refresh-token-cleanup',
    timeZone: process.env.PERIODIC_DB_TASK_TIMEZONE ?? 'Africa/Douala',
  })
  async run(): Promise<void> {
    const enabled = this.configService.get<string>(
      'ENABLE_REFRESH_TOKEN_CLEANUP',
      '1',
    );

    if (enabled === '0' || enabled === 'false') {
      return;
    }

    try {
      const deleted = await this.refreshTokenService.cleanupExpiredTokens();

      if (deleted > 0) {
        this.logger.log(
          `Nettoyage refresh tokens — ${deleted} entrée(s) supprimée(s)`,
        );
      }
    } catch (err) {
      this.logger.error('Échec nettoyage refresh tokens', err);
    }
  }
}
