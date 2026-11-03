import { Module } from '@nestjs/common';
import { PaieVerifyController } from './paie-verify.controller';
import { PayslipPdfService } from './payslip-pdf.service';

@Module({
  controllers: [PaieVerifyController],
  providers: [PayslipPdfService],
  exports: [PayslipPdfService],
})
export class PaiePdfModule {}
