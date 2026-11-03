import { Module } from '@nestjs/common';
import { PaieSettingsController } from './paie-settings.controller';
import { PaieSettingsService } from './paie-settings.service';

@Module({
  controllers: [PaieSettingsController],
  providers: [PaieSettingsService],
  exports: [PaieSettingsService],
})
export class PaieSettingsModule {}
